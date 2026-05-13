import { type ReportPeriod } from "@finance/shared";
import {
  AMOUNT_FOCUS_TERMS,
  AVERAGE_TERMS,
  CHANGE_TERMS,
  COMPARE_TERMS,
  COUNT_FOCUS_TERMS,
  COUNT_TERMS,
  EXPLAIN_TERMS,
  LIST_TERMS,
  MERCHANT_TERMS,
  MONTHLY_TERMS,
  PREVIOUS_PERIOD_TERMS,
  SHARE_TERMS,
  TOTAL_TERMS,
  WEEKLY_TERMS,
  includesAnyPhrase
} from "@/lib/services/reporting/query-language";
import type {
  CategoryComparisonPeriod,
  CategoryReportQueryMode
} from "@/lib/services/reporting/shared";

export const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

export const detectCategoryReportQueryMode = (text: string): CategoryReportQueryMode => {
  const normalized = normalizeText(text).toLowerCase();

  if (
    includesAnyPhrase(normalized, COMPARE_TERMS) &&
    includesAnyPhrase(normalized, PREVIOUS_PERIOD_TERMS) &&
    includesAnyPhrase(normalized, CHANGE_TERMS)
  ) {
    return "COMPARE_PREVIOUS";
  }
  if (includesAnyPhrase(normalized, EXPLAIN_TERMS) && includesAnyPhrase(normalized, CHANGE_TERMS)) {
    return "EXPLAIN_CHANGE";
  }
  if (includesAnyPhrase(normalized, SHARE_TERMS)) {
    return "SHARE_OF_BUCKET";
  }
  if (includesAnyPhrase(normalized, AVERAGE_TERMS) && includesAnyPhrase(normalized, WEEKLY_TERMS)) {
    return "AVERAGE_WEEKLY";
  }
  if (includesAnyPhrase(normalized, AVERAGE_TERMS) && includesAnyPhrase(normalized, MONTHLY_TERMS)) {
    return "AVERAGE_MONTHLY";
  }
  if (
    includesAnyPhrase(normalized, MERCHANT_TERMS) &&
    includesAnyPhrase(normalized, COUNT_FOCUS_TERMS)
  ) {
    return "TOP_MERCHANTS_BY_COUNT";
  }
  if (includesAnyPhrase(normalized, MERCHANT_TERMS) && includesAnyPhrase(normalized, AMOUNT_FOCUS_TERMS)) {
    return "TOP_MERCHANTS";
  }
  if (includesAnyPhrase(normalized, AMOUNT_FOCUS_TERMS) || normalized.includes("yang mana")) {
    return "TOP";
  }
  if (includesAnyPhrase(normalized, COUNT_TERMS)) {
    return "COUNT";
  }
  if (includesAnyPhrase(normalized, TOTAL_TERMS) && !includesAnyPhrase(normalized, LIST_TERMS)) {
    return "TOTAL";
  }
  return "LIST";
};

export const detectComparisonPeriod = (text: string): CategoryComparisonPeriod => {
  if (/\b(hari|harian|daily)\b/i.test(text)) return "daily";
  if (/\b(bulan|bulanan|monthly)\b/i.test(text)) return "monthly";
  return "weekly";
};

export const detectRelativePeriod = (text: string, fallback: ReportPeriod = "monthly"): ReportPeriod => {
  if (/\b(hari|harian|daily|hari ini|today)\b/i.test(text)) return "daily";
  if (/\b(minggu|mingguan|weekly|minggu ini|pekan ini)\b/i.test(text)) return "weekly";
  if (/\b(bulan|bulanan|monthly|bulan ini)\b/i.test(text)) return "monthly";
  return fallback;
};
