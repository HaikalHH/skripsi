export type IntentType =
  | "RECORD_TRANSACTION"
  | "REQUEST_REPORT"
  | "REQUEST_INSIGHT"
  | "REQUEST_FINANCIAL_ADVICE"
  | "HELP"
  | "UNKNOWN";

export type TransactionType = "INCOME" | "EXPENSE";
export type MessageType = "TEXT" | "IMAGE";
export type TransactionSource = "TEXT" | "OCR";
export type ReportPeriod = "daily" | "weekly" | "monthly";

export interface GeminiExtraction {
  intent: IntentType;
  type: TransactionType | null;
  amount: number | null;
  category: string | null;
  merchant: string | null;
  note: string | null;
  occurredAt: string | null;
  reportPeriod: ReportPeriod | null;
  adviceQuery: string | null;
}

export interface ReportPayload {
  period: ReportPeriod;
  incomeTotal: number;
  expenseTotal: number;
  categoryBreakdown: Array<{ category: string; total: number }>;
  trend: Array<{ date: string; income: number; expense: number }>;
}
