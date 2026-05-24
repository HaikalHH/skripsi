import {
  extractIntegerFromFreeText,
  extractMoneyFromFreeText,
  extractMoneyRangeFromFreeText
} from "@/lib/services/onboarding/flow/shared/intent/onboarding-intent-service";
import {
  hasWholePhrase,
  normalizeText,
  normalizeToken,
  parseAddMoreAnswer,
  parseBooleanAnswer,
  parseDecimalInputPreservingRange,
  type MoneyRangeAnswer,
  type NumericRangeAnswer
} from "@/lib/services/onboarding/flow/shared/answers/common-input";

const normalizeMarketText = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "");

export const parseAssetFreeText = (raw: unknown) => {
  if (typeof raw !== "string") return null;
  const normalized = normalizeText(raw);
  return normalized.length >= 2 ? normalized : null;
};

export const parseStockSymbolInput = (raw: unknown) => {
  if (typeof raw !== "string") return null;
  const candidates =
    raw.match(/\b[A-Za-z]{4,6}\b/g)?.filter(
      (token) => !["SAHAM", "STOCK", "KODE"].includes(token.toUpperCase())
    ) ?? [];
  const normalized = normalizeMarketText(candidates.at(-1) ?? raw);
  if (!/^[A-Z]{4,6}$/.test(normalized)) return null;
  return normalized;
};

export const parseMoneyInput = (raw: unknown) => {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return Math.round(raw);
  if (typeof raw !== "string") return null;
  if (raw.trim().startsWith("-")) return null;
  if (/^0+$/.test(raw.trim())) return 0;
  const parsedRange = extractMoneyRangeFromFreeText(raw);
  if (parsedRange) return parsedRange.midpoint;
  return extractMoneyFromFreeText(raw);
};

export const parseGuidedOtherExpenseInput = (raw: unknown) => {
  const amount = parseMoneyInput(raw);
  if (amount !== null) return amount;
  if (typeof raw !== "string") return null;

  const addMore = parseAddMoreAnswer(raw);
  if (addMore === false) return 0;

  const normalized = normalizeToken(raw);
  const noOtherExpensePhrases = [
    "udah",
    "sudah",
    "udah ya",
    "sudah ya",
    "ya udah",
    "ya sudah",
    "itu doang",
    "segitu",
    "udah itu",
    "sudah itu"
  ];

  return noOtherExpensePhrases.some((phrase) => hasWholePhrase(normalized, phrase)) ? 0 : null;
};

export const parseGuidedOtherExpenseCategoryName = (raw: unknown) => {
  if (typeof raw !== "string") return null;
  const normalized = normalizeText(raw);
  if (!normalized) return null;
  if (parseMoneyInput(raw) !== null) return null;
  if (parseBooleanAnswer(raw) !== null) return null;
  return /[A-Za-z]/.test(normalized) ? normalized : null;
};

export const parseMoneyInputPreservingRange = (raw: unknown): number | MoneyRangeAnswer | null => {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return Math.round(raw);
  if (typeof raw !== "string") return null;
  if (raw.trim().startsWith("-")) return null;
  if (/^0+$/.test(raw.trim())) return 0;
  const parsedRange = extractMoneyRangeFromFreeText(raw);
  if (parsedRange) {
    return {
      kind: "money_range",
      low: parsedRange.low,
      high: parsedRange.high
    };
  }
  return extractMoneyFromFreeText(raw);
};

export const isMoneyRangeAnswer = (value: unknown): value is MoneyRangeAnswer =>
  !!value &&
  typeof value === "object" &&
  (value as MoneyRangeAnswer).kind === "money_range" &&
  typeof (value as MoneyRangeAnswer).low === "number" &&
  Number.isFinite((value as MoneyRangeAnswer).low) &&
  typeof (value as MoneyRangeAnswer).high === "number" &&
  Number.isFinite((value as MoneyRangeAnswer).high);

export const getMoneyAnswerLowerBound = (value: number | MoneyRangeAnswer) =>
  isMoneyRangeAnswer(value) ? value.low : value;

export const isNumericRangeAnswer = (value: unknown): value is NumericRangeAnswer =>
  !!value &&
  typeof value === "object" &&
  (value as NumericRangeAnswer).kind === "number_range" &&
  typeof (value as NumericRangeAnswer).low === "number" &&
  Number.isFinite((value as NumericRangeAnswer).low) &&
  typeof (value as NumericRangeAnswer).high === "number" &&
  Number.isFinite((value as NumericRangeAnswer).high);

export const getNumericAnswerMidpoint = (value: number | NumericRangeAnswer) =>
  isNumericRangeAnswer(value) ? (value.low + value.high) / 2 : value;

export const parseDayOfMonth = (raw: unknown) => {
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? extractIntegerFromFreeText(raw, { min: 1, max: 31 })
        : NaN;
  if (value === null || !Number.isInteger(value) || value < 1 || value > 31) return null;
  return value;
};

export type AssetQuantityUnitContext = "gold_grams" | "stock_lots";

const QUANTITY_NEUTRAL_WORDS = new Set([
  "aku",
  "angka",
  "aja",
  "boss",
  "ini",
  "isi",
  "jumlah",
  "kira",
  "kira-kira",
  "kurang",
  "lebih",
  "pegang",
  "punya",
  "saja",
  "saya",
  "sekitar",
  "sebanyak",
  "total",
  "yang",
  "sampe",
  "sampai",
  "sd",
  "s",
  "d",
  "to"
]);

const QUANTITY_ALLOWED_WORDS: Record<AssetQuantityUnitContext, Set<string>> = {
  gold_grams: new Set(["emas", "gram", "grams", "gr", "g"]),
  stock_lots: new Set(["lot", "lots", "saham", "stock"])
};

const getQuantityWords = (raw: string) =>
  raw
    .toLowerCase()
    .match(/[a-z]+(?:-[a-z]+)?/g) ?? [];

export const parseAssetQuantityInput = (
  raw: unknown,
  unitContext: AssetQuantityUnitContext
): number | NumericRangeAnswer | null => {
  const parsed = parseDecimalInputPreservingRange(raw);
  if (!parsed || typeof raw !== "string") return parsed;

  const words = getQuantityWords(raw);
  if (!words.length) return parsed;

  const allowedWords = QUANTITY_ALLOWED_WORDS[unitContext];
  const hasInvalidUnitOrText = words.some(
    (word) => !QUANTITY_NEUTRAL_WORDS.has(word) && !allowedWords.has(word)
  );

  return hasInvalidUnitOrText ? null : parsed;
};
