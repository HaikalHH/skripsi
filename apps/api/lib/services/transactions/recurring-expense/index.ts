import { normalizeExpenseBucketCategory } from "../category";
import { toNumber } from "../helpers/number";
import { isRecurringLikeMerchant, normalizeDetectedMerchant } from "../merchant";
import { buildConfidenceScore, detectCadence, predictNextExpectedAt } from "./cadence";
import type { RecurringExpenseInsight, RecurringTransactionLike } from "./types";

const getRecurringLabel = (transaction: RecurringTransactionLike) =>
  normalizeDetectedMerchant({
    merchant: transaction.merchant ?? null,
    rawText: [transaction.note ?? "", transaction.rawText ?? ""].filter(Boolean).join(" ")
  }) ??
  transaction.merchant ??
  transaction.note ??
  transaction.rawText ??
  "Tanpa keterangan";

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
        isRecurringLikeMerchant: isRecurringLikeMerchant(label) || cadence === "monthly",
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

export type { RecurringExpenseInsight } from "./types";
