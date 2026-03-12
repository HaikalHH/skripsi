import { reportingMonthlyPdfRequestSchema } from "@finance/shared";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { buildFinancialHealthReply } from "@/lib/services/planning/financial-health-service";
import { getSavingsGoalStatus } from "@/lib/services/planning/goal-service";
import { getUserPortfolioValuation } from "@/lib/services/market/portfolio-valuation-service";
import { formatMoney, formatPercent } from "@/lib/services/shared/money-format";
import { analyzeRecurringExpenses } from "@/lib/services/transactions/recurring-expense-service";
import { normalizeExpenseBucketCategory } from "@/lib/services/transactions/category-override-service";
import type { ReportDateRange } from "@/lib/services/reporting/report-service";

type MonthlyReportData = {
  periodLabel: string;
  incomeTotal: number;
  expenseTotal: number;
  categoryBreakdown: Array<{ category: string; total: number }>;
};

const sanitizeFilePart = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const splitReplyLines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const buildBudgetSection = async (params: {
  userId: string;
  expenseTransactions: Array<{ category: string; amount: unknown }>;
}) => {
  const budgets = await prisma.budget.findMany({
    where: { userId: params.userId },
    orderBy: { updatedAt: "desc" }
  });
  if (!budgets.length) return null;

  const spentByCategory = new Map<string, number>();
  for (const transaction of params.expenseTransactions) {
    const category = normalizeExpenseBucketCategory(transaction.category);
    spentByCategory.set(category, (spentByCategory.get(category) ?? 0) + toNumber(transaction.amount));
  }

  const latestBudgetByCategory = new Map<string, (typeof budgets)[number]>();
  for (const budget of budgets) {
    const category = normalizeExpenseBucketCategory(budget.category);
    if (!latestBudgetByCategory.has(category)) {
      latestBudgetByCategory.set(category, budget);
    }
  }

  const lines = Array.from(latestBudgetByCategory.entries())
    .slice(0, 6)
    .map(([category, budget]) => {
      const limit = toNumber(budget.monthlyLimit);
      const spent = spentByCategory.get(category) ?? 0;
      const usage = limit > 0 ? (spent / limit) * 100 : 0;
      return `${category}: ${formatMoney(spent)} / ${formatMoney(limit)} (${usage.toFixed(1)}%)`;
    });

  return lines.length ? { title: "Budget Bulanan", lines } : null;
};

const buildGoalSection = async (userId: string) => {
  const goalStatus = await getSavingsGoalStatus(userId);
  if (goalStatus.targetAmount <= 0 || !goalStatus.goals.length) return null;

  if (goalStatus.totalGoals > 1) {
    return {
      title: "Progress Goal",
      lines: goalStatus.goals.slice(0, 5).map(
        (goal, index) =>
          `${index + 1}. ${goal.goalName} | ${formatPercent(goal.progressPercent)} | sisa ${formatMoney(
            goal.remainingAmount
          )}${goal.estimatedMonthsToGoal != null ? ` | eta ${goal.estimatedMonthsToGoal.toFixed(1)} bln` : ""}${
            goal.trackingStatus ? ` | ${goal.trackingStatus}` : ""
          }`
      )
    };
  }

  return {
    title: "Progress Goal",
    lines: [
      `${goalStatus.goalName ?? "Goal utama"} | ${formatPercent(goalStatus.progressPercent)} | sisa ${formatMoney(
        goalStatus.remainingAmount
      )}${goalStatus.estimatedMonthsToGoal != null ? ` | eta ${goalStatus.estimatedMonthsToGoal.toFixed(1)} bln` : ""}`,
      `Status tracking: ${goalStatus.trackingStatus}`,
      ...(goalStatus.contributionMonthStreak > 0
        ? [`Streak kontribusi: ${goalStatus.contributionMonthStreak} bulan`]
        : [])
    ]
  };
};

const buildPortfolioSection = async (userId: string) => {
  const snapshot = await getUserPortfolioValuation(userId);
  if (!snapshot.items.length) return null;

  return {
    title: "Portfolio & Aset",
    lines: [
      `Nilai saat ini: ${formatMoney(snapshot.totalCurrentValue)}`,
      `Unrealized P/L: ${snapshot.totalUnrealizedGain >= 0 ? "+" : "-"}${formatMoney(
        Math.abs(snapshot.totalUnrealizedGain)
      )}`,
      `Holding terbesar: ${snapshot.topHoldingName ?? "-"} (${snapshot.largestAssetShare.toFixed(1)}%)`,
      `Tipe dominan: ${snapshot.dominantType ?? "-"} (${snapshot.dominantTypeShare.toFixed(1)}%)`,
      `Likuid: ${snapshot.liquidSharePercent.toFixed(1)}% | Diversifikasi: ${snapshot.diversificationScore.toFixed(1)}/100`,
      `Status rebalance: ${snapshot.rebalanceStatus}`
    ]
  };
};

const buildRecurringSection = (expenseTransactions: Array<{
  category: string;
  amount: unknown;
  occurredAt: Date;
  detailTag?: string | null;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
}>) => {
  const recurringEntries = analyzeRecurringExpenses(
    expenseTransactions.map((transaction) => ({
      amount: toNumber(transaction.amount),
      category: transaction.category,
      occurredAt: transaction.occurredAt,
      merchant: transaction.merchant ?? null,
      note: transaction.note ?? null,
      rawText: transaction.rawText ?? null
    }))
  ).slice(0, 3);

  if (!recurringEntries.length) return null;

  return {
    title: "Recurring & Kebiasaan",
    lines: recurringEntries.map(
      (entry) =>
        `${entry.label} | ${entry.bucket} | ${entry.count} transaksi | total ${formatMoney(entry.total)}${
          entry.isSubscriptionLikely ? " | langganan" : ""
        }`
    )
  };
};

export const buildMonthlyReportPdfAttachment = async (params: {
  userId: string;
  dateRange: ReportDateRange;
  reportData: MonthlyReportData;
}) => {
  const expenseTransactions = await prisma.transaction.findMany({
    where: {
      userId: params.userId,
      type: "EXPENSE",
      occurredAt: {
        gte: params.dateRange.start,
        lte: params.dateRange.end
      }
    },
    orderBy: { occurredAt: "asc" }
  });

  const healthReply = await buildFinancialHealthReply({
    userId: params.userId,
    mode: "CLOSING",
    dateRange: params.dateRange
  });
  const topCategory = params.reportData.categoryBreakdown[0] ?? null;
  const totalTransactions = expenseTransactions.length;
  const balance = params.reportData.incomeTotal - params.reportData.expenseTotal;
  const savingRate =
    params.reportData.incomeTotal > 0 ? (balance / params.reportData.incomeTotal) * 100 : 0;

  const sections = [
    {
      title: "Ringkasan Pengeluaran",
      lines: params.reportData.categoryBreakdown.slice(0, 6).map(
        (item, index) => `${index + 1}. ${item.category}: ${formatMoney(item.total)}`
      )
    },
    await buildBudgetSection({
      userId: params.userId,
      expenseTransactions
    }),
    await buildGoalSection(params.userId),
    await buildPortfolioSection(params.userId),
    buildRecurringSection(expenseTransactions),
    {
      title: "Financial Closing",
      lines: splitReplyLines(healthReply).slice(0, 12)
    }
  ].filter(Boolean) as Array<{ title: string; lines: string[] }>;

  const payload = reportingMonthlyPdfRequestSchema.parse({
    title: "Monthly Finance Report",
    subtitle: params.reportData.periodLabel,
    periodLabel: params.reportData.periodLabel,
    summaryLines: [
      `Income: ${formatMoney(params.reportData.incomeTotal)}`,
      `Expense: ${formatMoney(params.reportData.expenseTotal)}`,
      `Sisa cashflow: ${formatMoney(balance)}`,
      `Saving rate: ${formatPercent(savingRate)}`,
      `Jumlah transaksi expense: ${totalTransactions}`,
      topCategory ? `Top kategori: ${topCategory.category} (${formatMoney(topCategory.total)})` : "Top kategori: -"
    ],
    sections
  });

  const response = await fetch(`${env.REPORTING_SERVICE_URL}/reports/monthly-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Reporting service PDF error: ${response.status} ${errorBody}`);
  }

  const pdfBuffer = Buffer.from(await response.arrayBuffer());
  return {
    documentBase64: pdfBuffer.toString("base64"),
    documentMimeType: "application/pdf",
    documentFileName: `laporan-keuangan-${sanitizeFilePart(params.reportData.periodLabel)}.pdf`
  };
};
