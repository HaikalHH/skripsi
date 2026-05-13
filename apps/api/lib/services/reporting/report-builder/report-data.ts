import { type ReportPeriod } from "@finance/shared";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABELS } from "@/lib/services/reporting/query-language";
import { aggregateTransactions, getPeriodRange } from "@/lib/services/reporting/transaction-summary";
import { type ReportDateRange } from "@/lib/services/reporting/shared";

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

export const getUserReportData = async (
  userId: string,
  period: ReportPeriod,
  dateRange?: ReportDateRange | null
) => {
  const range = dateRange ?? {
    ...getPeriodRange(period, new Date()),
    label: PERIOD_LABELS[period]
  };
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      occurredAt: {
        gte: range.start,
        lte: range.end
      }
    },
    orderBy: { occurredAt: "asc" }
  });

  const aggregated = aggregateTransactions(
    transactions.map((tx) => ({
      type: tx.type,
      amount: toNumber(tx.amount),
      category: tx.category,
      occurredAt: tx.occurredAt
    })),
    range
  );

  return {
    period,
    periodLabel: range.label,
    transactions: transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: toNumber(tx.amount),
      category: tx.category,
      detailTag: tx.detailTag ?? null,
      merchant: tx.merchant ?? null,
      note: tx.note ?? null,
      occurredAt: tx.occurredAt
    })),
    ...aggregated
  };
};
