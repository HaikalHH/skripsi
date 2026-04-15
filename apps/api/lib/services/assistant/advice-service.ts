import { prisma } from "@/lib/prisma";
import { normalizeExpenseBucketCategory } from "@/lib/services/transactions/category-override-service";
import { formatMoneyWhole } from "@/lib/services/shared/money-format";

const ESSENTIAL_CATEGORIES = ["Bills", "Food & Drink", "Transport"] as const;
const MONTHLY_PERCENT_FORMATTER = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const normalizeCategory = (value: string) => normalizeExpenseBucketCategory(value);

const getMonthRange = (baseDate: Date) => ({
  start: new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1, 0, 0, 0, 0)),
  end: baseDate
});

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
  /(boleh beli|beli|buy|afford|mampu|aman beli|checkout|check out)/i.test(question);

const formatPercentId = (value: number) => `${MONTHLY_PERCENT_FORMATTER.format(value)}%`;

const getMonthKey = (value: Date) =>
  `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;

const joinCategoryLabels = (categories: string[]) => {
  if (!categories.length) return "";
  if (categories.length === 1) return categories[0];
  if (categories.length === 2) return `${categories[0]} dan ${categories[1]}`;
  return `${categories.slice(0, -1).join(", ")}, dan ${categories[categories.length - 1]}`;
};

type MandatoryNeedsEstimate = {
  amount: number;
  categories: string[];
  source: "CURRENT_MONTH" | "ROLLING_AVERAGE";
  monthsCovered: number;
};

const calculateMandatoryNeedsEstimate = (params: {
  currentExpenseByCategory: Map<string, number>;
  rollingExpenseTxs: Array<{
    amount: unknown;
    category: string;
    occurredAt: Date;
  }>;
}): MandatoryNeedsEstimate | null => {
  const currentCategories = ESSENTIAL_CATEGORIES.filter(
    (category) => (params.currentExpenseByCategory.get(category) ?? 0) > 0
  );
  const currentAmount = currentCategories.reduce(
    (sum, category) => sum + (params.currentExpenseByCategory.get(category) ?? 0),
    0
  );

  if (currentAmount > 0) {
    return {
      amount: currentAmount,
      categories: currentCategories,
      source: "CURRENT_MONTH",
      monthsCovered: 1
    };
  }

  const monthlyEssentialTotals = new Map<string, number>();
  const rollingCategories = new Set<string>();

  for (const tx of params.rollingExpenseTxs) {
    const normalizedCategory = normalizeCategory(tx.category);
    if (!ESSENTIAL_CATEGORIES.includes(normalizedCategory as (typeof ESSENTIAL_CATEGORIES)[number])) {
      continue;
    }

    const amount = Math.max(0, toNumber(tx.amount));
    if (amount <= 0) continue;

    const monthKey = getMonthKey(tx.occurredAt);
    monthlyEssentialTotals.set(monthKey, (monthlyEssentialTotals.get(monthKey) ?? 0) + amount);
    rollingCategories.add(normalizedCategory);
  }

  if (!monthlyEssentialTotals.size) return null;

  const total = Array.from(monthlyEssentialTotals.values()).reduce((sum, amount) => sum + amount, 0);
  const monthsCovered = monthlyEssentialTotals.size;
  const average = Math.round(total / monthsCovered);
  if (average <= 0) return null;

  return {
    amount: average,
    categories: Array.from(rollingCategories.values()).sort(),
    source: "ROLLING_AVERAGE",
    monthsCovered
  };
};

const buildMandatoryNeedsSourceText = (estimate: MandatoryNeedsEstimate) => {
  const categoriesText = joinCategoryLabels(estimate.categories);
  if (estimate.source === "CURRENT_MONTH") {
    return categoriesText
      ? `transaksi aktual kategori ${categoriesText} bulan ini`
      : "transaksi aktual kebutuhan wajib bulan ini";
  }

  return categoriesText
    ? `rata-rata transaksi aktual kategori ${categoriesText} selama ${estimate.monthsCovered} bulan terakhir`
    : `rata-rata transaksi aktual kebutuhan wajib selama ${estimate.monthsCovered} bulan terakhir`;
};

const buildDataReadinessReply = (params: {
  hasCurrentMonthTransactions: boolean;
  income: number;
  expense: number;
  mandatoryNeedsEstimate: MandatoryNeedsEstimate | null;
}) => {
  if (!params.hasCurrentMonthTransactions) {
    return "Data transaksi bulan ini belum ada, jadi /advice belum bisa dihitung akurat. Catat dulu pemasukan dan pengeluaran bulan ini ya.";
  }
  if (params.income <= 0) {
    return "Pemasukan bulan ini belum tercatat, jadi /advice belum bisa menghitung sisa saldo dan ruang belanja aman dengan akurat.";
  }
  if (params.expense <= 0) {
    return "Pengeluaran bulan ini belum tercatat, jadi /advice belum bisa membaca alokasi aktual per kategori.";
  }
  if (!params.mandatoryNeedsEstimate) {
    return "Transaksi kebutuhan wajib seperti Bills, Food & Drink, atau Transport belum cukup, jadi ruang belanja aman belum bisa dihitung akurat.";
  }

  return "Data transaksi bulan ini belum cukup untuk menghitung /advice dengan akurat.";
};

const buildAdviceReply = (params: {
  income: number;
  expense: number;
  balance: number;
  topExpenseCategory: string;
  topExpenseAmount: number;
  mandatoryNeedsEstimate: MandatoryNeedsEstimate;
  userQuestion: string;
}) => {
  const topExpenseShare = params.expense > 0 ? (params.topExpenseAmount / params.expense) * 100 : 0;
  const safeSpendingRoom = Math.max(0, params.balance - params.mandatoryNeedsEstimate.amount);
  const mandatorySourceText = buildMandatoryNeedsSourceText(params.mandatoryNeedsEstimate);
  const purchaseAmount = parseAmountFromQuestion(params.userQuestion);

  const descriptive = `Deskriptif: Bulan ini pemasukan kamu ${formatMoneyWhole(params.income)}, pengeluaran ${formatMoneyWhole(params.expense)}, jadi saldo tersisa ${formatMoneyWhole(params.balance)}.`;
  const diagnostic = `Diagnostik: Pengeluaran terbesar ada di kategori ${params.topExpenseCategory} sebesar ${formatMoneyWhole(params.topExpenseAmount)} (${formatPercentId(topExpenseShare)} dari total pengeluaran). Estimasi kebutuhan wajib saat ini ${formatMoneyWhole(params.mandatoryNeedsEstimate.amount)}, dibaca dari ${mandatorySourceText}.`;

  if (isPurchaseQuestion(params.userQuestion) && purchaseAmount) {
    if (purchaseAmount > safeSpendingRoom) {
      return [
        descriptive,
        diagnostic,
        `Preskriptif: Pembelian ${formatMoneyWhole(purchaseAmount)} sebaiknya ditunda. Ruang belanja aman kamu saat ini ${formatMoneyWhole(safeSpendingRoom)}, dihitung dari sisa saldo ${formatMoneyWhole(params.balance)} dikurangi estimasi kebutuhan wajib ${formatMoneyWhole(params.mandatoryNeedsEstimate.amount)}.`
      ].join("\n");
    }

    return [
      descriptive,
      diagnostic,
      `Preskriptif: Pembelian ${formatMoneyWhole(purchaseAmount)} masih masuk ruang aman bulan ini. Ruang belanja aman kamu saat ini ${formatMoneyWhole(safeSpendingRoom)}, dihitung dari sisa saldo ${formatMoneyWhole(params.balance)} dikurangi estimasi kebutuhan wajib ${formatMoneyWhole(params.mandatoryNeedsEstimate.amount)}.`
    ].join("\n");
  }

  if (safeSpendingRoom <= 0) {
    return [
      descriptive,
      diagnostic,
      `Preskriptif: Ruang belanja aman kamu saat ini ${formatMoneyWhole(0)}, dihitung dari sisa saldo ${formatMoneyWhole(params.balance)} dikurangi estimasi kebutuhan wajib ${formatMoneyWhole(params.mandatoryNeedsEstimate.amount)}. Pembelian non-prioritas sebaiknya ditunda dulu bulan ini.`
    ].join("\n");
  }

  return [
    descriptive,
    diagnostic,
    `Preskriptif: Ruang belanja aman tersisa ${formatMoneyWhole(safeSpendingRoom)}, dihitung dari sisa saldo ${formatMoneyWhole(params.balance)} dikurangi estimasi kebutuhan wajib ${formatMoneyWhole(params.mandatoryNeedsEstimate.amount)}. Pembelian di atas ${formatMoneyWhole(safeSpendingRoom)} sebaiknya ditunda bulan ini.`
  ].join("\n");
};

export const generateUserFinancialAdvice = async (
  userId: string,
  userQuestion: string
): Promise<string> => {
  const now = new Date();
  const range = getMonthRange(now);
  const rollingStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1, 0, 0, 0, 0));

  const [currentMonthTransactions, rollingExpenseTxs] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        occurredAt: {
          gte: range.start,
          lte: range.end
        }
      }
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        type: "EXPENSE",
        occurredAt: {
          gte: rollingStart,
          lte: now
        }
      }
    })
  ]);

  let income = 0;
  let expense = 0;
  const expenseByCategory = new Map<string, number>();

  for (const tx of currentMonthTransactions) {
    const amount = Math.max(0, toNumber(tx.amount));
    if (amount <= 0) continue;

    if (tx.type === "INCOME") {
      income += amount;
      continue;
    }

    expense += amount;
    const normalizedCategory = normalizeCategory(tx.category);
    expenseByCategory.set(normalizedCategory, (expenseByCategory.get(normalizedCategory) ?? 0) + amount);
  }

  const mandatoryNeedsEstimate = calculateMandatoryNeedsEstimate({
    currentExpenseByCategory: expenseByCategory,
    rollingExpenseTxs
  });

  if (
    !currentMonthTransactions.length ||
    income <= 0 ||
    expense <= 0 ||
    expenseByCategory.size === 0 ||
    !mandatoryNeedsEstimate
  ) {
    return buildDataReadinessReply({
      hasCurrentMonthTransactions: currentMonthTransactions.length > 0,
      income,
      expense,
      mandatoryNeedsEstimate
    });
  }

  const topExpenseEntry = [...expenseByCategory.entries()].sort((left, right) => right[1] - left[1])[0];
  if (!topExpenseEntry) {
    return buildDataReadinessReply({
      hasCurrentMonthTransactions: currentMonthTransactions.length > 0,
      income,
      expense,
      mandatoryNeedsEstimate
    });
  }

  return buildAdviceReply({
    income,
    expense,
    balance: income - expense,
    topExpenseCategory: topExpenseEntry[0],
    topExpenseAmount: topExpenseEntry[1],
    mandatoryNeedsEstimate,
    userQuestion
  });
};
