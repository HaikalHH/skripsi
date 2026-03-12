import { isSubscriptionLikeMerchant, normalizeDetectedMerchant } from "@/lib/services/transactions/merchant-normalization-service";
import { normalizeExpenseBucketCategory } from "@/lib/services/transactions/category-override-service";

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
  averageAmount: number;
  cadence: "weekly" | "monthly" | "irregular";
  isSubscriptionLikely: boolean;
  confidenceScore: number;
  nextExpectedAt: Date | null;
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

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const getSortedIntervals = (dates: Date[]) => {
  if (dates.length < 2) return [];
  const sortedDates = [...dates].sort((left, right) => left.getTime() - right.getTime());
  return sortedDates
    .slice(1)
    .map((date, index) => (date.getTime() - sortedDates[index].getTime()) / (24 * 60 * 60 * 1000));
};

const getAverageIntervalDays = (dates: Date[]) => {
  const intervals = getSortedIntervals(dates);
  if (!intervals.length) return null;
  return intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
};

const getIntervalStdDev = (dates: Date[]) => {
  const intervals = getSortedIntervals(dates);
  if (intervals.length < 2) return null;

  const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const variance =
    intervals.reduce((sum, value) => sum + (value - average) ** 2, 0) / intervals.length;
  return Math.sqrt(variance);
};

const detectCadence = (dates: Date[]): "weekly" | "monthly" | "irregular" => {
  const averageInterval = getAverageIntervalDays(dates);
  if (averageInterval === null) return "irregular";

  if (averageInterval >= 5 && averageInterval <= 10) return "weekly";
  if (averageInterval >= 20 && averageInterval <= 40) return "monthly";
  return "irregular";
};

const buildConfidenceScore = (params: {
  count: number;
  cadence: "weekly" | "monthly" | "irregular";
  label: string;
  dates: Date[];
}) => {
  let score = params.count >= 4 ? 0.58 : params.count >= 3 ? 0.48 : 0.34;
  if (params.cadence !== "irregular") score += 0.17;
  if (isSubscriptionLikeMerchant(params.label)) score += 0.15;

  const stdDev = getIntervalStdDev(params.dates);
  if (stdDev !== null) {
    if (stdDev <= 2) score += 0.12;
    else if (stdDev <= 5) score += 0.07;
    else if (stdDev <= 8) score += 0.03;
  }

  return clamp(score, 0.2, 0.98);
};

const predictNextExpectedAt = (dates: Date[]) => {
  const averageInterval = getAverageIntervalDays(dates);
  if (averageInterval === null) return null;

  const sortedDates = [...dates].sort((left, right) => left.getTime() - right.getTime());
  const lastDate = sortedDates.at(-1);
  if (!lastDate) return null;

  return new Date(lastDate.getTime() + averageInterval * 24 * 60 * 60 * 1000);
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
      const confidenceScore = buildConfidenceScore({
        count: value.count,
        cadence,
        label,
        dates: value.dates
      });
      return {
        label,
        bucket: value.bucket,
        total: value.total,
        count: value.count,
        averageAmount: value.total / Math.max(1, value.count),
        cadence,
        isSubscriptionLikely: isSubscriptionLikeMerchant(label) || cadence === "monthly",
        confidenceScore,
        nextExpectedAt: cadence === "irregular" ? null : predictNextExpectedAt(value.dates)
      } satisfies RecurringExpenseInsight;
    })
    .filter((entry) => entry.count > 1)
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.total - left.total ||
        right.confidenceScore - left.confidenceScore
    );
};
