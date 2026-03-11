import { isSubscriptionLikeMerchant, normalizeDetectedMerchant } from "./merchant-normalization-service";
import { normalizeExpenseBucketCategory } from "./category-override-service";

type RecurringTransactionLike = {
  category: string;
  amount: unknown;
  occurredAt: Date;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
};

export type RecurringExpenseInsight = {
  label: string;
  bucket: string;
  total: number;
  count: number;
  cadence: "weekly" | "monthly" | "irregular";
  isSubscriptionLikely: boolean;
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const getRecurringLabel = (transaction: RecurringTransactionLike) =>
  normalizeDetectedMerchant({
    merchant: transaction.merchant ?? null,
    rawText: [transaction.note ?? "", transaction.rawText ?? ""].filter(Boolean).join(" ")
  }) ??
  transaction.merchant ??
  transaction.note ??
  transaction.rawText ??
  "Tanpa keterangan";

const detectCadence = (dates: Date[]): "weekly" | "monthly" | "irregular" => {
  if (dates.length < 2) return "irregular";
  const sortedDates = [...dates].sort((left, right) => left.getTime() - right.getTime());
  const intervals = sortedDates
    .slice(1)
    .map((date, index) => (date.getTime() - sortedDates[index].getTime()) / (24 * 60 * 60 * 1000));
  const averageInterval = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;

  if (averageInterval >= 5 && averageInterval <= 10) return "weekly";
  if (averageInterval >= 20 && averageInterval <= 40) return "monthly";
  return "irregular";
};

export const analyzeRecurringExpenses = <T extends RecurringTransactionLike>(transactions: T[]) => {
  const grouped = new Map<
    string,
    { total: number; count: number; bucket: string; dates: Date[] }
  >();

  for (const transaction of transactions) {
    const label = getRecurringLabel(transaction);
    const current = grouped.get(label) ?? {
      total: 0,
      count: 0,
      bucket: normalizeExpenseBucketCategory(transaction.category),
      dates: []
    };
    current.total += toNumber(transaction.amount);
    current.count += 1;
    current.dates.push(transaction.occurredAt);
    grouped.set(label, current);
  }

  return Array.from(grouped.entries())
    .map(([label, value]) => {
      const cadence = detectCadence(value.dates);
      return {
        label,
        bucket: value.bucket,
        total: value.total,
        count: value.count,
        cadence,
        isSubscriptionLikely: isSubscriptionLikeMerchant(label) || cadence === "monthly"
      } satisfies RecurringExpenseInsight;
    })
    .filter((entry) => entry.count > 1)
    .sort((left, right) => right.count - left.count || right.total - left.total);
};
