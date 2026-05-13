import { prisma } from "@/lib/prisma";
import { formatMoney, formatPercent } from "@/lib/services/shared/money";
import { getSavingsGoalStatus } from "@/lib/services/planning/goal";
import type { ReportDateRange } from "@/lib/services/reporting/report-builder";
import { DATE_LABEL_FORMATTER, getEffectiveRange } from "./date-range";
import { getHealthVerdict, getScoreGrade } from "./scoring";
import type { FinancialHealthMode } from "./types";
import { getTopExpenseCategory, toNumber } from "./utils";

export const buildFinancialHealthReply = async (params: {
  userId: string;
  mode: FinancialHealthMode;
  dateRange?: ReportDateRange | null;
}) => {
  const range = getEffectiveRange(params.dateRange);
  const [transactions, budgets, goalStatus, financialProfile, assets] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId: params.userId,
        occurredAt: {
          gte: range.start,
          lte: range.end
        }
      },
      orderBy: { occurredAt: "asc" }
    }),
    prisma.budget.findMany({
      where: { userId: params.userId },
      orderBy: { updatedAt: "desc" }
    }),
    getSavingsGoalStatus(params.userId),
    (prisma as unknown as { financialProfile?: any }).financialProfile?.findUnique({
      where: { userId: params.userId }
    }) ?? Promise.resolve(null),
    (prisma as unknown as { asset?: any }).asset?.findMany({
      where: {
        userId: params.userId,
        assetType: {
          in: ["CASH", "SAVINGS"]
        }
      },
      select: { estimatedValue: true }
    }) ?? Promise.resolve([])
  ]);

  const transactionIncome = transactions
    .filter((transaction) => transaction.type === "INCOME")
    .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  const transactionExpense = transactions
    .filter((transaction) => transaction.type === "EXPENSE")
    .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  const income = transactionIncome;
  const expense = transactionExpense;
  const balance = income - expense;
  const savingsRate = income > 0 ? (balance / income) * 100 : 0;
  const transactionTopCategory = getTopExpenseCategory(
    transactions.filter((transaction) => transaction.type === "EXPENSE")
  );

  const latestBudgetByCategory = new Map<string, { category: string; monthlyLimit: number }>();
  for (const budget of budgets) {
    if (!latestBudgetByCategory.has(budget.category)) {
      latestBudgetByCategory.set(budget.category, {
        category: budget.category,
        monthlyLimit: toNumber(budget.monthlyLimit)
      });
    }
  }
  const overspentCategories = Array.from(latestBudgetByCategory.values())
    .map((budget) => {
      const spent = transactions
        .filter((transaction) => transaction.type === "EXPENSE" && transaction.category === budget.category)
        .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
      return {
        category: budget.category,
        spent,
        overBy: spent - budget.monthlyLimit
      };
    })
    .filter((item) => item.overBy > 0)
    .sort((left, right) => right.overBy - left.overBy);

  const liquidAssetValue = (assets as Array<{ estimatedValue: unknown }>).reduce(
    (sum: number, asset) => sum + toNumber(asset.estimatedValue),
    0
  );
  const monthlyExpenseBaseline = expense;
  const emergencyFundTarget = toNumber(financialProfile?.emergencyFundTarget ?? 0);
  const emergencyFundProgress =
    goalStatus.goals.find((goal) => goal.goalType === "EMERGENCY_FUND")?.currentProgress ??
    goalStatus.currentProgress;
  const emergencyFundRatio =
    emergencyFundTarget > 0 ? Math.max(0, Math.min(1, emergencyFundProgress / emergencyFundTarget)) : 0;
  const liquidMonthsCoverage =
    monthlyExpenseBaseline > 0 ? liquidAssetValue / monthlyExpenseBaseline : balance > 0 ? 1 : 0;

  const cashflowScore =
    income > 0
      ? Math.max(0, Math.min(30, balance >= 0 ? 18 + (balance / income) * 12 : 18 + (balance / income) * 20))
      : balance >= 0
        ? 15
        : 0;
  const savingsScore =
    income > 0 ? Math.max(0, Math.min(25, savingsRate <= 0 ? 0 : 10 + (savingsRate / 25) * 15)) : 6;
  const budgetScore =
    latestBudgetByCategory.size > 0
      ? Math.max(0, 15 - overspentCategories.length * 4 - Math.min(6, overspentCategories.length))
      : 8;
  const emergencyScore =
    emergencyFundTarget > 0 ? Math.max(0, Math.min(15, emergencyFundRatio * 15)) : monthlyExpenseBaseline > 0 ? 6 : 0;
  const bufferScore = Math.max(0, Math.min(15, (liquidMonthsCoverage / 3) * 15));
  const healthScore = Math.round(cashflowScore + savingsScore + budgetScore + emergencyScore + bufferScore);
  const grade = getScoreGrade(healthScore);

  const strengths = [
    ...(balance > 0 ? [`Cashflow masih positif dengan sisa ${formatMoney(balance)}.`] : []),
    ...(savingsRate >= 15 ? [`Saving rate ${formatPercent(savingsRate, 1)} sudah cukup kuat.`] : []),
    ...(overspentCategories.length === 0 && latestBudgetByCategory.size > 0
      ? ["Belum ada kategori budget yang jebol di periode ini."]
      : []),
    ...(liquidMonthsCoverage >= 1
      ? [`Likuiditas setara ${liquidMonthsCoverage.toFixed(1)} bulan pengeluaran.`]
      : [])
  ].slice(0, 3);

  const watchouts = [
    ...(balance < 0 ? [`Cashflow negatif ${formatMoney(Math.abs(balance))}.`] : []),
    ...(overspentCategories[0]
      ? [
          `Kategori ${overspentCategories[0].category} lewat budget ${formatMoney(
            overspentCategories[0].overBy
          )}.`
        ]
      : []),
    ...(transactionTopCategory
      ? [`Kategori pengeluaran terbesar masih ${transactionTopCategory[0]} sebesar ${formatMoney(transactionTopCategory[1])}.`]
      : []),
    ...(emergencyFundTarget > 0 && emergencyFundRatio < 0.5
      ? [`Dana darurat baru ${formatPercent(emergencyFundRatio * 100, 1)} dari target.`]
      : [])
  ].slice(0, 3);

  if (params.mode === "SCORE") {
    return [
      `Skor kesehatan keuangan untuk ${range.label}: ${healthScore}/100 (grade ${grade}).`,
      `- Kondisi umum: ${getHealthVerdict(healthScore)}`,
      `- Pemasukan: ${formatMoney(income)}`,
      `- Pengeluaran: ${formatMoney(expense)}`,
      `- Saldo: ${formatMoney(balance)}`,
      `- Saving rate: ${formatPercent(savingsRate, 1)}`,
      `- Komponen skor: cashflow ${cashflowScore.toFixed(0)}, saving ${savingsScore.toFixed(
        0
      )}, budget ${budgetScore.toFixed(0)}, dana darurat ${emergencyScore.toFixed(0)}, buffer ${bufferScore.toFixed(0)}`,
      ...(strengths.length ? ["- Yang sudah bagus:", ...strengths.map((item) => `  - ${item}`)] : []),
      ...(watchouts.length ? ["- Yang perlu dibenahi:", ...watchouts.map((item) => `  - ${item}`)] : [])
    ].join("\n");
  }

  return [
    `Closing keuangan ${range.label}:`,
    `- Rentang: ${DATE_LABEL_FORMATTER.format(range.start)} s.d. ${DATE_LABEL_FORMATTER.format(range.end)}`,
    `- Income: ${formatMoney(income)}`,
    `- Expense: ${formatMoney(expense)}`,
    `- Net saving: ${formatMoney(balance)}`,
    `- Saving rate: ${formatPercent(savingsRate, 1)}`,
    `- Health score: ${healthScore}/100 (grade ${grade})`,
    ...(transactionTopCategory ? [`- Kategori terbesar: ${transactionTopCategory[0]} (${formatMoney(transactionTopCategory[1])})`] : []),
    ...(strengths.length ? ["- Highlight positif:", ...strengths.map((item) => `  - ${item}`)] : []),
    ...(watchouts.length ? ["- Fokus bulan berikutnya:", ...watchouts.map((item) => `  - ${item}`)] : [])
  ].join("\n");
};
