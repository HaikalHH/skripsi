import { OnboardingQuestionKey, OnboardingSession } from "@prisma/client";
import {
  extractDecimalFromFreeText,
  extractDecimalRangeFromFreeText,
  matchSingleSelectIntent,
  parseFlexibleBoolean
} from "@/lib/services/onboarding/flow/shared/intent/onboarding-intent-service";
import { START_INTENT_OPTIONS } from "@/lib/services/onboarding/flow/shared/questions/answer-recognition";
import type { ExpenseBreakdown } from "@/lib/services/onboarding/flow/shared/calculation/onboarding-calculation-service";
import { normalizeWaNumber } from "@/lib/services/user/identity";

export type MoneyRangeAnswer = {
  kind: "money_range";
  low: number;
  high: number;
};

export type NumericRangeAnswer = {
  kind: "number_range";
  low: number;
  high: number;
};

export type GuidedOtherExpenseStage = "presence" | "category_name" | "category_amount" | "add_more";

export type GuidedOtherExpenseItem = {
  label: string;
  amount: number;
};

export type GuidedOtherExpenseAnswer =
  | {
      kind: "presence";
      hasOtherExpense: boolean;
    }
  | {
      kind: "category_name";
      label: string;
    }
  | {
      kind: "category_amount";
      label: string;
      amount: number;
    }
  | {
      kind: "add_more";
      addMore: boolean;
    };

export type SessionAnswerValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | ExpenseBreakdown
  | MoneyRangeAnswer
  | NumericRangeAnswer
  | GuidedOtherExpenseAnswer
  | Record<string, unknown>;

export const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");
export const normalizeToken = (value: string) => normalizeText(value).toLowerCase();
export const isCanonicalWaPhone = (value: string | null | undefined) =>
  !!value && /^62\d{7,15}$/.test(value);

export const hasWholePhrase = (text: string, phrase: string) =>
  text === phrase ||
  text.startsWith(`${phrase} `) ||
  text.endsWith(` ${phrase}`) ||
  text.includes(` ${phrase} `);

export const isReadyCommand = (value: string) =>
  Boolean(matchSingleSelectIntent(value, START_INTENT_OPTIONS));

export const isSkipChoice = (value: string) =>
  ["skip", "lewati", "lewati dulu", "nanti"].includes(normalizeToken(value));

export const parsePhoneInput = (raw: string): string | null => {
  const normalized = normalizeWaNumber(raw);
  return isCanonicalWaPhone(normalized) ? normalized : null;
};

export const parseDecimalInput = (raw: string): number | null => {
  const normalized = raw.trim().toLowerCase();
  const parsedRange = extractDecimalRangeFromFreeText(normalized);
  if (parsedRange) return parsedRange.midpoint;

  const parsed = extractDecimalFromFreeText(normalized.replace(/\s*gram$/i, ""));
  if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

export const parseDecimalInputPreservingRange = (
  raw: unknown
): number | NumericRangeAnswer | null => {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw !== "string") return null;

  const normalized = raw.trim().toLowerCase();
  const parsedRange = extractDecimalRangeFromFreeText(normalized);
  if (parsedRange) {
    return {
      kind: "number_range",
      low: parsedRange.low,
      high: parsedRange.high
    };
  }

  const parsed = extractDecimalFromFreeText(normalized.replace(/\s*gram$/i, ""));
  if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

export const latestSessionForQuestion = (
  sessions: OnboardingSession[],
  questionKey: OnboardingQuestionKey
) => {
  const matches = sessions.filter((item) => item.questionKey === questionKey);
  return matches.at(-1) ?? null;
};

export const getSessionNormalizedValue = <T>(session: OnboardingSession | null): T | null => {
  if (!session || session.normalizedAnswerJson === null) return null;
  return session.normalizedAnswerJson as T;
};

export const parseBooleanAnswer = (raw: unknown) => parseFlexibleBoolean(raw);

export const parseAddMoreAnswer = (raw: unknown) => {
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return null;

  const normalized = normalizeToken(raw);
  if (!normalized) return null;

  const continuePhrases = [
    "lanjut",
    "lanjut aja",
    "langsung lanjut",
    "next",
    "terusin",
    "teruskan",
    "skip",
    "skip dulu",
    "cukup",
    "itu aja",
    "udah itu aja",
    "udah segitu aja",
    "segitu aja"
  ];
  const addMorePhrases = [
    "ada lagi",
    "masih ada",
    "masih mau nambah",
    "mau nambah",
    "tambah",
    "tambah lagi",
    "mau tambah"
  ];

  if (continuePhrases.some((phrase) => hasWholePhrase(normalized, phrase))) {
    return false;
  }

  const flexibleBoolean = parseFlexibleBoolean(raw);
  if (flexibleBoolean === false) {
    return false;
  }

  if (addMorePhrases.some((phrase) => hasWholePhrase(normalized, phrase))) {
    return true;
  }

  return flexibleBoolean;
};
