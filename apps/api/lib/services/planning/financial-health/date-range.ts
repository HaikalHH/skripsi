import type { ReportDateRange } from "@/lib/services/reporting/report-service";

export const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric"
});

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric"
});

const startOfMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));

const endOfDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

export const getEffectiveRange = (dateRange?: ReportDateRange | null) => {
  if (dateRange) return dateRange;
  const now = new Date();
  return {
    start: startOfMonth(now),
    end: endOfDay(now),
    label: MONTH_LABEL_FORMATTER.format(now)
  };
};
