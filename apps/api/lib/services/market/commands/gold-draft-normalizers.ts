import { parsePositiveAmount } from "@/lib/services/transactions/amount";
import type {
  GoldDraft,
  GoldPriceMode
} from "@/lib/services/market/commands/portfolio-command.types";
import {
  GOLD_COMMAND_HINT_PATTERN,
  GOLD_NON_ANSWER_PATTERN
} from "@/lib/services/market/commands/gold-command-constants";
import {
  normalizeSpaces,
  parseDecimal
} from "@/lib/services/market/commands/portfolio-formatters";

export const hasGoldDraftFields = (draft: Partial<GoldDraft>) =>
  Object.keys(draft).length > 0;

const normalizeMenuSelectionText = (value: string) =>
  normalizeSpaces(value)
    .replace(/\uFE0F?\u20E3/gu, "")
    .trim();

export const detectSingleMenuChoice = (text: string) => {
  const normalized = normalizeMenuSelectionText(text);
  const numericOnly = normalized.match(/^([1-6])(?:\s*[.)-]?\s*)?$/);
  if (!numericOnly) return null;
  return Number(numericOnly[1]);
};

const toTitleCase = (value: string) =>
  value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");

const normalizeCustomGoldLabel = (value: string) => {
  const cleaned = normalizeSpaces(
    value
      .replace(/[.,!?]+$/g, "")
      .replace(/\b(?:brand(?:nya)?|platform(?:nya)?|karat(?:nya)?|emas(?: digital)?|jenis)\b/gi, " ")
  );
  if (!cleaned || GOLD_NON_ANSWER_PATTERN.test(cleaned) || GOLD_COMMAND_HINT_PATTERN.test(cleaned)) {
    return null;
  }
  return cleaned;
};

export const detectKnownGoldBrand = (text: string) => {
  if (/\bantam\b/i.test(text)) return "Antam";
  if (/\bubs\b/i.test(text)) return "UBS";
  if (/\bgaleri\s*24\b/i.test(text)) return "Galeri24";
  return null;
};

export const normalizeGoldBrand = (text: string) => {
  const known = detectKnownGoldBrand(text);
  if (known) return known;
  const custom = normalizeCustomGoldLabel(text);
  return custom ? toTitleCase(custom) : null;
};

export const detectKnownGoldPlatform = (text: string) => {
  if (/\bpegadaian\b/i.test(text)) return "Pegadaian";
  if (/\btokopedia(?:\s+emas)?\b/i.test(text)) return "Tokopedia Emas";
  if (/\bshopee(?:\s+emas)?\b/i.test(text)) return "Shopee Emas";
  return null;
};

export const normalizeGoldPlatform = (text: string) => {
  const known = detectKnownGoldPlatform(text);
  if (known) return known;
  const custom = normalizeCustomGoldLabel(text);
  return custom ? toTitleCase(custom) : null;
};

export const normalizeGoldKarat = (text: string) => {
  const normalized = normalizeSpaces(text);
  const match =
    normalized.match(/\b(\d{1,2})\s*(?:k|karat)\b/i) ??
    normalized.match(/^(\d{1,2})$/);
  if (!match) return null;

  const karat = Number(match[1]);
  if (!Number.isFinite(karat) || karat <= 0 || karat > 24) return null;
  return `${karat}K`;
};

export const parseGoldQuantity = (text: string, allowBare = false) => {
  const explicit = text.match(/([\d.,]+)\s*(?:gram|gr|g)\b/i);
  if (explicit) return parseDecimal(explicit[1]);
  if (!allowBare) return null;

  const bare = normalizeSpaces(text).match(/^([\d.,]+)$/);
  if (!bare) return null;
  return parseDecimal(bare[1]);
};

export const detectGoldPriceMode = (text: string): GoldPriceMode | null => {
  if (/\bper\s*gram\b|\/\s*gram\b/i.test(text)) return "PER_GRAM";
  if (/\btotal\b/i.test(text)) return "TOTAL";
  return null;
};

export const parseGoldPriceAmountFromText = (text: string, allowBare = false) => {
  const normalized = normalizeSpaces(text);
  const explicit =
    normalized.match(/\bharga(?:\s+beli)?\s+(.+)$/i)?.[1] ??
    normalized.match(/\btotal(?:\s+beli)?\s+(.+)$/i)?.[1];
  if (explicit) return parsePositiveAmount(explicit);
  if (!allowBare) return null;
  return parsePositiveAmount(normalized);
};

export const applyGoldDraftInferences = (draft: GoldDraft): GoldDraft => ({
  ...draft,
  assetType: draft.assetType ?? (draft.brand ? "BATANGAN" : draft.karat ? "PERHIASAN" : draft.platform ? "DIGITAL" : undefined),
  priceMode:
    draft.priceMode ??
    (!draft.priceAmount
      ? undefined
      : draft.quantityGram != null && draft.quantityGram <= 10 && draft.priceAmount > 5_000_000
        ? "TOTAL"
        : draft.priceAmount > 500_000 && draft.priceAmount <= 5_000_000
          ? "PER_GRAM"
          : undefined)
});

export const mergeGoldDraft = (base: GoldDraft, update: Partial<GoldDraft>): GoldDraft =>
  applyGoldDraftInferences({
    ...base,
    ...Object.fromEntries(Object.entries(update).filter(([, value]) => value != null))
  });
