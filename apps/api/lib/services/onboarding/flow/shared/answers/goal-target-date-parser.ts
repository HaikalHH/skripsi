import { FinancialGoalType } from "@prisma/client";
import {
  extractIntegerFromFreeText,
  normalizeLooseText
} from "@/lib/services/onboarding/flow/shared/intent/onboarding-intent-service";
import { isSkipChoice } from "@/lib/services/onboarding/flow/shared/answers/common-input";

export type MonthYearTargetAnswer = {
  month: number;
  year: number;
  monthsFromNow: number;
  label: string;
};

export type GoalTargetEvaluationStatus =
  | "feasible"
  | "aggressive"
  | "impossible_sequential"
  | "needs_parallel";

export type GoalTargetUserDecision = "original" | "realistic" | "skipped" | "pending";

export type StoredGoalTargetAnswer = {
  goalType: FinancialGoalType | null;
  name: string | null;
  amount: number | null;
  target: MonthYearTargetAnswer;
  desiredDate: MonthYearTargetAnswer;
  realisticDate: MonthYearTargetAnswer | null;
  realisticStartDate: MonthYearTargetAnswer | null;
  realisticEndDate: MonthYearTargetAnswer | null;
  requiredMonthlyForDesiredDate: number | null;
  allocatedMonthly: number | null;
  gapMonthly: number | null;
  status: GoalTargetEvaluationStatus;
  userDecision: GoalTargetUserDecision;
};

const MONTH_TOKEN_MAP: Record<string, number> = {
  jan: 1,
  januari: 1,
  january: 1,
  feb: 2,
  februari: 2,
  february: 2,
  mar: 3,
  maret: 3,
  march: 3,
  apr: 4,
  april: 4,
  mei: 5,
  may: 5,
  jun: 6,
  juni: 6,
  june: 6,
  jul: 7,
  juli: 7,
  july: 7,
  agu: 8,
  ags: 8,
  agustus: 8,
  august: 8,
  aug: 8,
  sep: 9,
  sept: 9,
  septmber: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  october: 10,
  oct: 10,
  nov: 11,
  november: 11,
  dec: 12,
  desember: 12,
  december: 12,
  des: 12
};

const MONTH_YEAR_TARGET_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta"
});

const getCurrentJakartaMonthYear = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jakarta"
  }).formatToParts(new Date());

  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "1970");

  return { month, year };
};

const MAX_TARGET_YEARS_AHEAD = 70;

const buildMonthYearTargetAnswer = (
  month: number,
  year: number
): MonthYearTargetAnswer | undefined => {
  const { year: currentYear, month: currentMonth } = getCurrentJakartaMonthYear();
  const monthsFromNow = (year - currentYear) * 12 + (month - currentMonth);

  if (
    month < 1 ||
    month > 12 ||
    monthsFromNow <= 0 ||
    monthsFromNow > MAX_TARGET_YEARS_AHEAD * 12
  ) {
    return undefined;
  }

  return {
    month,
    year,
    monthsFromNow,
    label: MONTH_YEAR_TARGET_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1, 12)))
  };
};

const isMonthYearTargetAnswer = (value: unknown): value is MonthYearTargetAnswer => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.month === "number" &&
    typeof candidate.year === "number" &&
    typeof candidate.monthsFromNow === "number" &&
    typeof candidate.label === "string"
  );
};

export const isStoredGoalTargetAnswer = (value: unknown): value is StoredGoalTargetAnswer => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.goalType === null || typeof candidate.goalType === "string") &&
    (candidate.name === null || typeof candidate.name === "string") &&
    (candidate.amount === null || typeof candidate.amount === "number") &&
    isMonthYearTargetAnswer(candidate.target) &&
    isMonthYearTargetAnswer(candidate.desiredDate) &&
    (candidate.realisticDate === null || isMonthYearTargetAnswer(candidate.realisticDate)) &&
    (candidate.realisticStartDate === null ||
      isMonthYearTargetAnswer(candidate.realisticStartDate)) &&
    (candidate.realisticEndDate === null ||
      isMonthYearTargetAnswer(candidate.realisticEndDate)) &&
    typeof candidate.status === "string" &&
    typeof candidate.userDecision === "string"
  );
};

export const getGoalTargetAnswerFromStoredValue = (
  value: unknown
): MonthYearTargetAnswer | null => {
  if (isMonthYearTargetAnswer(value)) return value;
  if (isStoredGoalTargetAnswer(value)) return value.target;
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  return isMonthYearTargetAnswer(candidate.target) ? candidate.target : null;
};

const parseMonthYearToken = (value: string) => {
  const normalized = normalizeLooseText(value)
    .replace(/\s+/g, " ")
    .trim();

  const monthYearMatch = normalized.match(/^(\d{1,2})\s*[\/.-]\s*(\d{4})$/);
  if (monthYearMatch) {
    return buildMonthYearTargetAnswer(Number(monthYearMatch[1]), Number(monthYearMatch[2]));
  }

  const yearMonthMatch = normalized.match(/^(\d{4})\s*[\/.-]\s*(\d{1,2})$/);
  if (yearMonthMatch) {
    return buildMonthYearTargetAnswer(Number(yearMonthMatch[2]), Number(yearMonthMatch[1]));
  }

  const fullNumericDateMatch = normalized.match(/^(\d{1,2})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{4})$/);
  if (fullNumericDateMatch) {
    const day = Number(fullNumericDateMatch[1]);
    return day >= 1 && day <= 31
      ? buildMonthYearTargetAnswer(Number(fullNumericDateMatch[2]), Number(fullNumericDateMatch[3]))
      : undefined;
  }

  const dayMonthNameYearMatch = normalized.match(/^(?:(?:tgl|tanggal)\s+)?(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i);
  if (dayMonthNameYearMatch) {
    const day = Number(dayMonthNameYearMatch[1]);
    const month = MONTH_TOKEN_MAP[dayMonthNameYearMatch[2]];
    return day >= 1 && day <= 31 && month
      ? buildMonthYearTargetAnswer(month, Number(dayMonthNameYearMatch[3]))
      : undefined;
  }

  const monthNameFirstMatch = normalized.match(/^([a-z]+)\s+(\d{4})$/i);
  if (monthNameFirstMatch) {
    const month = MONTH_TOKEN_MAP[monthNameFirstMatch[1]];
    return month ? buildMonthYearTargetAnswer(month, Number(monthNameFirstMatch[2])) : undefined;
  }

  const yearFirstMonthNameMatch = normalized.match(/^(\d{4})\s+([a-z]+)$/i);
  if (yearFirstMonthNameMatch) {
    const month = MONTH_TOKEN_MAP[yearFirstMonthNameMatch[2]];
    return month ? buildMonthYearTargetAnswer(month, Number(yearFirstMonthNameMatch[1])) : undefined;
  }

  const spokenFormatMatch = normalized.match(/bulan\s*(\d{1,2}).*tahun\s*(\d{4})/i);
  if (spokenFormatMatch) {
    return buildMonthYearTargetAnswer(
      Number(spokenFormatMatch[1]),
      Number(spokenFormatMatch[2])
    );
  }

  return undefined;
};

const looksLikeMonthYearToken = (value: string) => {
  const normalized = normalizeLooseText(value)
    .replace(/\s+/g, " ")
    .trim();

  return (
    /^(\d{1,2})\s*[\/.-]\s*(\d{4})$/.test(normalized) ||
    /^(\d{4})\s*[\/.-]\s*(\d{1,2})$/.test(normalized) ||
    /^(\d{1,2})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{4})$/.test(normalized) ||
    /^(?:(?:tgl|tanggal)\s+)?(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i.test(normalized) ||
    /^([a-z]+)\s+(\d{4})$/i.test(normalized) ||
    /^(\d{4})\s+([a-z]+)$/i.test(normalized) ||
    /bulan\s*\d{1,2}.*tahun\s*\d{4}/i.test(normalized)
  );
};

export const looksLikeGoalTargetDateInput = (raw: unknown) =>
  typeof raw === "string" && looksLikeMonthYearToken(raw);

export const parseMonthYearInput = (raw: unknown) => {
  if (typeof raw !== "string") return null;
  return parseMonthYearToken(raw) ?? null;
};

export const parseOptionalGoalTargetDate = (raw: unknown) => {
  if (typeof raw === "string" && isSkipChoice(raw)) return null;

  if (typeof raw === "string") {
    const parsedMonthYear = parseMonthYearInput(raw);
    if (parsedMonthYear) return parsedMonthYear;
    if (looksLikeGoalTargetDateInput(raw)) return undefined;
  }

  const yearOffset =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? extractIntegerFromFreeText(raw, { min: 1, max: 70 })
        : NaN;

  if (yearOffset === null || !Number.isInteger(yearOffset) || yearOffset < 1 || yearOffset > 70) {
    return undefined;
  }

  const { month: currentMonth, year: currentYear } = getCurrentJakartaMonthYear();
  return buildMonthYearTargetAnswer(currentMonth, currentYear + yearOffset);
};
