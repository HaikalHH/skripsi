import type {
  GoldDraft,
  GoldDraftResolution,
  GoldQuestion
} from "@/lib/services/market/commands/portfolio-command.types";
import {
  GOLD_DIGITAL_WEIGHT_QUESTION,
  GOLD_PRICE_MODE_QUESTION,
  GOLD_PRICE_QUESTION,
  GOLD_WEIGHT_QUESTION
} from "@/lib/services/market/commands/gold-command-constants";
import { normalizeSpaces } from "@/lib/services/market/commands/portfolio-formatters";
import {
  detectGoldPriceMode,
  detectKnownGoldBrand,
  detectKnownGoldPlatform,
  detectSingleMenuChoice,
  normalizeGoldBrand,
  normalizeGoldKarat,
  normalizeGoldPlatform,
  parseGoldPriceAmountFromText,
  parseGoldQuantity
} from "@/lib/services/market/commands/gold-draft-normalizers";

export const extractGoldDraftFromFreeText = (text: string): Partial<GoldDraft> => {
  const draft: Partial<GoldDraft> = {};

  if (/\bbatangan\b/i.test(text)) draft.assetType = "BATANGAN";
  if (/\bperhiasan\b/i.test(text)) draft.assetType = "PERHIASAN";
  if (/\b(?:emas\s+digital|digital)\b/i.test(text)) draft.assetType = "DIGITAL";

  const brand = detectKnownGoldBrand(text);
  if (brand) draft.brand = brand;

  const karat = normalizeGoldKarat(text);
  if (karat) draft.karat = karat;

  const platform = detectKnownGoldPlatform(text);
  if (platform) draft.platform = platform;

  const quantityGram = parseGoldQuantity(text);
  if (quantityGram) draft.quantityGram = quantityGram;

  const priceAmount = parseGoldPriceAmountFromText(text);
  if (priceAmount) draft.priceAmount = priceAmount;

  const priceMode = detectGoldPriceMode(text);
  if (priceMode) draft.priceMode = priceMode;

  return draft;
};

export const extractGoldDraftFromAnswer = (
  text: string,
  question: GoldQuestion | null
): GoldDraftResolution => {
  const update = extractGoldDraftFromFreeText(text);
  const choice = detectSingleMenuChoice(text);

  if (question === "TYPE" && !update.assetType) {
    if (choice === 1) update.assetType = "BATANGAN";
    if (choice === 2) update.assetType = "PERHIASAN";
    if (choice === 3) update.assetType = "DIGITAL";
  }

  if ((question === "BRAND" || question === "BRAND_OTHER") && !update.brand) {
    if (question === "BRAND" && choice === 1) update.brand = "Antam";
    else if (question === "BRAND" && choice === 2) update.brand = "UBS";
    else if (question === "BRAND" && choice === 3) update.brand = "Galeri24";
    else if (question === "BRAND" && choice === 4) return { update, promptOverride: "BRAND_OTHER" };
    else update.brand = normalizeGoldBrand(text) ?? undefined;
  }

  if ((question === "WEIGHT" || question === "DIGITAL_WEIGHT") && !update.quantityGram) {
    update.quantityGram = parseGoldQuantity(text, true) ?? undefined;
  }

  if ((question === "KARAT" || question === "KARAT_OTHER") && !update.karat) {
    if (question === "KARAT" && choice === 1) update.karat = "24K";
    else if (question === "KARAT" && choice === 2) update.karat = "23K";
    else if (question === "KARAT" && choice === 3) update.karat = "22K";
    else if (question === "KARAT" && choice === 4) update.karat = "18K";
    else if (question === "KARAT" && choice === 5) update.karat = "17K";
    else if (question === "KARAT" && choice === 6) return { update, promptOverride: "KARAT_OTHER" };
    else update.karat = normalizeGoldKarat(text) ?? undefined;
  }

  if ((question === "PLATFORM" || question === "PLATFORM_OTHER") && !update.platform) {
    if (question === "PLATFORM" && choice === 1) update.platform = "Pegadaian";
    else if (question === "PLATFORM" && choice === 2) update.platform = "Tokopedia Emas";
    else if (question === "PLATFORM" && choice === 3) update.platform = "Shopee Emas";
    else if (question === "PLATFORM" && choice === 4) return { update, promptOverride: "PLATFORM_OTHER" };
    else update.platform = normalizeGoldPlatform(text) ?? undefined;
  }

  if ((question === "PRICE" || question === "PRICE_MODE") && !update.priceMode) {
    update.priceMode = detectGoldPriceMode(text) ?? undefined;
  }
  if (question === "PRICE" && !update.priceAmount) {
    update.priceAmount = parseGoldPriceAmountFromText(text, true) ?? undefined;
  }

  return { update };
};

export const detectGoldQuestion = (text: string): GoldQuestion | null => {
  const normalized = normalizeSpaces(text);
  if (normalized.startsWith("Emas kamu jenis apa?")) return "TYPE";
  if (normalized.startsWith("Brand emasnya apa?")) return "BRAND";
  if (normalized.startsWith("Brand lainnya apa?")) return "BRAND_OTHER";
  if (normalized === GOLD_WEIGHT_QUESTION) return "WEIGHT";
  if (normalized === GOLD_DIGITAL_WEIGHT_QUESTION) return "DIGITAL_WEIGHT";
  if (normalized.startsWith("Karatnya berapa?")) return "KARAT";
  if (normalized.startsWith("Karat lainnya berapa?")) return "KARAT_OTHER";
  if (normalized.startsWith("Platformnya apa?")) return "PLATFORM";
  if (normalized.startsWith("Platform lainnya apa?")) return "PLATFORM_OTHER";
  if (normalized === GOLD_PRICE_QUESTION) return "PRICE";
  if (normalized === GOLD_PRICE_MODE_QUESTION) return "PRICE_MODE";
  return null;
};
