import { z } from "zod";

const isoDateLikeSchema = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date");

export const intentSchema = z.enum([
  "RECORD_TRANSACTION",
  "REQUEST_REPORT",
  "REQUEST_INSIGHT",
  "REQUEST_FINANCIAL_ADVICE",
  "HELP",
  "UNKNOWN"
]);

export const transactionTypeSchema = z.enum(["INCOME", "EXPENSE"]);
export const messageTypeSchema = z.enum(["TEXT", "IMAGE"]);
export const transactionSourceSchema = z.enum(["TEXT", "OCR"]);
export const reportPeriodSchema = z.enum(["daily", "weekly", "monthly"]);

export const geminiExtractionSchema = z.object({
  intent: intentSchema,
  type: transactionTypeSchema.nullable(),
  amount: z.number().positive().nullable(),
  category: z.string().min(1).max(64).nullable(),
  merchant: z.string().min(1).max(128).nullable(),
  note: z.string().min(1).max(255).nullable(),
  occurredAt: isoDateLikeSchema.nullable(),
  reportPeriod: reportPeriodSchema.nullable(),
  adviceQuery: z.string().min(1).max(500).nullable().optional().default(null)
});

export const inboundMessageSchema = z.object({
  waNumber: z.string().min(6).max(30),
  messageType: messageTypeSchema,
  text: z.string().max(4000).optional(),
  caption: z.string().max(4000).optional(),
  imageBase64: z.string().optional(),
  mimeType: z.string().optional(),
  sentAt: isoDateLikeSchema.optional()
});

export const reportingChartRequestSchema = z.object({
  period: reportPeriodSchema,
  incomeTotal: z.number().min(0),
  expenseTotal: z.number().min(0),
  categoryBreakdown: z.array(
    z.object({
      category: z.string(),
      total: z.number().min(0)
    })
  ),
  trend: z.array(
    z.object({
      date: z.string(),
      income: z.number().min(0),
      expense: z.number().min(0)
    })
  )
});
