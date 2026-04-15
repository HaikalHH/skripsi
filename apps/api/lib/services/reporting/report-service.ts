import { reportPeriodSchema, reportingChartRequestSchema } from "@finance/shared";
import type { ReportPeriod } from "@finance/shared";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { aggregateTransactions, getPeriodRange } from "@/lib/services/reporting/aggregation";
import {
  detectExpenseBucketMatches,
  normalizeExpenseBucketCategory
} from "@/lib/services/transactions/category-override-service";
import { buildTransactionDetailLabel, inferTransactionDetailTag } from "@/lib/services/transactions/detail-tag-service";
import { formatMoney } from "@/lib/services/shared/money-format";
import { analyzeRecurringExpenses } from "@/lib/services/transactions/recurring-expense-service";

const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short"
});

const LONG_DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric"
});

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  month: "short",
  year: "numeric"
});

const LONG_MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric"
});

const RECURRING_DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short"
});

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

export const parseReportPeriod = (value: string | null | undefined): ReportPeriod => {
  if (!value) return "monthly";
  const parsed = reportPeriodSchema.safeParse(value.toLowerCase());
  if (!parsed.success) return "monthly";
  return parsed.data;
};

export type ReportDateRange = {
  start: Date;
  end: Date;
  label: string;
};

export type ReportComparisonRange = {
  current: ReportDateRange;
  previous: ReportDateRange;
};

export const getUserReportData = async (
  userId: string,
  period: ReportPeriod,
  dateRange?: ReportDateRange | null
) => {
  const range = dateRange ?? {
    ...getPeriodRange(period, new Date()),
    label: PERIOD_LABELS[period]
  };
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      occurredAt: {
        gte: range.start,
        lte: range.end
      }
    },
    orderBy: { occurredAt: "asc" }
  });

  const aggregated = aggregateTransactions(
    transactions.map((tx) => ({
      type: tx.type,
      amount: toNumber(tx.amount),
      category: tx.category,
      occurredAt: tx.occurredAt
    })),
    range
  );

  return {
    period,
    periodLabel: range.label,
    ...aggregated
  };
};

export const getReportChartBase64 = async (reportData: {
  period: ReportPeriod;
  incomeTotal: number;
  expenseTotal: number;
  categoryBreakdown: Array<{ category: string; total: number }>;
  trend: Array<{ date: string; income: number; expense: number }>;
}) => {
  const payload = reportingChartRequestSchema.parse(reportData);
  const response = await fetch(`${env.REPORTING_SERVICE_URL}/charts/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Reporting service error: ${response.status} ${errorBody}`);
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());
  return imageBuffer.toString("base64");
};

export const buildReportText = (
  period: ReportPeriod,
  incomeTotal: number,
  expenseTotal: number,
  categoryBreakdown: Array<{ category: string; total: number }>,
  periodLabel?: string | null
) => {
  const topCategory = categoryBreakdown[0];
  const topCategoryText = topCategory
    ? `Top expense category: ${topCategory.category} (${formatMoney(topCategory.total)}).`
    : "No expense category data.";
  const balance = incomeTotal - expenseTotal;
  const summary = `Report ${period}: income ${formatMoney(incomeTotal)}, expense ${formatMoney(
    expenseTotal
  )}, balance ${formatMoney(balance)}.`;

  if (periodLabel && periodLabel !== PERIOD_LABELS[period]) {
    return `Ringkasan ${periodLabel}: income ${formatMoney(incomeTotal)}, expense ${formatMoney(
      expenseTotal
    )}, balance ${formatMoney(balance)}. ${topCategoryText}`;
  }

  return `${summary} ${topCategoryText}`;
};

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  daily: "hari ini",
  weekly: "minggu ini",
  monthly: "bulan ini"
};

const includesAnyPhrase = (text: string, phrases: string[]) =>
  phrases.some((phrase) => text.includes(phrase));

const includesAllPhraseGroups = (text: string, groups: string[][]) =>
  groups.every((group) => includesAnyPhrase(text, group));

const LIST_TERMS = [
  "detail",
  "rincian",
  "daftar",
  "list",
  "apa aja",
  "apa saja",
  "isi",
  "liat",
  "lihat"
];

const TOTAL_TERMS = [
  "total",
  "jumlah",
  "berapa",
  "habis berapa",
  "keluar berapa",
  "spending berapa",
  "nominal berapa"
];

const TOP_TERMS = [
  "terbesar",
  "paling besar",
  "paling gede",
  "paling tinggi",
  "top",
  "paling mahal",
  "termahal"
];

const COUNT_TERMS = [
  "berapa kali",
  "berapa transaksi",
  "jumlah transaksi",
  "count",
  "frekuensi",
  "seberapa sering"
];

const SHARE_TERMS = [
  "kontribusi",
  "persen",
  "percentage",
  "proporsi",
  "porsi",
  "share",
  "nyumbang",
  "sumbang"
];

const AVERAGE_TERMS = ["rata-rata", "rata rata", "average", "rerata", "biasanya berapa", "normalnya berapa"];
const WEEKLY_TERMS = ["per minggu", "mingguan", "weekly", "tiap minggu", "sepekan"];
const MONTHLY_TERMS = ["per bulan", "bulanan", "monthly", "tiap bulan", "sebulan"];
const MERCHANT_TERMS = ["merchant", "toko", "tempat", "vendor"];
const COUNT_FOCUS_TERMS = [
  "paling sering",
  "tersering",
  "paling rutin",
  "rutin",
  "muncul terus",
  "muncul paling sering",
  "paling sering nongol",
  "yang paling sering kepake",
  "kepake paling sering",
  "frekuensi tertinggi"
];
const AMOUNT_FOCUS_TERMS = [...TOP_TERMS, "paling boncos", "paling banyak"];
const COMPARE_TERMS = ["dibanding", "bandingkan", "bandingin", "vs", "versus", "ketimbang"];
const PREVIOUS_PERIOD_TERMS = [
  "lalu",
  "sebelumnya",
  "kemarin",
  "periode lalu",
  "bulan lalu",
  "minggu lalu",
  "hari lalu"
];
const CHANGE_TERMS = ["naik", "turun", "melonjak", "drop", "membengkak", "ngebengkak", "lonjak"];
const EXPLAIN_TERMS = [
  "kenapa",
  "apa yang bikin",
  "yang bikin",
  "penyebab",
  "gara gara",
  "gara-gara",
  "yang dorong",
  "ngedorong",
  "pemicu"
];
const RECURRING_TERMS = [
  "recurring",
  "rutin",
  "berulang",
  "langganan",
  "subscription",
  "langganan aktif",
  "tagihan rutin"
];
const NEW_ENTRY_TERMS = ["baru", "new", "belum pernah", "muncul baru", "muncul pertama", "pertama kali"];
const WEEKEND_TERMS = ["weekend", "akhir pekan", "sabtu minggu", "sabtu", "minggu"];
const WEEKDAY_TERMS = ["weekday", "hari kerja", "weekdays"];
const LEAK_TERMS = [
  "bocor halus",
  "kebocoran halus",
  "leak",
  "leaks",
  "kebiasaan bocor",
  "bocor kecil",
  "receh tapi sering",
  "pengeluaran receh tapi sering",
  "kebiasaan boros",
  "boros halus",
  "bikin bocor"
];

const GENERIC_BUCKET_TERMS = new Set([
  "food & drink",
  "food",
  "makan",
  "minum",
  "transport",
  "transportation",
  "transportasi",
  "bills",
  "tagihan",
  "entertainment",
  "hiburan",
  "others",
  "other"
]);

const MONTH_ALIASES = [
  { month: 0, aliases: ["januari", "jan", "january"] },
  { month: 1, aliases: ["februari", "feb", "february"] },
  { month: 2, aliases: ["maret", "mar", "march"] },
  { month: 3, aliases: ["april", "apr"] },
  { month: 4, aliases: ["mei", "may"] },
  { month: 5, aliases: ["juni", "jun", "june"] },
  { month: 6, aliases: ["juli", "jul", "july"] },
  { month: 7, aliases: ["agustus", "agu", "agt", "aug", "august"] },
  { month: 8, aliases: ["september", "sep", "sept"] },
  { month: 9, aliases: ["oktober", "okt", "october", "oct"] },
  { month: 10, aliases: ["november", "nov"] },
  { month: 11, aliases: ["desember", "des", "december", "dec"] }
] as const;

const MONTH_ALIAS_LOOKUP = new Map<string, number>();
for (const entry of MONTH_ALIASES) {
  for (const alias of entry.aliases) {
    MONTH_ALIAS_LOOKUP.set(alias, entry.month);
  }
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MONTH_NAME_PATTERN = Array.from(MONTH_ALIAS_LOOKUP.keys())
  .sort((left, right) => right.length - left.length)
  .map(escapeRegex)
  .join("|");

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
type CategoryComparisonPeriod = "daily" | "weekly" | "monthly";
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

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

const resolveTransactionDetailLabel = (transaction: {
  category: string;
  detailTag?: string | null;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
}) =>
  buildTransactionDetailLabel({
    detailTag:
      transaction.detailTag ??
      inferTransactionDetailTag({
        type: "EXPENSE",
        category: transaction.category,
        merchant: transaction.merchant ?? null,
        note: transaction.note ?? null,
        rawText: transaction.rawText ?? null
      }),
    merchant: transaction.merchant ?? null,
    note: transaction.note ?? null,
    rawText: transaction.rawText ?? null
  });

const detectCategoryReportQueryMode = (text: string): CategoryReportQueryMode => {
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

const detectComparisonPeriod = (text: string): CategoryComparisonPeriod => {
  if (/\b(hari|harian|daily)\b/i.test(text)) return "daily";
  if (/\b(bulan|bulanan|monthly)\b/i.test(text)) return "monthly";
  return "weekly";
};

const detectRelativePeriod = (text: string, fallback: ReportPeriod = "monthly"): ReportPeriod => {
  if (/\b(hari|harian|daily|hari ini|today)\b/i.test(text)) return "daily";
  if (/\b(minggu|mingguan|weekly|minggu ini|pekan ini)\b/i.test(text)) return "weekly";
  if (/\b(bulan|bulanan|monthly|bulan ini)\b/i.test(text)) return "monthly";
  return fallback;
};

const startOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));

const endOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

const startOfUtcMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

const endOfUtcMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

const startOfUtcYear = (year: number) => new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));

const endOfUtcYear = (year: number) => new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

const buildExplicitRangeLabel = (start: Date, end: Date) => {
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

const buildMonthToDateRange = (now = new Date()): ReportDateRange => {
  const start = startOfUtcMonth(now.getUTCFullYear(), now.getUTCMonth());
  const end = endOfUtcDay(now);
  return {
    start,
    end,
    label: buildExplicitRangeLabel(start, end)
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

const inferPeriodFromDateRange = (dateRange: ReportDateRange): ReportPeriod => {
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

const extractNamedDateRange = (text: string, now = new Date()): ReportDateRange | null => {
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

const extractAbsoluteDateRange = (text: string, now = new Date()): ReportDateRange | null => {
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

const getInclusiveDaySpan = (range: ReportDateRange) =>
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

const buildWindowRange = (rangeWindow: CategoryReportRangeWindow, now = new Date()): ReportDateRange => {
  const { start, end } = getRangeWindowBounds(rangeWindow, now);
  return {
    start,
    end,
    label: buildRangeWindowLabel(rangeWindow)
  };
};

const extractComparisonRange = (params: {
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
      `${params.rangeWindow.count} ${
        params.rangeWindow.unit === "month"
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

  return null;
};

const stripDatePhrases = (value: string) =>
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

const sanitizeFilterText = (value: string | null | undefined) => {
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

const extractRangeWindow = (text: string): CategoryReportRangeWindow | null => {
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

const extractExplicitFilterText = (text: string) => {
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

export const parseCategoryReportQuery = (rawText: string): CategoryReportQuery | null => {
  const text = normalizeText(rawText);
  if (!text) return null;

  const normalized = text.toLowerCase();
  if (
    !includesAnyPhrase(normalized, [
      ...LIST_TERMS,
      ...TOTAL_TERMS,
      ...TOP_TERMS,
      ...COUNT_TERMS,
      ...SHARE_TERMS,
      ...AVERAGE_TERMS,
      ...MERCHANT_TERMS,
      ...COUNT_FOCUS_TERMS,
      ...COMPARE_TERMS,
      ...PREVIOUS_PERIOD_TERMS,
      ...CHANGE_TERMS,
      ...EXPLAIN_TERMS,
      "transaksi",
      "pengeluaran",
      "expense",
      "spending",
      "laporan",
      "report",
      "ringkasan",
      "summary",
      "terakhir",
      "mana"
    ])
  ) {
    return null;
  }

  const matches = detectExpenseBucketMatches(text);
  if (!matches.length) return null;

  const explicitFilterText = extractExplicitFilterText(text);
  const explicitBucketMatch = matches.find((match) => GENERIC_BUCKET_TERMS.has(match.alias));
  const primaryMatch = explicitBucketMatch ?? matches[0];
  const category = primaryMatch.bucket;

  let filterText = explicitFilterText;
  if (!filterText) {
    const moreSpecificMatch = matches.find(
      (match) => match.bucket === category && match.alias !== primaryMatch.alias && !GENERIC_BUCKET_TERMS.has(match.alias)
    );
    if (moreSpecificMatch) {
      filterText = sanitizeFilterText(moreSpecificMatch.alias);
    } else if (!GENERIC_BUCKET_TERMS.has(primaryMatch.alias)) {
      filterText = sanitizeFilterText(primaryMatch.alias);
    }
  }

  const mode = detectCategoryReportQueryMode(text);
  if (mode === "EXPLAIN_CHANGE" && filterText && /\b(kenapa|bikin|penyebab|naik|turun|apa)\b/i.test(filterText)) {
    filterText = null;
  }
  if (
    (mode === "TOP_MERCHANTS" || mode === "TOP_MERCHANTS_BY_COUNT") &&
    filterText &&
    /\b(sering|rutin|kepake|merchant|top|besar|mahal|transaksi)\b/i.test(filterText)
  ) {
    filterText = null;
  }
  const rangeWindow = extractRangeWindow(text);
  const absoluteDateRange = extractAbsoluteDateRange(text);
  const dateRange =
    absoluteDateRange ??
    (mode === "COMPARE_PREVIOUS" || mode === "EXPLAIN_CHANGE" ? null : extractNamedDateRange(text));
  const comparisonRange = extractComparisonRange({
    text,
    rangeWindow,
    dateRange
  });
  const limitMatch = text.match(/\b(?:top\s+)?(\d{1,2})\s+merchant\b/i);
  const limit =
    mode === "TOP_MERCHANTS" || mode === "TOP_MERCHANTS_BY_COUNT"
      ? Math.max(1, Math.min(10, Number(limitMatch?.[1] ?? 3)))
      : null;

  return {
    period:
      mode === "COMPARE_PREVIOUS"
        ? detectComparisonPeriod(text)
        : mode === "EXPLAIN_CHANGE"
          ? detectRelativePeriod(text, "monthly")
        : parseReportPeriod(
            /\b(hari ini|today|harian|daily)\b/i.test(text)
              ? "daily"
              : /\b(minggu ini|pekan ini|weekly|mingguan)\b/i.test(text)
                ? "weekly"
                : "monthly"
          ),
    category,
    filterText,
    mode,
    limit,
    rangeWindow,
    dateRange,
    comparisonRange
  };
};

export const parseGeneralReportQuery = (rawText: string): GeneralReportQuery | null => {
  const text = normalizeText(rawText);
  if (!text) return null;

  const normalized = text.toLowerCase();
  if (!includesAnyPhrase(normalized, ["laporan", "report", "ringkasan", "summary", "rekap"])) {
    return null;
  }

  const rangeWindow = extractRangeWindow(text);
  const absoluteDateRange = extractAbsoluteDateRange(text);
  const namedDateRange = absoluteDateRange ? null : extractNamedDateRange(text);
  const dateRange =
    absoluteDateRange ?? namedDateRange ?? (rangeWindow ? buildWindowRange(rangeWindow) : null);
  const comparisonRange = extractComparisonRange({
    text,
    rangeWindow,
    dateRange
  });

  const period = dateRange
    ? inferPeriodFromDateRange(dateRange)
    : rangeWindow
      ? rangeWindow.unit === "day"
        ? "daily"
        : rangeWindow.unit === "week"
          ? "weekly"
          : "monthly"
      : detectRelativePeriod(text, "monthly");

  return {
    period,
    dateRange,
    comparisonRange
  };
};

const buildTransactionSearchText = (transaction: {
  category: string;
  detailTag?: string | null;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
}) =>
  normalizeText(
    [
      transaction.category,
      transaction.detailTag ?? "",
      transaction.merchant ?? "",
      resolveTransactionDetailLabel(transaction),
      transaction.note ?? "",
      transaction.rawText ?? ""
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
  );

const matchesFilterText = (transaction: {
  category: string;
  detailTag?: string | null;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
}, filterText: string | null) => {
  if (!filterText) return true;
  const haystack = buildTransactionSearchText(transaction);
  const tokens = sanitizeFilterText(filterText)
    ?.toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length >= 2);
  if (!tokens?.length) return true;
  return tokens.every((token) => haystack.includes(token));
};

const buildFilterPhrase = (filterText: string | null) =>
  filterText ? ` yang cocok dengan "${filterText}"` : "";

const parseTopLimit = (text: string, fallback = 3) => {
  const explicitTop = text.match(/\btop\s+(\d{1,2})\b/i);
  if (explicitTop) return Math.max(1, Math.min(10, Number(explicitTop[1])));
  const merchantTop = text.match(/\b(?:top\s+)?(\d{1,2})\s+merchant\b/i);
  if (merchantTop) return Math.max(1, Math.min(10, Number(merchantTop[1])));
  return fallback;
};

const getTransactionsByRange = async (params: {
  userId: string;
  start: Date;
  end: Date;
}) =>
  prisma.transaction.findMany({
    where: {
      userId: params.userId,
      type: "EXPENSE",
      occurredAt: {
        gte: params.start,
        lte: params.end
      }
    },
    orderBy: { occurredAt: "desc" }
  });

const filterCategoryTransactions = <T extends {
  category: string;
  detailTag?: string | null;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
}>(transactions: T[], category: string, filterText: string | null) =>
  transactions
    .filter((transaction) => normalizeExpenseBucketCategory(transaction.category) === category)
    .filter((transaction) => matchesFilterText(transaction, filterText));

const getPreviousComparableRange = (period: CategoryComparisonPeriod, now = new Date()) => {
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

const getMonthSpan = (start: Date, end: Date) =>
  (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()) + 1;

const getWeekSpan = (start: Date, end: Date) => {
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil((diffMs + 24 * 60 * 60 * 1000) / (7 * 24 * 60 * 60 * 1000)));
};

const buildRangeWindowLabel = (rangeWindow: CategoryReportRangeWindow) => {
  const unitLabel =
    rangeWindow.unit === "month" ? "bulan" : rangeWindow.unit === "week" ? "minggu" : "hari";
  return `${rangeWindow.count} ${unitLabel} terakhir`;
};

const buildRecurringCadenceLabel = (cadence: "weekly" | "monthly" | "irregular") => {
  if (cadence === "weekly") return "mingguan";
  if (cadence === "monthly") return "bulanan";
  return "tidak beraturan";
};

const buildPeriodLabel = (
  period: ReportPeriod,
  rangeWindow: CategoryReportRangeWindow | null,
  dateRange: ReportDateRange | null
) => (dateRange ? dateRange.label : rangeWindow ? buildRangeWindowLabel(rangeWindow) : PERIOD_LABELS[period]);

const getRangeWindowBounds = (rangeWindow: CategoryReportRangeWindow, now = new Date()) => {
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

const resolvePrimaryDateRange = (params: {
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

const resolveComparisonRanges = (params: {
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
      `${params.rangeWindow.count} ${
        params.rangeWindow.unit === "month"
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

const aggregateByBucket = <T extends { category: string; amount: unknown }>(transactions: T[]) => {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    const bucket = normalizeExpenseBucketCategory(transaction.category);
    totals.set(bucket, (totals.get(bucket) ?? 0) + toNumber(transaction.amount));
  }
  return totals;
};

const isWeekendDate = (date: Date) => {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
};

const countDaysInRange = (range: ReportDateRange, predicate: (date: Date) => boolean) => {
  const cursor = new Date(
    Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), range.start.getUTCDate(), 0, 0, 0, 0)
  );
  const end = new Date(
    Date.UTC(range.end.getUTCFullYear(), range.end.getUTCMonth(), range.end.getUTCDate(), 0, 0, 0, 0)
  );
  let count = 0;
  while (cursor.getTime() <= end.getTime()) {
    if (predicate(cursor)) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
};

const aggregateByDetailStats = <T extends {
  category: string;
  amount: unknown;
  occurredAt: Date;
  detailTag?: string | null;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
}>(transactions: T[]) => {
  const totals = new Map<
    string,
    {
      label: string;
      bucket: string;
      total: number;
      count: number;
      weekendTotal: number;
      weekendCount: number;
      weekdayTotal: number;
      weekdayCount: number;
      firstOccurredAt: Date;
      lastOccurredAt: Date;
    }
  >();

  for (const transaction of transactions) {
    const label = resolveTransactionDetailLabel(transaction);
    const bucket = normalizeExpenseBucketCategory(transaction.category);
    const key = `${bucket}::${label}`;
    const amount = toNumber(transaction.amount);
    const current = totals.get(key) ?? {
      label,
      bucket,
      total: 0,
      count: 0,
      weekendTotal: 0,
      weekendCount: 0,
      weekdayTotal: 0,
      weekdayCount: 0,
      firstOccurredAt: transaction.occurredAt,
      lastOccurredAt: transaction.occurredAt
    };

    current.total += amount;
    current.count += 1;
    if (isWeekendDate(transaction.occurredAt)) {
      current.weekendTotal += amount;
      current.weekendCount += 1;
    } else {
      current.weekdayTotal += amount;
      current.weekdayCount += 1;
    }
    if (transaction.occurredAt.getTime() < current.firstOccurredAt.getTime()) {
      current.firstOccurredAt = transaction.occurredAt;
    }
    if (transaction.occurredAt.getTime() > current.lastOccurredAt.getTime()) {
      current.lastOccurredAt = transaction.occurredAt;
    }
    totals.set(key, current);
  }

  return Array.from(totals.values()).map((entry) => ({
    ...entry,
    averageAmount: entry.count > 0 ? entry.total / entry.count : 0
  }));
};

const aggregateByDetailLabel = <T extends {
  category: string;
  amount: unknown;
  occurredAt: Date;
  detailTag?: string | null;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
}>(transactions: T[]) =>
  aggregateByDetailStats(transactions).map((entry) => ({
    label: entry.label,
    bucket: entry.bucket,
    total: entry.total
  }));

const calculateTransactionTotal = <T extends { amount: unknown }>(transactions: T[]) =>
  transactions.reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);

const calculateAverageTransactionAmount = <T extends { amount: unknown }>(transactions: T[]) => {
  if (!transactions.length) return 0;
  return calculateTransactionTotal(transactions) / transactions.length;
};

const buildDriverReasonText = (params: {
  currentTransactions: number;
  previousTransactions: number;
  currentAverage: number;
  previousAverage: number;
}) => {
  const countDelta = params.currentTransactions - params.previousTransactions;
  const averageDelta = params.currentAverage - params.previousAverage;
  const frequencyRaised = countDelta >= 2 || (params.previousTransactions > 0 && countDelta >= 1);
  const averageRaised =
    params.currentAverage > 0 &&
    (averageDelta >= 50_000 ||
      (params.previousAverage > 0 && params.currentAverage >= params.previousAverage * 1.15));

  if (frequencyRaised && averageRaised) {
    return "Kenaikan datang dari kombinasi frekuensi transaksi dan nominal rata-rata per transaksi.";
  }
  if (frequencyRaised) {
    return "Kenaikan lebih banyak didorong oleh frekuensi transaksi yang makin sering.";
  }
  if (averageRaised) {
    return "Kenaikan lebih banyak didorong oleh nominal rata-rata per transaksi yang lebih besar.";
  }
  return "Kenaikan datang dari campuran beberapa merchant dan nominal, tanpa satu pola tunggal yang dominan.";
};

const buildDetailDeltaSnapshot = <T extends {
  category: string;
  amount: unknown;
  occurredAt: Date;
  detailTag?: string | null;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
}>(currentTransactions: T[], previousTransactions: T[]) => {
  const currentByLabel = aggregateByDetailLabel(currentTransactions);
  const previousByLabel = aggregateByDetailLabel(previousTransactions);
  const previousMap = new Map(previousByLabel.map((entry) => [`${entry.bucket}::${entry.label}`, entry.total]));
  const previousLabelSet = new Set(previousByLabel.map((entry) => `${entry.bucket}::${entry.label}`));

  const deltas = currentByLabel
    .map((entry) => {
      const key = `${entry.bucket}::${entry.label}`;
      const previous = previousMap.get(key) ?? 0;
      return {
        label: entry.label,
        bucket: entry.bucket,
        current: entry.total,
        previous,
        delta: entry.total - previous,
        isNew: !previousLabelSet.has(key)
      };
    })
    .filter((entry) => entry.delta > 0)
    .sort((left, right) => right.delta - left.delta);

  return {
    deltas,
    newEntries: deltas.filter((entry) => entry.isNew),
    existingEntries: deltas.filter((entry) => !entry.isNew)
  };
};

const buildHabitLeakSnapshot = <T extends {
  category: string;
  amount: unknown;
  occurredAt: Date;
  detailTag?: string | null;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
}>(transactions: T[]) => {
  const detailStats = aggregateByDetailStats(transactions);
  const recurring = analyzeRecurringExpenses(transactions);
  const smallFrequent = detailStats
    .filter((entry) => entry.count >= 3 && entry.averageAmount <= 150_000 && entry.total >= 150_000)
    .sort((left, right) => right.total - left.total || right.count - left.count);
  const weekendHeavy = detailStats
    .filter(
      (entry) =>
        entry.weekendCount >= 2 &&
        entry.weekendTotal >= 100_000 &&
        entry.weekendTotal > entry.weekdayTotal
    )
    .sort(
      (left, right) =>
        right.weekendTotal / Math.max(right.total, 1) - left.weekendTotal / Math.max(left.total, 1) ||
        right.weekendTotal - left.weekendTotal
    );

  return {
    detailStats,
    recurring,
    smallFrequent,
    weekendHeavy
  };
};

export const parseGeneralAnalyticsQuery = (rawText: string): GeneralAnalyticsQuery | null => {
  const text = normalizeText(rawText);
  if (!text) return null;
  const normalized = text.toLowerCase();
  const rangeWindow = extractRangeWindow(text);

  if (
    includesAnyPhrase(normalized, ["kategori", "bucket"]) &&
    (includesAnyPhrase(normalized, ["paling naik", "naik paling besar", "kenaikan terbesar", "lonjakannya paling besar"]) ||
      includesAllPhraseGroups(normalized, [CHANGE_TERMS, COMPARE_TERMS, PREVIOUS_PERIOD_TERMS]))
  ) {
    const absoluteDateRange = extractAbsoluteDateRange(text);
    const namedDateRange = extractNamedDateRange(text);
    const comparisonDateRange =
      absoluteDateRange ??
      (/\b(?:bulan lalu|bulan kemarin|minggu lalu|minggu kemarin|pekan lalu|pekan kemarin|kemarin|yesterday)\b/i.test(
        text
      )
        ? null
        : namedDateRange);
    const comparisonRange = extractComparisonRange({
      text,
      rangeWindow,
      dateRange: comparisonDateRange
    });
    return {
      mode: "TOP_CATEGORY_INCREASE",
      period: detectComparisonPeriod(text),
      limit: null,
      rangeWindow,
      dateRange: comparisonDateRange,
      comparisonRange
    };
  }

  if (
    (includesAnyPhrase(normalized, ["selisih terbesar", "perbedaan terbesar", "delta terbesar"]) &&
      includesAnyPhrase(normalized, MERCHANT_TERMS)) ||
    (includesAnyPhrase(normalized, MERCHANT_TERMS) &&
      includesAnyPhrase(normalized, ["paling ngedorong", "paling dorong", "penyumbang kenaikan terbesar", "bikin spending naik", "bikin pengeluaran naik"]))
  ) {
    const absoluteDateRange = extractAbsoluteDateRange(text);
    const namedDateRange = extractNamedDateRange(text);
    const comparisonDateRange =
      absoluteDateRange ??
      (/\b(?:bulan lalu|bulan kemarin|minggu lalu|minggu kemarin|pekan lalu|pekan kemarin|kemarin|yesterday)\b/i.test(
        text
      )
        ? null
        : namedDateRange);
    const comparisonRange = extractComparisonRange({
      text,
      rangeWindow,
      dateRange: comparisonDateRange
    });
    return {
      mode: "TOP_MERCHANT_DELTA",
      period: detectRelativePeriod(text, "monthly"),
      limit: 5,
      rangeWindow,
      dateRange: comparisonDateRange,
      comparisonRange
    };
  }

  if (includesAnyPhrase(normalized, MERCHANT_TERMS) && includesAnyPhrase(normalized, NEW_ENTRY_TERMS)) {
    const absoluteDateRange = extractAbsoluteDateRange(text);
    const namedDateRange = extractNamedDateRange(text);
    const comparisonDateRange = absoluteDateRange ?? namedDateRange;
    const comparisonRange = extractComparisonRange({
      text,
      rangeWindow,
      dateRange: comparisonDateRange
    });
    return {
      mode: "NEW_MERCHANTS",
      period: detectRelativePeriod(text, "monthly"),
      limit: parseTopLimit(text, 5),
      rangeWindow,
      dateRange: comparisonDateRange,
      comparisonRange
    };
  }

  if (
    includesAnyPhrase(normalized, WEEKEND_TERMS) &&
    (includesAnyPhrase(normalized, WEEKDAY_TERMS) ||
      includesAnyPhrase(normalized, ["boros", "pengeluaran", "spending", "lebih banyak", "lebih gede", "lebih besar"]))
  ) {
    const dateRange = extractAbsoluteDateRange(text) ?? extractNamedDateRange(text);
    return {
      mode: "WEEKEND_VS_WEEKDAY",
      period: detectRelativePeriod(text, "monthly"),
      limit: null,
      rangeWindow,
      dateRange,
      comparisonRange: null
    };
  }

  if (includesAnyPhrase(normalized, LEAK_TERMS)) {
    const dateRange = extractAbsoluteDateRange(text) ?? extractNamedDateRange(text);
    return {
      mode: "HABIT_LEAKS",
      period: detectRelativePeriod(text, "monthly"),
      limit: parseTopLimit(text, 3),
      rangeWindow,
      dateRange,
      comparisonRange: null
    };
  }

  if (
    includesAnyPhrase(normalized, [
      "recurring expense",
      "expense rutin",
      "pengeluaran rutin",
      "biaya rutin",
      "langganan rutin",
      "langganan aktif"
    ]) ||
    includesAnyPhrase(normalized, RECURRING_TERMS)
  ) {
    const dateRange = extractAbsoluteDateRange(text) ?? extractNamedDateRange(text);
    return {
      mode: "TOP_RECURRING_EXPENSES",
      period: parseReportPeriod(
        /\b(hari ini|today|harian|daily)\b/i.test(text)
          ? "daily"
          : /\b(minggu ini|pekan ini|weekly|mingguan)\b/i.test(text)
            ? "weekly"
            : "monthly"
      ),
      limit: parseTopLimit(text, 5),
      rangeWindow,
      dateRange,
      comparisonRange: null
    };
  }

  return null;
};

export const buildCategoryDetailReport = async (params: {
  userId: string;
  period: ReportPeriod;
  category: string;
  filterText?: string | null;
  mode?: CategoryReportQueryMode;
  limit?: number | null;
  rangeWindow?: CategoryReportRangeWindow | null;
  dateRange?: ReportDateRange | null;
  comparisonRange?: ReportComparisonRange | null;
}) => {
  const normalizedCategory = normalizeExpenseBucketCategory(params.category);
  const filterText = sanitizeFilterText(params.filterText);
  const mode = params.mode ?? "LIST";
  const now = new Date();
  const hasCustomComparisonContext = Boolean(
    params.comparisonRange || params.dateRange || params.rangeWindow
  );

  if (mode === "COMPARE_PREVIOUS") {
    const { currentRange, previousRange } = resolveComparisonRanges({
      period: params.period,
      rangeWindow: params.rangeWindow,
      dateRange: params.dateRange,
      comparisonRange: params.comparisonRange,
      now
    });
    const [currentTransactions, previousTransactions] = await Promise.all([
      getTransactionsByRange({
        userId: params.userId,
        start: currentRange.start,
        end: currentRange.end
      }),
      getTransactionsByRange({
        userId: params.userId,
        start: previousRange.start,
        end: previousRange.end
      })
    ]);

    const currentMatching = filterCategoryTransactions(currentTransactions, normalizedCategory, filterText);
    const previousMatching = filterCategoryTransactions(previousTransactions, normalizedCategory, filterText);
    const currentTotal = currentMatching.reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
    const previousTotal = previousMatching.reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
    const delta = currentTotal - previousTotal;

    const trendText =
      delta > 0
        ? `naik ${formatMoney(delta)}`
        : delta < 0
          ? `turun ${formatMoney(Math.abs(delta))}`
          : "stabil";
    const percentText =
      previousTotal > 0 ? ` (${((delta / previousTotal) * 100).toFixed(1)}%)` : "";

    return [
      `Pengeluaran ${normalizedCategory}${buildFilterPhrase(filterText)}${
        hasCustomComparisonContext ? ` untuk ${currentRange.label}` : ""
      } ${
        delta > 0 ? "naik" : delta < 0 ? "turun" : "stabil"
      } dibanding ${hasCustomComparisonContext ? previousRange.label : "periode sebelumnya"}.`,
      `- Periode sekarang${hasCustomComparisonContext ? ` (${currentRange.label})` : ""}: ${formatMoney(
        currentTotal
      )} dari ${currentMatching.length} transaksi`,
      `- Periode sebelumnya${hasCustomComparisonContext ? ` (${previousRange.label})` : ""}: ${formatMoney(
        previousTotal
      )} dari ${previousMatching.length} transaksi`,
      `- Perubahan: ${trendText}${percentText}`
    ].join("\n");
  }

  if (mode === "EXPLAIN_CHANGE") {
    const { currentRange, previousRange } = resolveComparisonRanges({
      period: params.period,
      rangeWindow: params.rangeWindow,
      dateRange: params.dateRange,
      comparisonRange: params.comparisonRange,
      now
    });
    const [currentTransactions, previousTransactions] = await Promise.all([
      getTransactionsByRange({
        userId: params.userId,
        start: currentRange.start,
        end: currentRange.end
      }),
      getTransactionsByRange({
        userId: params.userId,
        start: previousRange.start,
        end: previousRange.end
      })
    ]);

    const currentMatching = filterCategoryTransactions(currentTransactions, normalizedCategory, filterText);
    const previousMatching = filterCategoryTransactions(previousTransactions, normalizedCategory, filterText);
    const currentTotal = calculateTransactionTotal(currentMatching);
    const previousTotal = calculateTransactionTotal(previousMatching);
    const delta = currentTotal - previousTotal;

    if (delta <= 0) {
      return `Pengeluaran ${normalizedCategory}${buildFilterPhrase(filterText)}${
        hasCustomComparisonContext ? ` untuk ${currentRange.label}` : ""
      } tidak naik dibanding ${hasCustomComparisonContext ? previousRange.label : "periode sebelumnya"}, jadi belum ada kenaikan yang perlu dijelaskan.`;
    }

    const currentAverage = calculateAverageTransactionAmount(currentMatching);
    const previousAverage = calculateAverageTransactionAmount(previousMatching);
    const currentRecurringTotal = analyzeRecurringExpenses(currentMatching).reduce(
      (sum, entry) => sum + entry.total,
      0
    );
    const previousRecurringTotal = analyzeRecurringExpenses(previousMatching).reduce(
      (sum, entry) => sum + entry.total,
      0
    );
    const detailDeltaSnapshot = buildDetailDeltaSnapshot(currentMatching, previousMatching);
    const deltas = detailDeltaSnapshot.deltas.slice(0, 5);
    const topExisting = detailDeltaSnapshot.existingEntries[0] ?? null;
    const topNewEntries = detailDeltaSnapshot.newEntries.slice(0, 3);
    const driverReason = buildDriverReasonText({
      currentTransactions: currentMatching.length,
      previousTransactions: previousMatching.length,
      currentAverage,
      previousAverage
    });

    return [
      `Pengeluaran ${normalizedCategory}${buildFilterPhrase(filterText)} naik terutama karena merchant ini:`,
      `- Total sekarang${hasCustomComparisonContext ? ` (${currentRange.label})` : ""}: ${formatMoney(currentTotal)}`,
      `- Total sebelumnya${hasCustomComparisonContext ? ` (${previousRange.label})` : ""}: ${formatMoney(previousTotal)}`,
      `- Frekuensi transaksi: ${previousMatching.length} -> ${currentMatching.length}`,
      `- Rata-rata per transaksi: ${formatMoney(previousAverage)} -> ${formatMoney(currentAverage)}`,
      `- Driver utama: ${driverReason}`,
      `- Porsi recurring: ${formatMoney(previousRecurringTotal)} -> ${formatMoney(currentRecurringTotal)}`,
      ...(topExisting
        ? [
            `- Merchant lama dengan dorongan terbesar: ${topExisting.label} (+${formatMoney(topExisting.delta)})`
          ]
        : []),
      ...(topNewEntries.length
        ? [
            `- Merchant baru yang ikut mendorong kenaikan: ${topNewEntries
              .map((entry) => `${entry.label} (+${formatMoney(entry.delta)})`)
              .join(", ")}`
          ]
        : []),
      ...deltas.map(
        (entry, index) =>
          `${index + 1}. ${entry.label} | naik ${formatMoney(entry.delta)} (dari ${formatMoney(entry.previous)} ke ${formatMoney(entry.current)})`
      )
    ].join("\n");
  }

  if (mode === "AVERAGE_MONTHLY") {
    const allTransactions = await prisma.transaction.findMany({
      where: {
        userId: params.userId,
        type: "EXPENSE"
      },
      orderBy: { occurredAt: "asc" }
    });

    const matchingTransactions = filterCategoryTransactions(allTransactions, normalizedCategory, filterText);
    if (!matchingTransactions.length) {
      return `Belum ada transaksi di bucket ${normalizedCategory}${buildFilterPhrase(
        filterText
      )} untuk dihitung rata-rata bulanannya.`;
    }

    const firstDate = matchingTransactions[0].occurredAt;
    const lastDate = matchingTransactions[matchingTransactions.length - 1].occurredAt;
    const monthSpan = getMonthSpan(firstDate, lastDate);
    const total = matchingTransactions.reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
    const average = total / monthSpan;

    return [
      `Rata-rata pengeluaran ${normalizedCategory}${buildFilterPhrase(filterText)} per bulan: ${formatMoney(
        average
      )}.`,
      `- Total tercatat: ${formatMoney(total)}`,
      `- Basis perhitungan: ${monthSpan} bulan data`,
      `- Rentang data: ${MONTH_LABEL_FORMATTER.format(firstDate)} s.d. ${MONTH_LABEL_FORMATTER.format(lastDate)}`
    ].join("\n");
  }

  if (mode === "AVERAGE_WEEKLY") {
    const allTransactions = await prisma.transaction.findMany({
      where: {
        userId: params.userId,
        type: "EXPENSE"
      },
      orderBy: { occurredAt: "asc" }
    });

    const matchingTransactions = filterCategoryTransactions(allTransactions, normalizedCategory, filterText);
    if (!matchingTransactions.length) {
      return `Belum ada transaksi di bucket ${normalizedCategory}${buildFilterPhrase(
        filterText
      )} untuk dihitung rata-rata mingguannya.`;
    }

    const firstDate = matchingTransactions[0].occurredAt;
    const lastDate = matchingTransactions[matchingTransactions.length - 1].occurredAt;
    const weekSpan = getWeekSpan(firstDate, lastDate);
    const total = matchingTransactions.reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
    const average = total / weekSpan;

    return [
      `Rata-rata pengeluaran ${normalizedCategory}${buildFilterPhrase(filterText)} per minggu: ${formatMoney(
        average
      )}.`,
      `- Total tercatat: ${formatMoney(total)}`,
      `- Basis perhitungan: ${weekSpan} minggu data`,
      `- Rentang data: ${DATE_LABEL_FORMATTER.format(firstDate)} s.d. ${DATE_LABEL_FORMATTER.format(lastDate)}`
    ].join("\n");
  }

  const resolvedRange = resolvePrimaryDateRange({
    period: params.period,
    rangeWindow: params.rangeWindow,
    dateRange: params.dateRange,
    now
  });
  const periodLabel = buildPeriodLabel(
    params.period,
    params.rangeWindow ?? null,
    params.dateRange ?? null
  );
  const transactions = await getTransactionsByRange({
    userId: params.userId,
    start: resolvedRange.start,
    end: resolvedRange.end
  });

  const matchingTransactions = filterCategoryTransactions(transactions, normalizedCategory, filterText);

  if (!matchingTransactions.length) {
    return `Belum ada transaksi di bucket ${normalizedCategory}${buildFilterPhrase(filterText)} untuk ${periodLabel}.`;
  }

  const total = matchingTransactions.reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  if (mode === "SHARE_OF_BUCKET") {
    if (!filterText) {
      return `Sebutkan detail item di dalam bucket ${normalizedCategory} dulu ya, misalnya Spotify, Netflix, atau Biznet, supaya saya bisa hitung kontribusinya.`;
    }

    const bucketTotal = transactions
      .filter((transaction) => normalizeExpenseBucketCategory(transaction.category) === normalizedCategory)
      .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
    const share = bucketTotal > 0 ? (total / bucketTotal) * 100 : 0;

    return [
      `${filterText} berkontribusi ${share.toFixed(1)}% dari bucket ${normalizedCategory} untuk ${periodLabel}.`,
      `- Total ${filterText}: ${formatMoney(total)}`,
      `- Total bucket ${normalizedCategory}: ${formatMoney(bucketTotal)}`,
      `- Jumlah transaksi ${filterText}: ${matchingTransactions.length}`
    ].join("\n");
  }

  if (mode === "TOP_MERCHANTS" || mode === "TOP_MERCHANTS_BY_COUNT") {
    const merchantMap = new Map<string, { total: number; count: number }>();
    for (const transaction of matchingTransactions) {
      const label = resolveTransactionDetailLabel(transaction);
      const current = merchantMap.get(label) ?? { total: 0, count: 0 };
      current.total += toNumber(transaction.amount);
      current.count += 1;
      merchantMap.set(label, current);
    }

    const limit = Math.max(1, Math.min(10, params.limit ?? 3));
    const topMerchants = Array.from(merchantMap.entries())
      .map(([label, value]) => ({ label, ...value }))
      .sort((left, right) =>
        mode === "TOP_MERCHANTS_BY_COUNT"
          ? right.count - left.count || right.total - left.total
          : right.total - left.total || right.count - left.count
      )
      .slice(0, limit);

    return [
      `${
        mode === "TOP_MERCHANTS_BY_COUNT" ? "Merchant paling sering" : `Top ${topMerchants.length} merchant`
      } di bucket ${normalizedCategory}${buildFilterPhrase(filterText)} untuk ${periodLabel}:`,
      ...topMerchants.map(
        (merchant, index) =>
          `${index + 1}. ${merchant.label} | ${formatMoney(merchant.total)} | ${merchant.count} transaksi`
      )
    ].join("\n");
  }

  if (mode === "COUNT") {
    return `Ada ${matchingTransactions.length} transaksi di bucket ${normalizedCategory}${buildFilterPhrase(
      filterText
    )} untuk ${periodLabel}.`;
  }

  if (mode === "TOTAL") {
    return `Total pengeluaran ${normalizedCategory}${buildFilterPhrase(
      filterText
    )} untuk ${periodLabel} adalah ${formatMoney(total)} dari ${matchingTransactions.length} transaksi.`;
  }

  if (mode === "TOP") {
    const topTransactions = [...matchingTransactions]
      .sort((left, right) => toNumber(right.amount) - toNumber(left.amount))
      .slice(0, 3);
    return [
      `Transaksi terbesar di bucket ${normalizedCategory}${buildFilterPhrase(filterText)} untuk ${periodLabel}:`,
      `- Total bucket: ${formatMoney(total)}`,
      ...topTransactions.map((transaction, index) => {
        const date = DATE_LABEL_FORMATTER.format(transaction.occurredAt);
        const amount = formatMoney(transaction.amount);
        const label = resolveTransactionDetailLabel(transaction);
        return `${index + 1}. ${date} | ${amount} | ${label}`;
      })
    ].join("\n");
  }

  const visibleTransactions = matchingTransactions.slice(0, 15);
  const hiddenCount = matchingTransactions.length - visibleTransactions.length;
  const lines = [
    `Rincian transaksi ${normalizedCategory}${buildFilterPhrase(filterText)} untuk ${periodLabel}:`,
    `- Total transaksi: ${matchingTransactions.length}`,
    `- Total pengeluaran: ${formatMoney(total)}`,
    ...visibleTransactions.map((transaction, index) => {
      const date = DATE_LABEL_FORMATTER.format(transaction.occurredAt);
      const amount = formatMoney(transaction.amount);
      const label = resolveTransactionDetailLabel(transaction);
      return `${index + 1}. ${date} | ${amount} | ${label}`;
    })
  ];

  if (hiddenCount > 0) {
    lines.push(`- Dan ${hiddenCount} transaksi lain di bucket ini.`);
  }

  return lines.join("\n");
};

export const buildGeneralAnalyticsReport = async (params: {
  userId: string;
  mode: GeneralAnalyticsReportMode;
  period: ReportPeriod;
  limit?: number | null;
  rangeWindow?: CategoryReportRangeWindow | null;
  dateRange?: ReportDateRange | null;
  comparisonRange?: ReportComparisonRange | null;
}) => {
  const now = new Date();
  const hasCustomComparisonContext = Boolean(
    params.comparisonRange || params.dateRange || params.rangeWindow
  );

  if (params.mode === "TOP_CATEGORY_INCREASE") {
    const { currentRange, previousRange } = resolveComparisonRanges({
      period: params.period,
      rangeWindow: params.rangeWindow,
      dateRange: params.dateRange,
      comparisonRange: params.comparisonRange,
      now
    });
    const [currentTransactions, previousTransactions] = await Promise.all([
      getTransactionsByRange({
        userId: params.userId,
        start: currentRange.start,
        end: currentRange.end
      }),
      getTransactionsByRange({
        userId: params.userId,
        start: previousRange.start,
        end: previousRange.end
      })
    ]);

    const currentTotals = aggregateByBucket(currentTransactions);
    const previousTotals = aggregateByBucket(previousTransactions);
    const categories = new Set([...currentTotals.keys(), ...previousTotals.keys()]);
    const changes = Array.from(categories)
      .map((category) => {
        const current = currentTotals.get(category) ?? 0;
        const previous = previousTotals.get(category) ?? 0;
        const delta = current - previous;
        return {
          category,
          current,
          previous,
          delta,
          percent: previous > 0 ? (delta / previous) * 100 : null
        };
      })
      .sort((left, right) => right.delta - left.delta);

    const topChange = changes[0];
    if (!topChange || topChange.delta <= 0) {
      return `Belum ada kategori yang naik dibanding periode sebelumnya. Pengeluaranmu cenderung stabil atau menurun.`;
    }

    const currentCategoryTransactions = currentTransactions.filter(
      (transaction) => normalizeExpenseBucketCategory(transaction.category) === topChange.category
    );
    const previousCategoryTransactions = previousTransactions.filter(
      (transaction) => normalizeExpenseBucketCategory(transaction.category) === topChange.category
    );
    const topCategoryDriver = buildDriverReasonText({
      currentTransactions: currentCategoryTransactions.length,
      previousTransactions: previousCategoryTransactions.length,
      currentAverage: calculateAverageTransactionAmount(currentCategoryTransactions),
      previousAverage: calculateAverageTransactionAmount(previousCategoryTransactions)
    });
    const topCategoryDeltaSnapshot = buildDetailDeltaSnapshot(
      currentCategoryTransactions,
      previousCategoryTransactions
    );

    const topLines = changes
      .filter((item) => item.delta > 0)
      .slice(0, 3)
      .map((item, index) => {
        const percentText = item.percent != null ? ` (${item.percent.toFixed(1)}%)` : "";
        return `${index + 1}. ${item.category} | naik ${formatMoney(item.delta)}${percentText}`;
      });

    return [
      `Kategori dengan kenaikan terbesar dibanding ${
        hasCustomComparisonContext ? previousRange.label : "periode sebelumnya"
      } adalah ${topChange.category}.`,
      `- Periode sekarang${hasCustomComparisonContext ? ` (${currentRange.label})` : ""}: ${formatMoney(topChange.current)}`,
      `- Periode sebelumnya${hasCustomComparisonContext ? ` (${previousRange.label})` : ""}: ${formatMoney(topChange.previous)}`,
      `- Kenaikan: ${formatMoney(topChange.delta)}${
        topChange.percent != null ? ` (${topChange.percent.toFixed(1)}%)` : ""
      }`,
      `- Driver utama: ${topCategoryDriver}`,
      ...(topCategoryDeltaSnapshot.deltas[0]
        ? [
            `- Merchant paling mendorong: ${topCategoryDeltaSnapshot.deltas[0].label} (+${formatMoney(
              topCategoryDeltaSnapshot.deltas[0].delta
            )})`
          ]
        : []),
      ...(topLines.length ? ["- Ranking kenaikan tertinggi:", ...topLines] : [])
    ].join("\n");
  }

  if (params.mode === "TOP_MERCHANT_DELTA") {
    const { currentRange, previousRange } = resolveComparisonRanges({
      period: params.period,
      rangeWindow: params.rangeWindow,
      dateRange: params.dateRange,
      comparisonRange: params.comparisonRange,
      now
    });
    const [currentTransactions, previousTransactions] = await Promise.all([
      getTransactionsByRange({
        userId: params.userId,
        start: currentRange.start,
        end: currentRange.end
      }),
      getTransactionsByRange({
        userId: params.userId,
        start: previousRange.start,
        end: previousRange.end
      })
    ]);

    const currentByLabel = aggregateByDetailLabel(currentTransactions);
    const previousByLabel = aggregateByDetailLabel(previousTransactions);
    const previousMap = new Map(previousByLabel.map((entry) => [`${entry.bucket}::${entry.label}`, entry.total]));
    const deltas = currentByLabel
      .map((entry) => {
        const previous = previousMap.get(`${entry.bucket}::${entry.label}`) ?? 0;
        return {
          label: entry.label,
          bucket: entry.bucket,
          current: entry.total,
          previous,
          delta: entry.total - previous
        };
      })
      .filter((entry) => entry.delta > 0)
      .sort((left, right) => right.delta - left.delta);

    const topDelta = deltas[0];
    if (!topDelta) {
      return `Belum ada merchant dengan kenaikan selisih positif dibanding periode sebelumnya.`;
    }

    const currentMerchantTransactions = currentTransactions.filter(
      (transaction) =>
        `${normalizeExpenseBucketCategory(transaction.category)}::${resolveTransactionDetailLabel(transaction)}` ===
        `${topDelta.bucket}::${topDelta.label}`
    );
    const previousMerchantTransactions = previousTransactions.filter(
      (transaction) =>
        `${normalizeExpenseBucketCategory(transaction.category)}::${resolveTransactionDetailLabel(transaction)}` ===
        `${topDelta.bucket}::${topDelta.label}`
    );
    const topMerchantDriver = buildDriverReasonText({
      currentTransactions: currentMerchantTransactions.length,
      previousTransactions: previousMerchantTransactions.length,
      currentAverage: calculateAverageTransactionAmount(currentMerchantTransactions),
      previousAverage: calculateAverageTransactionAmount(previousMerchantTransactions)
    });

    return [
      `Selisih terbesar datang dari ${topDelta.label} di bucket ${topDelta.bucket}.`,
      `- Periode sekarang${hasCustomComparisonContext ? ` (${currentRange.label})` : ""}: ${formatMoney(topDelta.current)}`,
      `- Periode sebelumnya${hasCustomComparisonContext ? ` (${previousRange.label})` : ""}: ${formatMoney(topDelta.previous)}`,
      `- Selisih: ${formatMoney(topDelta.delta)}`,
      `- Frekuensi transaksi: ${previousMerchantTransactions.length} -> ${currentMerchantTransactions.length}`,
      `- Rata-rata per transaksi: ${formatMoney(
        calculateAverageTransactionAmount(previousMerchantTransactions)
      )} -> ${formatMoney(calculateAverageTransactionAmount(currentMerchantTransactions))}`,
      `- Driver utama: ${topMerchantDriver}`,
      `- Status merchant: ${topDelta.previous <= 0 ? "merchant baru di periode sekarang" : "merchant lama dengan kenaikan spending"}`,
      "- Merchant dengan selisih terbesar:",
      ...deltas.slice(0, 5).map(
        (entry, index) => `${index + 1}. ${entry.label} | ${entry.bucket} | naik ${formatMoney(entry.delta)}`
      )
    ].join("\n");
  }

  if (params.mode === "NEW_MERCHANTS") {
    const { currentRange, previousRange } = resolveComparisonRanges({
      period: params.period,
      rangeWindow: params.rangeWindow,
      dateRange: params.dateRange,
      comparisonRange: params.comparisonRange,
      now
    });
    const [currentTransactions, previousTransactions] = await Promise.all([
      getTransactionsByRange({
        userId: params.userId,
        start: currentRange.start,
        end: currentRange.end
      }),
      getTransactionsByRange({
        userId: params.userId,
        start: previousRange.start,
        end: previousRange.end
      })
    ]);

    const currentStats = aggregateByDetailStats(currentTransactions);
    const previousKeys = new Set(
      aggregateByDetailStats(previousTransactions).map((entry) => `${entry.bucket}::${entry.label}`)
    );
    const allNewEntries = currentStats
      .filter((entry) => !previousKeys.has(`${entry.bucket}::${entry.label}`))
      .sort((left, right) => right.total - left.total || right.count - left.count);

    if (!allNewEntries.length) {
      return `Belum ada merchant/detail baru yang muncul untuk ${currentRange.label} dibanding ${previousRange.label}.`;
    }

    const limit = Math.max(1, Math.min(10, params.limit ?? 5));
    const newEntries = allNewEntries.slice(0, limit);

    return [
      `Merchant/detail baru yang muncul untuk ${currentRange.label}:`,
      `- Dibanding ${previousRange.label}, ada ${allNewEntries.length} merchant/detail baru.`,
      ...newEntries.map(
        (entry, index) =>
          `${index + 1}. ${entry.label} | ${entry.bucket} | ${formatMoney(entry.total)} | ${entry.count} transaksi`
      )
    ].join("\n");
  }

  if (params.mode === "WEEKEND_VS_WEEKDAY") {
    const resolvedRange = resolvePrimaryDateRange({
      period: params.period,
      rangeWindow: params.rangeWindow,
      dateRange: params.dateRange,
      now
    });
    const periodLabel = buildPeriodLabel(
      params.period,
      params.rangeWindow ?? null,
      params.dateRange ?? null
    );
    const transactions = await getTransactionsByRange({
      userId: params.userId,
      start: resolvedRange.start,
      end: resolvedRange.end
    });

    if (!transactions.length) {
      return `Belum ada transaksi pengeluaran untuk menganalisis pola weekend vs weekday di ${periodLabel}.`;
    }

    const weekendTransactions = transactions.filter((transaction) => isWeekendDate(transaction.occurredAt));
    const weekdayTransactions = transactions.filter((transaction) => !isWeekendDate(transaction.occurredAt));
    const weekendTotal = calculateTransactionTotal(weekendTransactions);
    const weekdayTotal = calculateTransactionTotal(weekdayTransactions);
    const weekendDays = Math.max(1, countDaysInRange(resolvedRange, isWeekendDate));
    const weekdayDays = Math.max(1, countDaysInRange(resolvedRange, (date) => !isWeekendDate(date)));
    const weekendAveragePerDay = weekendTotal / weekendDays;
    const weekdayAveragePerDay = weekdayTotal / weekdayDays;
    const direction =
      weekendAveragePerDay > weekdayAveragePerDay * 1.05
        ? "lebih berat di weekend"
        : weekdayAveragePerDay > weekendAveragePerDay * 1.05
          ? "lebih berat di hari kerja"
          : "cukup seimbang antara weekend dan hari kerja";
    const weekendBucketRanking = Array.from(aggregateByBucket(weekendTransactions).entries()).sort(
      (left, right) => right[1] - left[1]
    );
    const topWeekendDetail = [...aggregateByDetailStats(weekendTransactions)].sort(
      (left, right) => right.total - left.total
    )[0];

    return [
      `Untuk ${periodLabel}, pengeluaranmu ${direction}.`,
      `- Weekend: ${formatMoney(weekendTotal)} dari ${weekendTransactions.length} transaksi | rata-rata ${formatMoney(
        weekendAveragePerDay
      )}/hari weekend`,
      `- Hari kerja: ${formatMoney(weekdayTotal)} dari ${weekdayTransactions.length} transaksi | rata-rata ${formatMoney(
        weekdayAveragePerDay
      )}/hari kerja`,
      ...(weekendBucketRanking[0]
        ? [`- Bucket paling dominan saat weekend: ${weekendBucketRanking[0][0]} (${formatMoney(weekendBucketRanking[0][1])})`]
        : []),
      ...(topWeekendDetail
        ? [`- Detail paling menonjol saat weekend: ${topWeekendDetail.label} (${formatMoney(topWeekendDetail.total)})`]
        : [])
    ].join("\n");
  }

  if (params.mode === "HABIT_LEAKS") {
    const resolvedRange = resolvePrimaryDateRange({
      period: params.period,
      rangeWindow: params.rangeWindow,
      dateRange: params.dateRange,
      now
    });
    const periodLabel = buildPeriodLabel(
      params.period,
      params.rangeWindow ?? null,
      params.dateRange ?? null
    );
    const transactions = await getTransactionsByRange({
      userId: params.userId,
      start: resolvedRange.start,
      end: resolvedRange.end
    });

    if (!transactions.length) {
      return `Belum ada transaksi pengeluaran untuk membaca pola kebiasaan di ${periodLabel}.`;
    }

    const leakSnapshot = buildHabitLeakSnapshot(transactions);
    const limit = Math.max(1, Math.min(10, params.limit ?? 3));
    const lines = [`Pola kebiasaan yang paling berpotensi bikin bocor untuk ${periodLabel}:`];

    if (leakSnapshot.smallFrequent.length) {
      lines.push(
        `- Pengeluaran receh tapi sering paling menonjol: ${leakSnapshot.smallFrequent
          .slice(0, limit)
          .map(
            (entry) =>
              `${entry.label} (${entry.count}x, total ${formatMoney(entry.total)}, rata-rata ${formatMoney(entry.averageAmount)})`
          )
          .join(", ")}`
      );
    }

    if (leakSnapshot.recurring.length) {
      const topRecurring = leakSnapshot.recurring[0];
      lines.push(
        `- Pola recurring paling kuat: ${topRecurring.label} | ${topRecurring.count} transaksi | total ${formatMoney(
          topRecurring.total
        )}`
      );
    }

    if (leakSnapshot.weekendHeavy.length) {
      const weekendHeavyTop = leakSnapshot.weekendHeavy[0];
      lines.push(
        `- Weekend leak paling kuat: ${weekendHeavyTop.label} | weekend ${formatMoney(
          weekendHeavyTop.weekendTotal
        )} vs weekday ${formatMoney(weekendHeavyTop.weekdayTotal)}`
      );
    }

    const frequentDetails = [...leakSnapshot.detailStats]
      .sort((left, right) => right.count - left.count || right.total - left.total)
      .slice(0, limit);
    if (frequentDetails.length) {
      lines.push("- Detail yang paling sering muncul:");
      lines.push(
        ...frequentDetails.map(
          (entry, index) =>
            `${index + 1}. ${entry.label} | ${entry.bucket} | ${entry.count}x | ${formatMoney(entry.total)}`
        )
      );
    }

    return lines.length > 1
      ? lines.join("\n")
      : `Belum ada pola kebiasaan yang cukup kuat untuk dibaca di ${periodLabel}.`;
  }

  const resolvedRange = resolvePrimaryDateRange({
    period: params.period,
    rangeWindow: params.rangeWindow,
    dateRange: params.dateRange,
    now
  });
  const periodLabel = buildPeriodLabel(
    params.period,
    params.rangeWindow ?? null,
    params.dateRange ?? null
  );
  const transactions = await getTransactionsByRange({
    userId: params.userId,
    start: resolvedRange.start,
    end: resolvedRange.end
  });

  const recurringEntries = analyzeRecurringExpenses(transactions);

  if (!recurringEntries.length) {
    return `Belum ada recurring expense yang cukup kuat terdeteksi untuk ${periodLabel}.`;
  }

  const limit = Math.max(1, Math.min(10, params.limit ?? 5));
  const topRecurring = recurringEntries.slice(0, limit);

  return [
    `Top recurring expense untuk ${periodLabel}:`,
    ...topRecurring.map(
      (entry, index) =>
        `${index + 1}. ${entry.label} | ${entry.bucket} | ${formatMoney(entry.total)} | ${entry.count} transaksi${
          entry.isSubscriptionLikely ? " | kemungkinan langganan" : ""
        } | ${buildRecurringCadenceLabel(entry.cadence)} | confidence ${Math.round(
          entry.confidenceScore * 100
        )}%${
          entry.nextExpectedAt
            ? ` | prediksi berikutnya ${RECURRING_DATE_LABEL_FORMATTER.format(entry.nextExpectedAt)}`
            : ""
        }`
    )
  ].join("\n");
};
