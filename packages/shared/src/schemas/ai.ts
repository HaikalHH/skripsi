import { z } from "zod";
import { intentSchema, isoDateLikeSchema, reportPeriodSchema, transactionTypeSchema } from "./common";

export const geminiExtractionSchema = z.object({
  intent: intentSchema,
  type: transactionTypeSchema.nullable(),
  amount: z.number().positive().nullable(),
  category: z.string().min(1).max(64).nullable(),
  merchant: z.string().min(1).max(128).nullable(),
  note: z.string().min(1).max(255).nullable(),
  occurredAt: isoDateLikeSchema.nullable(),
  reportPeriod: reportPeriodSchema.nullable(),
  adviceQuery: z.string().min(1).max(255).nullable().optional().default(null)
});
