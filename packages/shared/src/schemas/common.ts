import { z } from "zod";

export const isoDateLikeSchema = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date");

export const intentSchema = z.enum([
  "RECORD_TRANSACTION",
  "REQUEST_REPORT",
  "HELP",
  "UNKNOWN"
]);

export const transactionTypeSchema = z.enum(["INCOME", "EXPENSE", "SAVING"]);
export const messageTypeSchema = z.enum(["TEXT", "IMAGE"]);
export const reportPeriodSchema = z.enum(["daily", "weekly", "monthly"]);
