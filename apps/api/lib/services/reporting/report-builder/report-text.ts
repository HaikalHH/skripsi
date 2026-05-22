import { type ReportPeriod } from "@finance/shared";
import { PERIOD_LABELS } from "@/lib/services/reporting/query-language";
import { formatMoney, formatPercent } from "@/lib/services/shared/money";
import { type ReportCategoryBudget, type ReportTransactionItem } from "@/lib/services/reporting/shared";
import {
  getBudgetCategoryBucket,
  getBudgetCategoryLookupKey
} from "@/lib/services/transactions/budget/category";

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short"
});

const CATEGORY_PROGRESS_BAR_SEGMENTS = 10;

const clampPercent = (value: number) =>
  Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

const buildCategoryProgressBar = (percent: number) => {
  const filledSegments = Math.round((clampPercent(percent) / 100) * CATEGORY_PROGRESS_BAR_SEGMENTS);
  return `${"█".repeat(filledSegments)}${"░".repeat(CATEGORY_PROGRESS_BAR_SEGMENTS - filledSegments)}`;
};

const getCategoryEmoji = (category: string) => {
  const normalized = category.toLowerCase();
  if (/\b(food|drink|makan|minum|meal|kopi|coffee)\b/i.test(normalized)) return "🍽️";
  if (/\b(transport|bensin|parkir|ojek|grab|gojek|taxi)\b/i.test(normalized)) return "🚗";
  if (/\b(bill|bills|tagihan|listrik|air|internet|pulsa|sewa)\b/i.test(normalized)) return "🧾";
  if (/\b(hobi|entertainment|hiburan|game|movie|jalan)\b/i.test(normalized)) return "🎮";
  if (/\b(health|kesehatan|obat|dokter)\b/i.test(normalized)) return "🩺";
  if (/\b(education|edukasi|sekolah|kursus|buku)\b/i.test(normalized)) return "📚";
  if (/\b(shopping|belanja|pakaian|baju)\b/i.test(normalized)) return "🛍️";
  return "📌";
};

const buildCategoryProgressSection = (
  categoryBreakdown: Array<{ category: string; total: number }>,
  categoryBudgets: ReportCategoryBudget[]
) => {
  const sectionTitle = "📌 Progress budget kategori:";
  const budgets = dedupeCategoryBudgets(categoryBudgets);
  const spentByBudgetKey = new Map<string, number>();
  const unbudgetedRows: Array<{ category: string; total: number }> = [];

  for (const item of categoryBreakdown) {
    const itemLookupKey = getBudgetCategoryLookupKey(item.category);
    const itemBucket = getBudgetCategoryBucket(item.category);
    const exactBudget = budgets.find((budget) => getBudgetCategoryLookupKey(budget.category) === itemLookupKey);
    const bucketBudget =
      exactBudget ??
      budgets.find((budget) => getBudgetCategoryBucket(budget.category) === itemBucket);

    if (!bucketBudget) {
      unbudgetedRows.push(item);
      continue;
    }

    const budgetKey = getBudgetCategoryLookupKey(bucketBudget.category);
    spentByBudgetKey.set(budgetKey, (spentByBudgetKey.get(budgetKey) ?? 0) + item.total);
  }

  const budgetRows = budgets.map((budget) => {
    const budgetKey = getBudgetCategoryLookupKey(budget.category);
    const spent = spentByBudgetKey.get(budgetKey) ?? 0;
    const limit = Math.max(0, budget.monthlyLimit);
    const percent = limit > 0 ? (spent / limit) * 100 : 0;

    return [
      `${getCategoryEmoji(budget.category)} ${budget.category}: ${formatMoney(spent)} / ${formatMoney(limit)} (${formatPercent(
        Math.max(0, Number.isFinite(percent) ? percent : 0)
      )})`,
      buildCategoryProgressBar(percent)
    ];
  });

  if (budgetRows.length) {
    return [
      "",
      sectionTitle,
      ...budgetRows.flat(),
      ...unbudgetedRows.map(
        (item) => `${getCategoryEmoji(item.category)} ${item.category}: ${formatMoney(item.total)} (belum ada budget)`
      )
    ];
  }

  return [
    "",
    sectionTitle,
    "Belum ada budget kategori tersimpan.",
    ...categoryBreakdown.map((item) => `${getCategoryEmoji(item.category)} ${item.category}: ${formatMoney(item.total)}`)
  ];
};

const dedupeCategoryBudgets = (budgets: ReportCategoryBudget[]) => {
  const budgetByKey = new Map<string, ReportCategoryBudget>();
  for (const budget of budgets) {
    budgetByKey.set(getBudgetCategoryLookupKey(budget.category), budget);
  }
  return Array.from(budgetByKey.values());
};

export const buildReportText = (
  period: ReportPeriod,
  incomeTotal: number,
  expenseTotal: number,
  categoryBreakdown: Array<{ category: string; total: number }>,
  periodLabel?: string | null,
  transactions: ReportTransactionItem[] = [],
  options: {
    includeTransactions?: boolean;
    savingTotal?: number;
    categoryBudgets?: ReportCategoryBudget[];
  } = {}
) => {
  const topCategory = categoryBreakdown[0];
  const savingTotal = options.savingTotal ?? 0;
  const balance = incomeTotal - expenseTotal - savingTotal;
  const title =
    periodLabel && periodLabel !== PERIOD_LABELS[period]
      ? `Ringkasan ${periodLabel}`
      : `Report ${period}`;
  const showCategoryProgress = period === "daily" || period === "weekly";
  const visibleTransactions = transactions.slice(0, 15);
  const hiddenCount = Math.max(0, transactions.length - visibleTransactions.length);
  const transactionLines = visibleTransactions.map((transaction, index) => {
    const date = DATE_LABEL_FORMATTER.format(transaction.occurredAt);
    const detail = [transaction.category, transaction.detailTag, transaction.merchant]
      .filter(Boolean)
      .join(" / ");
    return `${index + 1}. ${date} | ${transaction.type} | ${detail} | ${formatMoney(transaction.amount)}`;
  });

  const includeTransactions = period === "monthly" && (options.includeTransactions ?? true);
  const transactionSection = includeTransactions
    ? [
        "",
        "Daftar transaksi:",
        ...(transactionLines.length ? transactionLines : ["Belum ada transaksi di periode ini."]),
        hiddenCount > 0 ? `Dan ${hiddenCount} transaksi lain.` : null
      ]
    : [];

  return [
    showCategoryProgress ? `📊 ${title}:` : `${title}:`,
    "",
    `Income: ${formatMoney(incomeTotal)}`,
    `Expense: ${formatMoney(expenseTotal)}`,
    savingTotal > 0 ? `Saving/goal: ${formatMoney(savingTotal)}` : null,
    `Balance: ${formatMoney(balance)}`,
    showCategoryProgress
      ? null
      : topCategory
        ? `Top expense: ${topCategory.category} (${formatMoney(topCategory.total)})`
        : "Top expense: -",
    ...(showCategoryProgress ? buildCategoryProgressSection(categoryBreakdown, options.categoryBudgets ?? []) : []),
    ...transactionSection
  ]
    .filter(Boolean)
    .join("\n");
};
