import { normalizeSpaces, titleCase } from "../helpers/text";
import { MERCHANT_ALIAS_PATTERNS, RECURRING_LIKE_MERCHANTS } from "./aliases";

const cleanRawMerchant = (value: string) =>
  normalizeSpaces(
    value
      .replace(/[|/_,.-]+/g, " ")
      .replace(/\b(?:pte|pt|tbk|ltd|inc|corp|co|indonesia)\b/gi, "")
      .replace(/\b(?:premium|family|duo|monthly|bulanan)\b/gi, "")
  );

const detectCanonicalMerchant = (value: string): string | null => {
  for (const entry of MERCHANT_ALIAS_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(value))) {
      return entry.canonical;
    }
  }
  return null;
};

export const inferMerchantFromText = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = normalizeSpaces(value);
  return detectCanonicalMerchant(normalized);
};

export const normalizeMerchantName = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = cleanRawMerchant(value);
  if (!normalized) return null;

  const detected = detectCanonicalMerchant(normalized);
  if (detected) return detected;

  if (normalized.length < 3) return null;
  return titleCase(normalized);
};

export const normalizeDetectedMerchant = (params: {
  merchant?: string | null;
  rawText?: string | null;
}) => {
  const fromMerchant = normalizeMerchantName(params.merchant ?? null);
  if (fromMerchant) return fromMerchant;

  const fromRawText = inferMerchantFromText(params.rawText ?? null);
  if (fromRawText) return fromRawText;

  return null;
};

export const isRecurringLikeMerchant = (value: string | null | undefined) => {
  const normalized = normalizeMerchantName(value ?? null);
  if (!normalized) return false;
  return RECURRING_LIKE_MERCHANTS.has(normalized);
};
