export type RecurringTransactionLike = {
  category: string;
  amount: unknown;
  occurredAt: Date;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
};

export type RecurringCadence = "weekly" | "monthly" | "irregular";

export type RecurringExpenseInsight = {
  label: string;
  bucket: string;
  total: number;
  count: number;
  averageAmount: number;
  cadence: RecurringCadence;
  isRecurringLikeMerchant: boolean;
  confidenceScore: number;
  nextExpectedAt: Date | null;
};
