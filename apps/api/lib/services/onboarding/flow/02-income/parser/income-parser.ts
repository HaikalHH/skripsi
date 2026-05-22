import { EmploymentType, OnboardingQuestionKey, type OnboardingSession } from "@prisma/client";
import { ACTIVE_INCOME_FREQUENCY_OPTIONS } from "@/lib/services/onboarding/flow/shared/questions/answer-options";
import {
  getSessionNormalizedValue,
  hasWholePhrase,
  latestSessionForQuestion
} from "@/lib/services/onboarding/flow/shared/answers/common-input";
import { getConfirmedSessions } from "@/lib/services/onboarding/flow/helpers/session-values";
import { parseDayOfMonth } from "@/lib/services/onboarding/flow/shared/answers/value-parsers";
import {
  extractIntegerFromFreeText,
  matchSingleSelectIntent,
  normalizeLooseText
} from "@/lib/services/onboarding/flow/shared/intent/onboarding-intent-service";
import type { ActiveIncomeFrequencyMode } from "@/lib/services/onboarding/flow/shared/questions/question-types";

export const getEmploymentTypes = (sessions: OnboardingSession[]) =>
  getSessionNormalizedValue<EmploymentType[]>(
    latestSessionForQuestion(
      getConfirmedSessions(sessions),
      OnboardingQuestionKey.EMPLOYMENT_TYPES
    )
  ) ?? [];

const ACTIVE_INCOME_FREQUENCY_INTENT_OPTIONS = ACTIVE_INCOME_FREQUENCY_OPTIONS.map((option) => ({
  ...option,
  aliases:
    option.value === "SINGLE"
      ? [
          "satu",
          "satu kali",
          "sekali",
          "1",
          "cuma satu",
          "hanya satu",
          "satu gajian",
          "satu kali gajian",
          "gaji utama aja",
          "gajian utama aja",
          "cuma gaji utama",
          "cuma dari kantor"
        ]
      : [
          "lebih dari satu",
          "lebih satu",
          "lebih dari 1",
          "lebih dari sekali",
          "beberapa",
          "dua",
          "2",
          "dua kali",
          "lebih dari satu kali gajian",
          "gaji utama dan sampingan",
          "gaji utama sama sampingan",
          "gaji utama dan freelance",
          "gaji plus freelance",
          "ada income lain",
          "ada pemasukan lain"
        ]
}));

export const parseActiveIncomeFrequency = (raw: unknown): ActiveIncomeFrequencyMode | null => {
  if (raw === 1) return "SINGLE";
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 1) return "MULTIPLE";
  if (typeof raw !== "string") return null;

  const normalized = normalizeLooseText(raw);
  if (!normalized) return null;

  const matched = matchSingleSelectIntent(
    raw,
    ACTIVE_INCOME_FREQUENCY_INTENT_OPTIONS
  ) as ActiveIncomeFrequencyMode | null;
  if (matched) return matched;

  const parsedNumber = extractIntegerFromFreeText(normalized, { min: 1, max: 12 });
  if (parsedNumber === 1) return "SINGLE";
  if (parsedNumber && parsedNumber > 1) return "MULTIPLE";

  if (
    /\b(gaji|gajian|income|pemasukan|pendapatan)\b/.test(normalized) &&
    /\b(sampingan|freelance|bonus|komisi|usaha|bisnis|proyek|project|lain)\b/.test(normalized)
  ) {
    return "MULTIPLE";
  }

  return null;
};

export const parseActiveIncomeAddMoreAnswer = (raw: unknown): boolean | null => {
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return null;

  const normalized = normalizeLooseText(raw);
  if (!normalized) return null;

  const donePhrases = [
    "udah",
    "sudah",
    "udah itu aja",
    "sudah itu aja",
    "itu aja",
    "itu saja",
    "segitu aja",
    "cukup",
    "selesai",
    "ga ada lagi",
    "gak ada lagi",
    "ngga ada lagi",
    "nggak ada lagi",
    "tidak ada lagi",
    "engga ada lagi",
    "enggak ada lagi",
    "ga",
    "gak",
    "ngga",
    "nggak",
    "engga",
    "enggak",
    "tidak",
    "bukan",
    "no",
    "ga ada",
    "gak ada",
    "nggak ada",
    "tidak ada"
  ];
  if (donePhrases.some((phrase) => hasWholePhrase(normalized, phrase))) {
    return false;
  }

  const addMorePhrases = [
    "iya",
    "ya",
    "yes",
    "y",
    "ada",
    "belum",
    "belom",
    "blm",
    "belum selesai",
    "belum itu aja",
    "masih",
    "masih ada",
    "ada lagi",
    "ada income lain",
    "ada aktif income lain",
    "ada pemasukan lain",
    "tambah",
    "tambahin",
    "mau tambah",
    "tambah lagi",
    "lanjut",
    "lanjut lagi",
    "gaji satu lagi",
    "income satu lagi"
  ];
  if (addMorePhrases.some((phrase) => hasWholePhrase(normalized, phrase))) {
    return true;
  }

  return null;
};

const ORDINAL_INDEXES = new Map<string, number>([
  ["pertama", 1],
  ["kesatu", 1],
  ["satu", 1],
  ["utama", 1],
  ["kedua", 2],
  ["ke dua", 2],
  ["dua", 2],
  ["ketiga", 3],
  ["ke tiga", 3],
  ["tiga", 3],
  ["keempat", 4],
  ["ke empat", 4],
  ["empat", 4],
  ["kelima", 5],
  ["ke lima", 5],
  ["lima", 5],
  ["keenam", 6],
  ["ke enam", 6],
  ["enam", 6]
]);

const parseOrdinalIndex = (normalized: string) => {
  for (const [phrase, index] of ORDINAL_INDEXES.entries()) {
    if (hasWholePhrase(normalized, phrase)) return index;
  }

  const explicitIndexMatch = normalized.match(/\b(?:ke|income|gaji|gajian)\s*(\d{1,2})\b/);
  if (!explicitIndexMatch) return null;

  const parsed = Number(explicitIndexMatch[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const parseActiveIncomeCycleSelection = (
  raw: unknown,
  paydays: number[]
): number | null => {
  if (!paydays.length) return null;
  if (typeof raw === "number" && Number.isInteger(raw)) {
    if (raw >= 1 && raw <= paydays.length) return paydays[raw - 1] ?? null;
    return paydays.includes(raw) ? raw : null;
  }
  if (typeof raw !== "string") return null;

  const normalized = normalizeLooseText(raw);
  if (!normalized) return null;

  if (hasWholePhrase(normalized, "terakhir")) {
    return paydays.at(-1) ?? null;
  }

  const ordinalIndex = parseOrdinalIndex(normalized);
  if (ordinalIndex && ordinalIndex >= 1 && ordinalIndex <= paydays.length) {
    return paydays[ordinalIndex - 1] ?? null;
  }

  const day = parseDayOfMonth(raw);
  if (day !== null && paydays.includes(day)) {
    return day;
  }

  const number = extractIntegerFromFreeText(normalized, { min: 1, max: 31 });
  if (number !== null) {
    if (number >= 1 && number <= paydays.length) return paydays[number - 1] ?? null;
    if (paydays.includes(number)) return number;
  }

  return null;
};
