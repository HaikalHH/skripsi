import { z } from "zod";
import { reportPeriodSchema } from "./common";

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

export const reportingMonthlyPdfSectionSchema = z.object({
  title: z.string().min(1).max(120),
  lines: z.array(z.string().min(1).max(500)).max(40)
});

export const reportingMonthlyPdfRequestSchema = z.object({
  title: z.string().min(1).max(160),
  subtitle: z.string().min(1).max(200).optional(),
  periodLabel: z.string().min(1).max(120),
  summaryLines: z.array(z.string().min(1).max(300)).max(20),
  sections: z.array(reportingMonthlyPdfSectionSchema).max(12)
});
