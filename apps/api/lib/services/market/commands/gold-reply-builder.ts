import { formatMoney } from "@/lib/services/shared/money";
import type {
  GoldDraft,
  GoldQuestion,
  ParsedAddAsset
} from "@/lib/services/market/commands/portfolio-command.types";
import {
  GOLD_BRAND_QUESTION,
  GOLD_DIGITAL_WEIGHT_QUESTION,
  GOLD_KARAT_QUESTION,
  GOLD_PLATFORM_QUESTION,
  GOLD_PRICE_MODE_QUESTION,
  GOLD_PRICE_QUESTION,
  GOLD_TYPE_QUESTION,
  GOLD_WEIGHT_QUESTION
} from "@/lib/services/market/commands/gold-command-constants";
import {
  GRAM_FORMATTER,
  normalizePortfolioSymbol
} from "@/lib/services/market/commands/portfolio-formatters";

export const getGoldQuestionText = (question: GoldQuestion) => {
  switch (question) {
    case "TYPE":
      return GOLD_TYPE_QUESTION;
    case "BRAND":
      return GOLD_BRAND_QUESTION;
    case "BRAND_OTHER":
      return "Brand lainnya apa?";
    case "WEIGHT":
      return GOLD_WEIGHT_QUESTION;
    case "DIGITAL_WEIGHT":
      return GOLD_DIGITAL_WEIGHT_QUESTION;
    case "KARAT":
      return GOLD_KARAT_QUESTION;
    case "KARAT_OTHER":
      return "Karat lainnya berapa?";
    case "PLATFORM":
      return GOLD_PLATFORM_QUESTION;
    case "PLATFORM_OTHER":
      return "Platform lainnya apa?";
    case "PRICE":
      return GOLD_PRICE_QUESTION;
    case "PRICE_MODE":
      return GOLD_PRICE_MODE_QUESTION;
  }
};

const buildGoldSymbol = (draft: GoldDraft) => {
  const slug = (value: string) =>
    value
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  if (draft.assetType === "BATANGAN" && draft.brand) return `GOLD_BAR_${slug(draft.brand)}`;
  if (draft.assetType === "PERHIASAN" && draft.karat) return `GOLD_JEWELRY_${slug(draft.karat)}`;
  if (draft.assetType === "DIGITAL" && draft.platform) return `GOLD_DIGITAL_${slug(draft.platform)}`;
  return normalizePortfolioSymbol("gold", "XAU");
};

const buildGoldDisplayName = (draft: GoldDraft) => {
  if (draft.assetType === "BATANGAN" && draft.brand) return draft.brand;
  if (draft.assetType === "PERHIASAN" && draft.karat) return `Perhiasan ${draft.karat}`;
  if (draft.assetType === "DIGITAL" && draft.platform) return `Emas digital ${draft.platform}`;
  return "Emas";
};

export const buildGoldAddInput = (draft: GoldDraft): ParsedAddAsset | null => {
  if (!draft.assetType || !draft.quantityGram || !draft.priceAmount || !draft.priceMode) return null;
  const pricePerUnit =
    draft.priceMode === "TOTAL"
      ? Number((draft.priceAmount / draft.quantityGram).toFixed(2))
      : draft.priceAmount;
  if (!Number.isFinite(pricePerUnit) || pricePerUnit <= 0) return null;

  return {
    assetType: "GOLD",
    symbol: buildGoldSymbol(draft),
    displayName: buildGoldDisplayName(draft),
    quantity: draft.quantityGram,
    unit: "gram",
    pricePerUnit
  };
};

export const buildGoldSuccessReply = (draft: GoldDraft) => {
  const input = buildGoldAddInput(draft);
  if (!input || !draft.priceAmount || !draft.priceMode) throw new Error("Draft emas belum lengkap");
  const total =
    draft.priceMode === "TOTAL"
      ? draft.priceAmount
      : Number((input.quantity * input.pricePerUnit).toFixed(2));

  return [
    `\u2705 Aset berhasil dicatat: ${input.displayName}`,
    `- Qty: ${GRAM_FORMATTER.format(input.quantity)} gram`,
    `- Harga saat dicatat: ${formatMoney(input.pricePerUnit)}`,
    `- Total: ${formatMoney(total)}`,
    "",
    "Ketik *portfolio aku* untuk lihat nilai aset dan komposisinya."
  ].join("\n");
};
