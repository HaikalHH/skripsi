import { prisma } from "../prisma";
import { generateAIFinancialAdvice } from "./ai-service";
import { getSavingsGoalStatus } from "./goal-service";

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const normalizeCategory = (value: string) => value.trim().replace(/\s+/g, " ");

const getMonthRange = (baseDate: Date) => {
  const start = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = baseDate;
  return { start, end };
};

const parseAmountFromQuestion = (question: string): number | null => {
  const lower = question.toLowerCase();
  const match = lower.match(/(\d[\d.,]*)\s*(jt|juta|rb|ribu|k)?/);
  if (!match) return null;

  const rawNumber = match[1].replace(/\./g, "").replace(",", ".");
  const parsed = Number(rawNumber);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  const unit = match[2];
  if (unit === "jt" || unit === "juta") return parsed * 1_000_000;
  if (unit === "rb" || unit === "ribu" || unit === "k") return parsed * 1_000;
  return parsed;
};

const isPurchaseQuestion = (question: string) =>
  /(boleh beli|beli|buy|afford|mampu|aman beli)/i.test(question);

const buildRuleBasedAdvice = (params: {
  income: number;
  expense: number;
  balance: number;
  topExpenseCategory: string | null;
  topExpenseAmount: number;
  overspentCategories: Array<{ category: string; overBy: number }>;
  goalStatus: {
    targetAmount: number;
    currentProgress: number;
    remainingAmount: number;
    progressPercent: number;
  };
  userQuestion: string;
}) => {
  const descriptive = `Deskriptif: bulan ini pemasukan ${params.income.toFixed(
    2
  )}, pengeluaran ${params.expense.toFixed(2)}, saldo ${params.balance.toFixed(2)}.`;

  const diagnosticParts: string[] = [];
  if (params.topExpenseCategory) {
    diagnosticParts.push(
      `pengeluaran terbesar ada di kategori ${params.topExpenseCategory} (${params.topExpenseAmount.toFixed(
        2
      )}).`
    );
  } else {
    diagnosticParts.push("belum ada pola kategori pengeluaran yang dominan.");
  }
  if (params.overspentCategories.length) {
    const topOver = params.overspentCategories[0];
    diagnosticParts.push(
      `budget kategori ${topOver.category} melewati limit sebesar ${topOver.overBy.toFixed(2)}.`
    );
  }
  const diagnostic = `Diagnostik: ${diagnosticParts.join(" ")}`;

  let prescriptive = "";
  const purchaseAmount = parseAmountFromQuestion(params.userQuestion);
  if (isPurchaseQuestion(params.userQuestion)) {
    const reserveForGoal =
      params.goalStatus.remainingAmount > 0 ? Math.min(params.balance * 0.5, params.goalStatus.remainingAmount) : params.balance * 0.2;
    const discretionaryBudget = Math.max(0, params.balance - Math.max(0, reserveForGoal));

    if (purchaseAmount) {
      if (purchaseAmount <= discretionaryBudget) {
        prescriptive = `Preskriptif: pembelian ${purchaseAmount.toFixed(
          2
        )} masih relatif aman, tapi tetap sisakan dana darurat dan dana goal.`;
      } else {
        prescriptive = `Preskriptif: pembelian ${purchaseAmount.toFixed(
          2
        )} sebaiknya ditunda karena melebihi ruang belanja aman bulan ini (${discretionaryBudget.toFixed(
          2
        )}).`;
      }
    } else if (params.balance <= 0) {
      prescriptive =
        "Preskriptif: tunda pembelian non-prioritas dulu, fokus menormalkan cashflow sampai saldo bulanan kembali positif.";
    } else {
      const suggestedCap = Math.max(0, params.balance * 0.3);
      prescriptive = `Preskriptif: pembelian boleh dipertimbangkan jika nominalnya di bawah ${suggestedCap.toFixed(
        2
      )} dan tidak mengganggu target tabungan.`;
    }
  } else if (params.balance <= 0) {
    prescriptive =
      "Preskriptif: lakukan pengurangan pengeluaran kategori terbesar 10-20% minggu ini agar cashflow membaik.";
  } else if (params.goalStatus.remainingAmount > 0) {
    const suggestedTopUp = Math.max(0, params.balance * 0.3);
    prescriptive = `Preskriptif: alokasikan minimal ${suggestedTopUp.toFixed(
      2
    )} dari saldo bulan ini ke target tabungan agar progress lebih cepat.`;
  } else {
    prescriptive =
      "Preskriptif: pertahankan rasio tabungan saat ini dan review budget kategori mingguan supaya konsisten.";
  }

  return `${descriptive} ${diagnostic} ${prescriptive}`.trim();
};

export const generateUserFinancialAdvice = async (
  userId: string,
  userQuestion: string
): Promise<string> => {
  const now = new Date();
  const range = getMonthRange(now);
  const [txs, budgets, goalStatus] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        occurredAt: {
          gte: range.start,
          lte: range.end
        }
      }
    }),
    prisma.budget.findMany({ where: { userId } }),
    getSavingsGoalStatus(userId)
  ]);

  if (!txs.length) {
    return "Deskriptif: belum ada transaksi bulan ini. Diagnostik: data masih terlalu minim untuk analisis pola. Preskriptif: catat pemasukan dan pengeluaran rutin minimal 3-7 hari agar analisis lebih akurat.";
  }

  let income = 0;
  let expense = 0;
  const expenseByCategory = new Map<string, number>();
  for (const tx of txs) {
    const amount = toNumber(tx.amount);
    if (tx.type === "INCOME") {
      income += amount;
    } else {
      expense += amount;
      const normalized = normalizeCategory(tx.category);
      expenseByCategory.set(normalized, (expenseByCategory.get(normalized) ?? 0) + amount);
    }
  }

  const balance = income - expense;
  const topExpense = Array.from(expenseByCategory.entries()).sort((a, b) => b[1] - a[1])[0];
  const overspentCategories = budgets
    .map((budget) => {
      const category = normalizeCategory(budget.category);
      const spent = expenseByCategory.get(category) ?? 0;
      const limit = toNumber(budget.monthlyLimit);
      return { category, overBy: spent - limit };
    })
    .filter((item) => item.overBy > 0)
    .sort((a, b) => b.overBy - a.overBy);

  const ruleBasedText = buildRuleBasedAdvice({
    income,
    expense,
    balance,
    topExpenseCategory: topExpense?.[0] ?? null,
    topExpenseAmount: topExpense?.[1] ?? 0,
    overspentCategories,
    goalStatus,
    userQuestion
  });

  const snapshot = [
    `period=monthly_to_date`,
    `income=${income.toFixed(2)}`,
    `expense=${expense.toFixed(2)}`,
    `balance=${balance.toFixed(2)}`,
    `topExpenseCategory=${topExpense?.[0] ?? "N/A"}`,
    `topExpenseAmount=${(topExpense?.[1] ?? 0).toFixed(2)}`,
    `overspentBudgets=${overspentCategories
      .map((item) => `${item.category}:${item.overBy.toFixed(2)}`)
      .join(",") || "none"}`,
    `goalTarget=${goalStatus.targetAmount.toFixed(2)}`,
    `goalProgress=${goalStatus.currentProgress.toFixed(2)}`,
    `goalRemaining=${goalStatus.remainingAmount.toFixed(2)}`,
    `goalProgressPercent=${goalStatus.progressPercent.toFixed(2)}`
  ].join("; ");

  try {
    const aiText = await generateAIFinancialAdvice({
      userQuestion,
      financialSnapshot: snapshot
    });
    return `${ruleBasedText} ${aiText}`.trim();
  } catch {
    return ruleBasedText;
  }
};
