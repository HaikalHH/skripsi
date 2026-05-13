import { reportPeriodSchema, type ReportPeriod } from "@finance/shared";

export const parseReportPeriod = (value: string | null | undefined): ReportPeriod => {
  if (!value) return "monthly";
  const parsed = reportPeriodSchema.safeParse(value.toLowerCase());
  if (!parsed.success) return "monthly";
  return parsed.data;
};
