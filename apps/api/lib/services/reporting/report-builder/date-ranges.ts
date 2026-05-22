import { type ReportPeriod } from "@finance/shared";
import {
  COMPARE_TERMS,
  MONTH_ALIAS_LOOKUP,
  MONTH_NAME_PATTERN,
  PERIOD_LABELS,
  PREVIOUS_PERIOD_TERMS,
  includesAnyPhrase
} from "@/lib/services/reporting/query-language";
import type {
  CategoryComparisonPeriod,
  CategoryReportRangeUnit,
  CategoryReportRangeWindow,
  ReportComparisonRange,
  ReportDateRange
} from "@/lib/services/reporting/shared";
import { getPeriodRange } from "@/lib/services/reporting/transaction-summary";
import { normalizeText } from "@/lib/services/reporting/report-builder/query-detection";

const DAY_MS = 24 * 60 * 60 * 1000;

const LONG_DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric"
});

const LONG_MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  timeZone: "UTC",
  month: "long",
  year: "numeric"
});
export const startOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));

export const endOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

const startOfUtcMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

const endOfUtcMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

const startOfUtcYear = (year: number) => new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));

const endOfUtcYear = (year: number) => new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

export const buildExplicitRangeLabel = (start: Date, end: Date) => {
  const sameDay =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCDate() === end.getUTCDate();
  if (sameDay) {
    return LONG_DATE_LABEL_FORMATTER.format(start);
  }

  const sameMonthAndYear =
    start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
  if (sameMonthAndYear) {
    return `${start.getUTCDate()}-${end.getUTCDate()} ${LONG_MONTH_LABEL_FORMATTER.format(start)}`;
  }

  return `${LONG_DATE_LABEL_FORMATTER.format(start)} - ${LONG_DATE_LABEL_FORMATTER.format(end)}`;
};

const buildMonthDateRange = (year: number, month: number): ReportDateRange => {
  const start = startOfUtcMonth(year, month);
  const end = endOfUtcMonth(year, month);
  return {
    start,
    end,
    label: LONG_MONTH_LABEL_FORMATTER.format(start)
  };
};

const buildQuarterDateRange = (year: number, quarter: number): ReportDateRange => {
  const normalizedQuarter = Math.max(1, Math.min(4, quarter));
  const startMonth = (normalizedQuarter - 1) * 3;
  const start = startOfUtcMonth(year, startMonth);
  const end = endOfUtcMonth(year, startMonth + 2);

  return {
    start,
    end,
    label: `Q${normalizedQuarter} ${year}`
  };
};

const buildSemesterDateRange = (year: number, semester: number): ReportDateRange => {
  const normalizedSemester = Math.max(1, Math.min(2, semester));
  const startMonth = normalizedSemester === 1 ? 0 : 6;
  const start = startOfUtcMonth(year, startMonth);
  const end = endOfUtcMonth(year, startMonth + 5);

  return {
    start,
    end,
    label: `Semester ${normalizedSemester} ${year}`
  };
};

const buildYearToDateRange = (now = new Date()): ReportDateRange => {
  const start = startOfUtcYear(now.getUTCFullYear());
  const end = endOfUtcDay(now);
  return {
    start,
    end,
    label: buildExplicitRangeLabel(start, end)
  };
};

export const buildMonthToDateRange = (now = new Date()): ReportDateRange => {
  const start = startOfUtcMonth(now.getUTCFullYear(), now.getUTCMonth());
  const end = endOfUtcDay(now);
  return {
    start,
    end,
    label: buildExplicitRangeLabel(start, end)
  };
};

const getClampedUtcMonthDay = (year: number, month: number, day: number) => {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Math.max(1, Math.min(lastDay, day));
};

export const buildFinancialCycleDateRange = (cycleStartDay: number, now = new Date()): ReportDateRange => {
  const normalizedStartDay = Math.max(1, Math.min(31, Math.round(cycleStartDay)));
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const currentDay = now.getUTCDate();
  const startsThisMonth = currentDay >= normalizedStartDay;
  const startMonth = startsThisMonth ? currentMonth : currentMonth - 1;
  const endMonth = startMonth + 1;
  const startDay = getClampedUtcMonthDay(currentYear, startMonth, normalizedStartDay);
  const endDay = getClampedUtcMonthDay(currentYear, endMonth, normalizedStartDay) - 1;
  const start = new Date(Date.UTC(currentYear, startMonth, startDay, 0, 0, 0, 0));
  const endDate =
    endDay >= 1
      ? new Date(Date.UTC(currentYear, endMonth, endDay, 23, 59, 59, 999))
      : new Date(Date.UTC(currentYear, endMonth, 0, 23, 59, 59, 999));

  return {
    start,
    end: endDate,
    label: buildExplicitRangeLabel(start, endDate)
  };
};

const buildDaySpanDateRange = (params: {
  year: number;
  month: number;
  startDay: number;
  endDay: number;
}): ReportDateRange => {
  const lastDay = new Date(Date.UTC(params.year, params.month + 1, 0)).getUTCDate();
  const clampedStartDay = Math.max(1, Math.min(lastDay, params.startDay));
  const clampedEndDay = Math.max(1, Math.min(lastDay, params.endDay));
  const startDay = Math.min(clampedStartDay, clampedEndDay);
  const endDay = Math.max(clampedStartDay, clampedEndDay);
  const start = new Date(Date.UTC(params.year, params.month, startDay, 0, 0, 0, 0));
  const end = new Date(Date.UTC(params.year, params.month, endDay, 23, 59, 59, 999));

  return {
    start,
    end,
    label: buildExplicitRangeLabel(start, end)
  };
};

export const inferPeriodFromDateRange = (dateRange: ReportDateRange): ReportPeriod => {
  const daySpan = getInclusiveDaySpan(dateRange);
  if (daySpan <= 1) return "daily";
  if (daySpan <= 7) return "weekly";
  return "monthly";
};

const parseMonthAlias = (value: string | undefined) => {
  if (!value) return null;
  return MONTH_ALIAS_LOOKUP.get(value.toLowerCase().replace(/\.$/, "")) ?? null;
};

const getPreviousCalendarMonthRange = (now = new Date()): ReportDateRange =>
  buildMonthDateRange(now.getUTCFullYear(), now.getUTCMonth() - 1);

const getPreviousRollingWeekRange = (now = new Date()): ReportDateRange => {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 23, 59, 59, 999));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - 6, 0, 0, 0, 0));
  return {
    start,
    end,
    label: "minggu lalu"
  };
};

const getPreviousDayRange = (now = new Date()): ReportDateRange => {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 12, 0, 0, 0));
  return {
    start: startOfUtcDay(date),
    end: endOfUtcDay(date),
    label: "kemarin"
  };
};

export const extractNamedDateRange = (text: string, now = new Date()): ReportDateRange | null => {
  if (/\b(?:awal bulan(?: ini)?(?: sampai (?:sekarang|hari ini)| sd (?:sekarang|hari ini)| s\/d (?:sekarang|hari ini))?)\b/i.test(text)) {
    return buildMonthToDateRange(now);
  }
  if (/\b(?:tahun ini(?: sampai (?:sekarang|hari ini)| sd (?:sekarang|hari ini)| s\/d (?:sekarang|hari ini))?)\b/i.test(text)) {
    return buildYearToDateRange(now);
  }
  if (/\b(?:kuartal ini|quarter ini)\b/i.test(text)) {
    return buildQuarterDateRange(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) + 1);
  }
  if (/\bsemester ini\b/i.test(text)) {
    return buildSemesterDateRange(now.getUTCFullYear(), now.getUTCMonth() < 6 ? 1 : 2);
  }
  const quarterMatch = text.match(/\b(?:q|kuartal|quarter)\s*([1-4])(?:\s+(\d{4}))?\b/i);
  if (quarterMatch) {
    return buildQuarterDateRange(Number(quarterMatch[2] ?? now.getUTCFullYear()), Number(quarterMatch[1]));
  }
  const semesterMatch = text.match(/\bsemester\s*([12])(?:\s+(\d{4}))?\b/i);
  if (semesterMatch) {
    return buildSemesterDateRange(Number(semesterMatch[2] ?? now.getUTCFullYear()), Number(semesterMatch[1]));
  }
  if (/\b(?:bulan lalu|bulan kemarin)\b/i.test(text)) return getPreviousCalendarMonthRange(now);
  if (/\b(?:minggu lalu|minggu kemarin|pekan lalu|pekan kemarin)\b/i.test(text)) {
    return getPreviousRollingWeekRange(now);
  }
  if (/\b(?:kemarin|yesterday)\b/i.test(text)) return getPreviousDayRange(now);
  return null;
};

export const extractAbsoluteDateRange = (text: string, now = new Date()): ReportDateRange | null => {
  const dayRangeRegex = new RegExp(
    `\\b(\\d{1,2})\\s*(?:-|sampai|s\\/d|sd|to)\\s*(\\d{1,2})\\s+(${MONTH_NAME_PATTERN})(?:\\s+(\\d{4}))?\\b`,
    "i"
  );
  const dayRangeMatch = text.match(dayRangeRegex);
  if (dayRangeMatch) {
    const month = parseMonthAlias(dayRangeMatch[3]);
    if (month !== null) {
      const year = Number(dayRangeMatch[4] ?? now.getUTCFullYear());
      return buildDaySpanDateRange({
        year,
        month,
        startDay: Number(dayRangeMatch[1]),
        endDay: Number(dayRangeMatch[2])
      });
    }
  }

  const monthRegex = new RegExp(`\\b(${MONTH_NAME_PATTERN})(?:\\s+(\\d{4}))?\\b`, "i");
  const monthMatch = text.match(monthRegex);
  if (!monthMatch) return null;

  const month = parseMonthAlias(monthMatch[1]);
  if (month === null) return null;

  const year = Number(monthMatch[2] ?? now.getUTCFullYear());
  return buildMonthDateRange(year, month);
};

export const getInclusiveDaySpan = (range: ReportDateRange) =>
  Math.max(
    1,
    Math.round((startOfUtcDay(range.end).getTime() - startOfUtcDay(range.start).getTime()) / DAY_MS) + 1
  );

const isWholeMonthDateRange = (range: ReportDateRange) =>
  range.start.getUTCDate() === 1 &&
  range.start.getUTCHours() === 0 &&
  range.start.getUTCMinutes() === 0 &&
  range.start.getUTCSeconds() === 0 &&
  range.start.getUTCMilliseconds() === 0 &&
  range.end.getUTCDate() === new Date(Date.UTC(range.end.getUTCFullYear(), range.end.getUTCMonth() + 1, 0)).getUTCDate() &&
  range.end.getUTCHours() === 23 &&
  range.end.getUTCMinutes() === 59 &&
  range.end.getUTCSeconds() === 59 &&
  range.end.getUTCMilliseconds() === 999;

const buildComparisonRangeFromCurrent = (
  current: ReportDateRange,
  previousLabel = "periode sebelumnya"
): ReportComparisonRange => {
  if (isWholeMonthDateRange(current)) {
    const monthSpan = getMonthSpan(current.start, current.end);
    const previousStart = startOfUtcMonth(
      current.start.getUTCFullYear(),
      current.start.getUTCMonth() - monthSpan
    );
    const previousEnd = endOfUtcMonth(current.start.getUTCFullYear(), current.start.getUTCMonth() - 1);

    return {
      current,
      previous: {
        start: previousStart,
        end: previousEnd,
        label: previousLabel
      }
    };
  }

  const daySpan = getInclusiveDaySpan(current);
  const currentStart = startOfUtcDay(current.start);
  const previousEnd = new Date(currentStart.getTime() - 1);
  const previousStart = new Date(currentStart.getTime() - daySpan * DAY_MS);

  return {
    current,
    previous: {
      start: previousStart,
      end: previousEnd,
      label: previousLabel
    }
  };
};

export const buildWindowRange = (rangeWindow: CategoryReportRangeWindow, now = new Date()): ReportDateRange => {
  const { start, end } = getRangeWindowBounds(rangeWindow, now);
  return {
    start,
    end,
    label: buildRangeWindowLabel(rangeWindow)
  };
};

export const extractComparisonRange = (params: {
  text: string;
  now?: Date;
  rangeWindow: CategoryReportRangeWindow | null;
  dateRange: ReportDateRange | null;
}): ReportComparisonRange | null => {
  const now = params.now ?? new Date();
  const normalized = params.text.toLowerCase();
  const wantsComparison =
    includesAnyPhrase(normalized, COMPARE_TERMS) && includesAnyPhrase(normalized, PREVIOUS_PERIOD_TERMS);
  if (!wantsComparison) return null;

  if (params.rangeWindow) {
    return buildComparisonRangeFromCurrent(
      buildWindowRange(params.rangeWindow, now),
      `${params.rangeWindow.count} ${params.rangeWindow.unit === "month"
        ? "bulan"
        : params.rangeWindow.unit === "week"
          ? "minggu"
          : "hari"
      } sebelumnya`
    );
  }

  if (params.dateRange) {
    return buildComparisonRangeFromCurrent(params.dateRange);
  }

  const wantsWeekly = includesAnyPhrase(normalized, ["minggu lalu", "minggu kemarin", "pekan lalu"]);
  const wantsDaily = includesAnyPhrase(normalized, ["kemarin", "hari lalu", "yesterday"]);

  if (wantsDaily) {
    return buildComparisonRangeFromCurrent(
      { start: startOfUtcDay(now), end: endOfUtcDay(now), label: "hari ini" },
      "kemarin"
    );
  }

  if (wantsWeekly) {
    const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay() + 1, 0, 0, 0, 0));
    const weekEnd = endOfUtcDay(now);
    return buildComparisonRangeFromCurrent(
      { start: weekStart, end: weekEnd, label: "minggu ini" },
      "minggu lalu"
    );
  }

  const currentMonthRange = buildMonthDateRange(now.getUTCFullYear(), now.getUTCMonth());
  const previousMonthRange = buildMonthDateRange(now.getUTCFullYear(), now.getUTCMonth() - 1);
  return {
    current: currentMonthRange,
    previous: previousMonthRange
  };
};

export const stripDatePhrases = (value: string) =>
  value
    .replace(
      new RegExp(
        `\\b\\d{1,2}\\s*(?:-|sampai|s\\/d|sd|to)\\s*\\d{1,2}\\s+(?:${MONTH_NAME_PATTERN})(?:\\s+\\d{4})?\\b`,
        "gi"
      ),
      ""
    )
    .replace(new RegExp(`\\b(?:${MONTH_NAME_PATTERN})(?:\\s+\\d{4})?\\b`, "gi"), "")
    .replace(/\b(?:\d+\s+(?:bulan|minggu|hari)\s+terakhir)\b/gi, "")
    .replace(/\b(?:q[1-4]|kuartal\s*[1-4]|quarter\s*[1-4]|kuartal ini|quarter ini|semester\s*[12]|semester ini)\b(?:\s+\d{4})?/gi, "")
    .replace(/\b(?:awal bulan(?: ini)?(?: sampai (?:sekarang|hari ini)| sd (?:sekarang|hari ini)| s\/d (?:sekarang|hari ini))?|tahun ini(?: sampai (?:sekarang|hari ini)| sd (?:sekarang|hari ini)| s\/d (?:sekarang|hari ini))?)\b/gi, "")
    .replace(/\b(?:bulan lalu|bulan kemarin|minggu lalu|minggu kemarin|pekan lalu|pekan kemarin|kemarin|yesterday)\b/gi, "");

export const sanitizeFilterText = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = stripDatePhrases(normalizeText(value))
    .replace(/\b(?:aja|saja|doang|only)\b/gi, "")
    .replace(/\b(?:\d+\s+(?:bulan|minggu|hari)\s+terakhir)\b/gi, "")
    .replace(
      /\b(?:bulan ini|minggu ini|hari ini|today|weekly|monthly|daily|bulan lalu|minggu lalu|pekan lalu|kemarin)\b/gi,
      ""
    )
    .replace(/[?.,]+$/g, "")
    .trim();
  return normalized || null;
};

export const extractRangeWindow = (text: string): CategoryReportRangeWindow | null => {
  const match = text.match(/\b(\d{1,2})\s+(bulan|minggu|hari)\s+terakhir\b/i);
  if (!match) return null;

  const count = Math.max(1, Math.min(24, Number(match[1])));
  const unitMap: Record<string, CategoryReportRangeUnit> = {
    bulan: "month",
    minggu: "week",
    hari: "day"
  };

  return {
    unit: unitMap[match[2].toLowerCase()] ?? "month",
    count
  };
};

export const extractExplicitFilterText = (text: string) => {
  const directMatch = text.match(
    /\byang\s+(.+?)(?=\s+(?:aja|saja|doang|only|bulan ini|minggu ini|hari ini)\b|[?.!,]|$)/i
  );
  if (directMatch) return sanitizeFilterText(directMatch[1]);

  const forMatch = text.match(
    /\b(?:buat|untuk)\s+(.+?)(?=\s+(?:aja|saja|doang|only|bulan ini|minggu ini|hari ini)\b|[?.!,]|$)/i
  );
  if (forMatch) return sanitizeFilterText(forMatch[1]);

  return null;
};

export const getPreviousComparableRange = (period: CategoryComparisonPeriod, now = new Date()) => {
  const currentRange = getPeriodRange(period, now);
  const durationMs = now.getTime() - currentRange.start.getTime();
  let previousStart = new Date(currentRange.start);

  if (period === "daily") {
    previousStart.setUTCDate(previousStart.getUTCDate() - 1);
  } else if (period === "weekly") {
    previousStart.setUTCDate(previousStart.getUTCDate() - 7);
  } else {
    previousStart = new Date(
      Date.UTC(
        currentRange.start.getUTCFullYear(),
        currentRange.start.getUTCMonth() - 1,
        1,
        currentRange.start.getUTCHours(),
        currentRange.start.getUTCMinutes(),
        currentRange.start.getUTCSeconds(),
        currentRange.start.getUTCMilliseconds()
      )
    );
  }

  const maxPreviousEnd = new Date(currentRange.start.getTime() - 1);
  const previousEnd = new Date(
    Math.min(previousStart.getTime() + durationMs, maxPreviousEnd.getTime())
  );

  return {
    currentRange,
    previousRange: {
      start: previousStart,
      end: previousEnd
    }
  };
};

export const getMonthSpan = (start: Date, end: Date) =>
  (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()) + 1;

export const getWeekSpan = (start: Date, end: Date) => {
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil((diffMs + 24 * 60 * 60 * 1000) / (7 * 24 * 60 * 60 * 1000)));
};

export const buildRangeWindowLabel = (rangeWindow: CategoryReportRangeWindow) => {
  const unitLabel =
    rangeWindow.unit === "month" ? "bulan" : rangeWindow.unit === "week" ? "minggu" : "hari";
  return `${rangeWindow.count} ${unitLabel} terakhir`;
};

export const buildRecurringCadenceLabel = (cadence: "weekly" | "monthly" | "irregular") => {
  if (cadence === "weekly") return "mingguan";
  if (cadence === "monthly") return "bulanan";
  return "tidak beraturan";
};

export const buildPeriodLabel = (
  period: ReportPeriod,
  rangeWindow: CategoryReportRangeWindow | null,
  dateRange: ReportDateRange | null
) => (dateRange ? dateRange.label : rangeWindow ? buildRangeWindowLabel(rangeWindow) : PERIOD_LABELS[period]);

export const getRangeWindowBounds = (rangeWindow: CategoryReportRangeWindow, now = new Date()) => {
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);

  if (rangeWindow.unit === "day") {
    start.setUTCDate(start.getUTCDate() - (rangeWindow.count - 1));
  } else if (rangeWindow.unit === "week") {
    start.setUTCDate(start.getUTCDate() - rangeWindow.count * 7 + 1);
  } else {
    start.setUTCMonth(start.getUTCMonth() - rangeWindow.count + 1, 1);
  }

  return { start, end };
};

export const resolvePrimaryDateRange = (params: {
  period: ReportPeriod;
  rangeWindow?: CategoryReportRangeWindow | null;
  dateRange?: ReportDateRange | null;
  now?: Date;
}): ReportDateRange => {
  if (params.dateRange) return params.dateRange;
  if (params.rangeWindow) return buildWindowRange(params.rangeWindow, params.now);

  const baseRange = getPeriodRange(params.period, params.now ?? new Date());
  return {
    ...baseRange,
    label: PERIOD_LABELS[params.period]
  };
};

export const resolveComparisonRanges = (params: {
  period: ReportPeriod;
  rangeWindow?: CategoryReportRangeWindow | null;
  dateRange?: ReportDateRange | null;
  comparisonRange?: ReportComparisonRange | null;
  now?: Date;
}) => {
  if (params.comparisonRange) {
    return {
      currentRange: params.comparisonRange.current,
      previousRange: params.comparisonRange.previous
    };
  }

  if (params.rangeWindow) {
    const current = buildWindowRange(params.rangeWindow, params.now);
    const comparison = buildComparisonRangeFromCurrent(
      current,
      `${params.rangeWindow.count} ${params.rangeWindow.unit === "month"
        ? "bulan"
        : params.rangeWindow.unit === "week"
          ? "minggu"
          : "hari"
      } sebelumnya`
    );
    return {
      currentRange: comparison.current,
      previousRange: comparison.previous
    };
  }

  if (params.dateRange) {
    const comparison = buildComparisonRangeFromCurrent(params.dateRange);
    return {
      currentRange: comparison.current,
      previousRange: comparison.previous
    };
  }

  const fallback = getPreviousComparableRange(params.period, params.now ?? new Date());
  return {
    currentRange: {
      ...fallback.currentRange,
      label: PERIOD_LABELS[params.period]
    },
    previousRange: {
      ...fallback.previousRange,
      label: "periode sebelumnya"
    }
  };
};

