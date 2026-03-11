import { buildReportSummaryText, reportPeriodSchema, reportingChartRequestSchema } from "@finance/shared";
import type { ReportPeriod } from "@finance/shared";
import { prisma } from "../prisma";
import { env } from "../env";
import { aggregateTransactions, getPeriodRange } from "./aggregation";
import {
  detectExpenseBucketMatches,
  normalizeExpenseBucketCategory
} from "./category-override-service";
import { normalizeDetectedMerchant } from "./merchant-normalization-service";
import { formatMoney } from "./money-format";
import { analyzeRecurringExpenses } from "./recurring-expense-service";

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

export const getUserReportData = async (userId: string, period: ReportPeriod) => {
  const range = getPeriodRange(period, new Date());
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
  categoryBreakdown: Array<{ category: string; total: number }>
) => {
  const topCategory = categoryBreakdown[0];
  const topCategoryText = topCategory
    ? `Top expense category: ${topCategory.category} (${topCategory.total.toFixed(2)}).`
    : "No expense category data.";

  return `${buildReportSummaryText(period, incomeTotal, expenseTotal)} ${topCategoryText}`;
};

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short"
});

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
};

export type GeneralAnalyticsReportMode =
  | "TOP_CATEGORY_INCREASE"
  | "TOP_RECURRING_EXPENSES"
  | "TOP_MERCHANT_DELTA";

export type GeneralAnalyticsQuery = {
  mode: GeneralAnalyticsReportMode;
  period: ReportPeriod;
  limit: number | null;
  rangeWindow: CategoryReportRangeWindow | null;
};

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

const buildTransactionDetailLabel = (transaction: {
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
}) =>
  normalizeDetectedMerchant({
    merchant: transaction.merchant ?? null,
    rawText: [transaction.note ?? "", transaction.rawText ?? ""].filter(Boolean).join(" ")
  }) ??
  transaction.merchant ??
  transaction.note ??
  transaction.rawText ??
  "Tanpa keterangan";

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

const sanitizeFilterText = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = normalizeText(value)
    .replace(/\b(?:aja|saja|doang|only)\b/gi, "")
    .replace(/\b(?:\d+\s+(?:bulan|minggu|hari)\s+terakhir)\b/gi, "")
    .replace(/\b(?:bulan ini|minggu ini|hari ini|today|weekly|monthly|daily)\b/gi, "")
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
    rangeWindow
  };
};

const buildTransactionSearchText = (transaction: {
  category: string;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
}) =>
  normalizeText(
    [
      transaction.category,
      transaction.merchant ?? "",
      normalizeDetectedMerchant({
        merchant: transaction.merchant ?? null,
        rawText: [transaction.note ?? "", transaction.rawText ?? ""].filter(Boolean).join(" ")
      }) ?? "",
      transaction.note ?? "",
      transaction.rawText ?? ""
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
  );

const matchesFilterText = (transaction: {
  category: string;
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

const buildPeriodLabel = (period: ReportPeriod, rangeWindow: CategoryReportRangeWindow | null) =>
  rangeWindow ? buildRangeWindowLabel(rangeWindow) : PERIOD_LABELS[period];

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

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  month: "short",
  year: "numeric"
});

const aggregateByBucket = <T extends { category: string; amount: unknown }>(transactions: T[]) => {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    const bucket = normalizeExpenseBucketCategory(transaction.category);
    totals.set(bucket, (totals.get(bucket) ?? 0) + toNumber(transaction.amount));
  }
  return totals;
};

const aggregateByDetailLabel = <T extends {
  category: string;
  amount: unknown;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
}>(transactions: T[]) => {
  const totals = new Map<string, { total: number; bucket: string }>();
  for (const transaction of transactions) {
    const label = buildTransactionDetailLabel(transaction);
    const key = `${normalizeExpenseBucketCategory(transaction.category)}::${label}`;
    const current = totals.get(key) ?? {
      total: 0,
      bucket: normalizeExpenseBucketCategory(transaction.category)
    };
    current.total += toNumber(transaction.amount);
    totals.set(key, current);
  }

  return Array.from(totals.entries()).map(([key, value]) => {
    const [, label] = key.split("::");
    return {
      label,
      bucket: value.bucket,
      total: value.total
    };
  });
};

export const parseGeneralAnalyticsQuery = (rawText: string): GeneralAnalyticsQuery | null => {
  const text = normalizeText(rawText);
  if (!text) return null;
  const normalized = text.toLowerCase();

  if (
    includesAnyPhrase(normalized, ["kategori", "bucket"]) &&
    (includesAnyPhrase(normalized, ["paling naik", "naik paling besar", "kenaikan terbesar", "lonjakannya paling besar"]) ||
      includesAllPhraseGroups(normalized, [CHANGE_TERMS, COMPARE_TERMS, PREVIOUS_PERIOD_TERMS]))
  ) {
    return {
      mode: "TOP_CATEGORY_INCREASE",
      period: detectComparisonPeriod(text),
      limit: null,
      rangeWindow: null
    };
  }

  if (
    (includesAnyPhrase(normalized, ["selisih terbesar", "perbedaan terbesar", "delta terbesar"]) &&
      includesAnyPhrase(normalized, MERCHANT_TERMS)) ||
    (includesAnyPhrase(normalized, MERCHANT_TERMS) &&
      includesAnyPhrase(normalized, ["paling ngedorong", "paling dorong", "penyumbang kenaikan terbesar", "bikin spending naik", "bikin pengeluaran naik"]))
  ) {
    return {
      mode: "TOP_MERCHANT_DELTA",
      period: detectRelativePeriod(text, "monthly"),
      limit: 5,
      rangeWindow: null
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
      rangeWindow: extractRangeWindow(text)
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
}) => {
  const normalizedCategory = normalizeExpenseBucketCategory(params.category);
  const filterText = sanitizeFilterText(params.filterText);
  const mode = params.mode ?? "LIST";
  const now = new Date();

  if (mode === "COMPARE_PREVIOUS") {
    const { currentRange, previousRange } = getPreviousComparableRange(params.period, now);
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
      `Pengeluaran ${normalizedCategory}${buildFilterPhrase(filterText)} ${
        delta > 0 ? "naik" : delta < 0 ? "turun" : "stabil"
      } dibanding periode sebelumnya.`,
      `- Periode sekarang: ${formatMoney(currentTotal)} dari ${currentMatching.length} transaksi`,
      `- Periode sebelumnya: ${formatMoney(previousTotal)} dari ${previousMatching.length} transaksi`,
      `- Perubahan: ${trendText}${percentText}`
    ].join("\n");
  }

  if (mode === "EXPLAIN_CHANGE") {
    const { currentRange, previousRange } = getPreviousComparableRange(params.period, now);
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

    if (delta <= 0) {
      return `Pengeluaran ${normalizedCategory}${buildFilterPhrase(filterText)} tidak naik dibanding periode sebelumnya, jadi belum ada kenaikan yang perlu dijelaskan.`;
    }

    const currentByLabel = aggregateByDetailLabel(currentMatching);
    const previousByLabel = aggregateByDetailLabel(previousMatching);
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
      .sort((left, right) => right.delta - left.delta)
      .slice(0, 5);

    return [
      `Pengeluaran ${normalizedCategory}${buildFilterPhrase(filterText)} naik terutama karena merchant ini:`,
      `- Total sekarang: ${formatMoney(currentTotal)}`,
      `- Total sebelumnya: ${formatMoney(previousTotal)}`,
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

  const periodLabel = buildPeriodLabel(params.period, params.rangeWindow ?? null);
  const range =
    params.rangeWindow != null ? getRangeWindowBounds(params.rangeWindow, now) : getPeriodRange(params.period, now);
  const transactions = await getTransactionsByRange({
    userId: params.userId,
    start: range.start,
    end: range.end
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
      const label = buildTransactionDetailLabel(transaction);
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
        const amount = formatMoney(toNumber(transaction.amount));
        const label = buildTransactionDetailLabel(transaction);
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
      const amount = formatMoney(toNumber(transaction.amount));
      const label = buildTransactionDetailLabel(transaction);
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
}) => {
  const now = new Date();

  if (params.mode === "TOP_CATEGORY_INCREASE") {
    const { currentRange, previousRange } = getPreviousComparableRange(params.period, now);
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

    const topLines = changes
      .filter((item) => item.delta > 0)
      .slice(0, 3)
      .map((item, index) => {
        const percentText = item.percent != null ? ` (${item.percent.toFixed(1)}%)` : "";
        return `${index + 1}. ${item.category} | naik ${formatMoney(item.delta)}${percentText}`;
      });

    return [
      `Kategori dengan kenaikan terbesar dibanding periode sebelumnya adalah ${topChange.category}.`,
      `- Periode sekarang: ${formatMoney(topChange.current)}`,
      `- Periode sebelumnya: ${formatMoney(topChange.previous)}`,
      `- Kenaikan: ${formatMoney(topChange.delta)}${
        topChange.percent != null ? ` (${topChange.percent.toFixed(1)}%)` : ""
      }`,
      ...(topLines.length ? ["- Ranking kenaikan tertinggi:", ...topLines] : [])
    ].join("\n");
  }

  if (params.mode === "TOP_MERCHANT_DELTA") {
    const { currentRange, previousRange } = getPreviousComparableRange(params.period, now);
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

    return [
      `Selisih terbesar datang dari ${topDelta.label} di bucket ${topDelta.bucket}.`,
      `- Periode sekarang: ${formatMoney(topDelta.current)}`,
      `- Periode sebelumnya: ${formatMoney(topDelta.previous)}`,
      `- Selisih: ${formatMoney(topDelta.delta)}`,
      "- Merchant dengan selisih terbesar:",
      ...deltas.slice(0, 5).map(
        (entry, index) => `${index + 1}. ${entry.label} | ${entry.bucket} | naik ${formatMoney(entry.delta)}`
      )
    ].join("\n");
  }

  const periodLabel = buildPeriodLabel(params.period, params.rangeWindow ?? null);
  const range =
    params.rangeWindow != null ? getRangeWindowBounds(params.rangeWindow, now) : getPeriodRange(params.period, now);
  const transactions = await getTransactionsByRange({
    userId: params.userId,
    start: range.start,
    end: range.end
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
        }`
    )
  ].join("\n");
};
