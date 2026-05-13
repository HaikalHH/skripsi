import { type ReportPeriod } from "@finance/shared";
import { PERIOD_LABELS } from "@/lib/services/reporting/query-language";
import { formatMoney } from "@/lib/services/shared/money";
import { type ReportTransactionItem } from "@/lib/services/reporting/shared";

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short"
});

export const buildReportText = (
  period: ReportPeriod,
  incomeTotal: number,
  expenseTotal: number,
  categoryBreakdown: Array<{ category: string; total: number }>,
  periodLabel?: string | null,
  transactions: ReportTransactionItem[] = [],
  options: { includeTransactions?: boolean; savingTotal?: number } = {}
) => {
  const topCategory = categoryBreakdown[0];
  const savingTotal = options.savingTotal ?? 0;
  const balance = incomeTotal - expenseTotal - savingTotal;
  const title =
    periodLabel && periodLabel !== PERIOD_LABELS[period]
      ? `Ringkasan ${periodLabel}`
      : `Report ${period}`;
  const visibleTransactions = transactions.slice(0, 15);
  const hiddenCount = Math.max(0, transactions.length - visibleTransactions.length);
  const transactionLines = visibleTransactions.map((transaction, index) => {
    const date = DATE_LABEL_FORMATTER.format(transaction.occurredAt);
    const detail = [transaction.category, transaction.detailTag, transaction.merchant]
      .filter(Boolean)
      .join(" / ");
    return `${index + 1}. ${date} | ${transaction.type} | ${detail} | ${formatMoney(transaction.amount)}`;
  });

  const includeTransactions = options.includeTransactions ?? true;
  const transactionSection = includeTransactions
    ? [
        "",
        "Daftar transaksi:",
        ...(transactionLines.length ? transactionLines : ["Belum ada transaksi di periode ini."]),
        hiddenCount > 0 ? `Dan ${hiddenCount} transaksi lain.` : null
      ]
    : [];

  return [
    `${title}:`,
    "",
    `Income: ${formatMoney(incomeTotal)}`,
    `Expense: ${formatMoney(expenseTotal)}`,
    savingTotal > 0 ? `Saving/goal: ${formatMoney(savingTotal)}` : null,
    `Balance: ${formatMoney(balance)}`,
    topCategory ? `Top expense: ${topCategory.category} (${formatMoney(topCategory.total)})` : "Top expense: -",
    ...transactionSection
  ]
    .filter(Boolean)
    .join("\n");
};
