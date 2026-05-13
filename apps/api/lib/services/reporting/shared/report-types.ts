import type { ReportPeriod } from "@finance/shared";

export type ReportDateRange = {
  start: Date;
  end: Date;
  label: string;
};

export type ReportComparisonRange = {
  current: ReportDateRange;
  previous: ReportDateRange;
};

export type ReportTransactionItem = {
  id: string;
  type: "INCOME" | "EXPENSE" | "SAVING";
  amount: number;
  category: string;
  detailTag?: string | null;
  merchant?: string | null;
  note?: string | null;
  occurredAt: Date;
};

export type CategoryReportQueryMode =
  | "LIST"
  | "TOTAL"
  | "TOP"
  | "COUNT"
  | "COMPARE_PREVIOUS"
  | "EXPLAIN_CHANGE"
  | "AVERAGE_MONTHLY"
  | "AVERAGE_WEEKLY"
  | "SHARE_OF_BUCKET"
  | "TOP_MERCHANTS"
  | "TOP_MERCHANTS_BY_COUNT";
export type CategoryComparisonPeriod = "daily" | "weekly" | "monthly";
export type CategoryReportRangeUnit = "day" | "week" | "month";
export type CategoryReportRangeWindow = {
  unit: CategoryReportRangeUnit;
  count: number;
};

export type CategoryReportQuery = {
  period: ReportPeriod;
  category: string;
  filterText: string | null;
  mode: CategoryReportQueryMode;
  limit: number | null;
  rangeWindow: CategoryReportRangeWindow | null;
  dateRange: ReportDateRange | null;
  comparisonRange: ReportComparisonRange | null;
};

export type GeneralAnalyticsReportMode =
  | "TOP_CATEGORY_INCREASE"
  | "TOP_RECURRING_EXPENSES"
  | "TOP_MERCHANT_DELTA"
  | "NEW_MERCHANTS"
  | "WEEKEND_VS_WEEKDAY"
  | "HABIT_LEAKS";

export type GeneralAnalyticsQuery = {
  mode: GeneralAnalyticsReportMode;
  period: ReportPeriod;
  limit: number | null;
  rangeWindow: CategoryReportRangeWindow | null;
  dateRange: ReportDateRange | null;
  comparisonRange: ReportComparisonRange | null;
};

export type GeneralReportQuery = {
  period: ReportPeriod;
  dateRange: ReportDateRange | null;
  comparisonRange: ReportComparisonRange | null;
};

