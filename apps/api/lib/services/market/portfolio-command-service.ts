import type { PortfolioAssetType as PrismaPortfolioAssetType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadRecentConversationTurns } from "@/lib/services/assistant/conversation-memory-service";
import {
  getMarketQuoteBySymbol,
  isMarketDataError
} from "@/lib/services/market/market-price-service";
import { parsePositiveAmount } from "@/lib/services/transactions/amount-parser";
import { formatMoney } from "@/lib/services/shared/money-format";
import {
  getUserPortfolioValuation,
  type ValuedPortfolioItem
} from "@/lib/services/market/portfolio-valuation-service";
import { normalizeMarketSymbolForKind } from "@/lib/services/market/market-symbol-normalization";

type SupportedPortfolioAssetType =
  | "GOLD"
  | "STOCK"
  | "CRYPTO"
  | "DEPOSIT"
  | "PROPERTY"
  | "BUSINESS"
  | "OTHER";

type ParsedAddAsset = {
  assetType: SupportedPortfolioAssetType;
  symbol: string;
  displayName: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
};

type GoldAssetKind = "BATANGAN" | "PERHIASAN" | "DIGITAL";
type GoldPriceMode = "PER_GRAM" | "TOTAL";
type GoldQuestion =
  | "TYPE"
  | "BRAND"
  | "BRAND_OTHER"
  | "WEIGHT"
  | "DIGITAL_WEIGHT"
  | "KARAT"
  | "KARAT_OTHER"
  | "PLATFORM"
  | "PLATFORM_OTHER"
  | "PRICE"
  | "PRICE_MODE";

type GoldDraft = {
  assetType?: GoldAssetKind;
  brand?: string;
  karat?: string;
  platform?: string;
  quantityGram?: number;
  priceAmount?: number;
  priceMode?: GoldPriceMode;
};

type GoldDraftResolution = {
  update: Partial<GoldDraft>;
  promptOverride?: GoldQuestion;
};

type GoldConversationState = {
  draft: GoldDraft;
  lastQuestion: GoldQuestion | null;
};

type GoldAddResolution =
  | { handled: true; replyText: string }
  | { handled: true; draft: GoldDraft; input: ParsedAddAsset };

type StockQuestion = "SYMBOL" | "QUANTITY" | "PRICE" | "CONFIRM" | "CORRECTION";
type StockQuantityUnit = "lot" | "lembar";

type StockDraft = {
  symbol?: string;
  quantityAmount?: number;
  quantityUnit?: StockQuantityUnit;
  quantityShares?: number;
  pricePerUnit?: number;
};

type StockConversationState = {
  draft: StockDraft;
  lastQuestion: StockQuestion | null;
};

type StockAddResolution =
  | { handled: true; replyText: string }
  | { handled: true; draft: StockDraft; input: ParsedAddAsset };

const normalizeSpaces = (value: string) => value.trim().replace(/\s+/g, " ");
const normalizePortfolioSymbol = (kind: "stock" | "crypto" | "gold", value: string) =>
  normalizeMarketSymbolForKind(value, kind)?.canonicalSymbol ?? value.trim().toUpperCase();
const GRAM_FORMATTER = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4
});
const STOCK_COUNT_FORMATTER = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});
const PORTFOLIO_PERCENT_FORMATTER = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});
const GOLD_ADD_INTENT_PATTERN = /\b(?:tambah|beli|catat|punya)\s+emas\b/i;
const STOCK_ADD_INTENT_PATTERN = /\b(?:tambah|beli|catat|punya)\s+saham\b/i;
const GOLD_COMMAND_HINT_PATTERN =
  /\b(?:berita|news|harga sekarang|cek harga|price|laporan|portfolio|portofolio|pengeluaran|transaksi|budget|goal|cashflow|alokasi|reminder|saham|crypto|kripto|btc|eth|sol|rebalance|diversifikasi)\b/i;
const GOLD_NON_ANSWER_PATTERN =
  /^(?:ok(?:e|ay)?|sip|siap|lanjut|next|terus|halo|hai|hi|makasih|terima kasih|tolong|bantu)$/i;
const STOCK_NON_ANSWER_PATTERN =
  /^(?:ok(?:e|ay)?|sip|siap|lanjut|next|terus|halo|hai|hi|makasih|terima kasih|tolong|bantu)$/i;
const GOLD_TYPE_QUESTION = `Emas kamu jenis apa?

1\uFE0F\u20E3 Batangan (Antam / UBS / dll)
2\uFE0F\u20E3 Perhiasan
3\uFE0F\u20E3 Emas digital`;
const GOLD_BRAND_QUESTION = `Brand emasnya apa?

1\uFE0F\u20E3 Antam
2\uFE0F\u20E3 UBS
3\uFE0F\u20E3 Galeri24
4\uFE0F\u20E3 Lainnya (sebutkan)`;
const GOLD_WEIGHT_QUESTION = "Beratnya berapa gram?";
const GOLD_KARAT_QUESTION = `Karatnya berapa?

1\uFE0F\u20E3 24K
2\uFE0F\u20E3 23K
3\uFE0F\u20E3 22K
4\uFE0F\u20E3 18K
5\uFE0F\u20E3 17K
6\uFE0F\u20E3 Lainnya`;
const GOLD_DIGITAL_WEIGHT_QUESTION = "Kamu punya berapa gram emas digitalnya?";
const GOLD_PLATFORM_QUESTION = `Platformnya apa?

1\uFE0F\u20E3 Pegadaian
2\uFE0F\u20E3 Tokopedia Emas
3\uFE0F\u20E3 Shopee Emas
4\uFE0F\u20E3 Lainnya (sebutkan)`;
const GOLD_PRICE_QUESTION = "Harga belinya berapa?";
const GOLD_PRICE_MODE_QUESTION = "Itu harga per gram atau total ya?";
const STOCK_SYMBOL_QUESTION = "Apa kode sahamnya? (contoh: BBRI, TLKM)";
const STOCK_QUANTITY_QUESTION = `Berapa yang kamu punya?
(bisa jawab dalam lot atau lembar, contoh: 2 lot atau 150 lembar)`;
const STOCK_PRICE_QUESTION = "Berapa harga beli per lembar? (dalam Rupiah)";
const STOCK_CORRECTION_QUESTION =
  "Bagian mana yang ingin dikoreksi? Kode saham, jumlah, atau harga beli?";
const STOCK_CONFIRM_QUESTION = "Apakah data ini sudah benar?";
const STOCK_VALIDATION_UNAVAILABLE_REPLY =
  "Lagi belum bisa validasi kode saham sekarang. Coba lagi sebentar ya.";

const PORTFOLIO_ASSET_TYPE_LABELS: Record<PrismaPortfolioAssetType, string> = {
  GOLD: "Emas (GOLD)",
  STOCK: "Saham (STOCK)",
  MUTUAL_FUND: "Lainnya",
  CRYPTO: "Kripto (CRYPTO)",
  DEPOSIT: "Deposito / Kas",
  PROPERTY: "Properti",
  BUSINESS: "Bisnis",
  OTHER: "Lainnya"
};

const formatPortfolioMoney = (amount: number) =>
  formatMoney(amount).replace(/^(-?)Rp/, "$1Rp ");

const formatPortfolioSignedMoney = (amount: number, showPlusForPositive = false) => {
  const normalized = Math.abs(amount) < 0.5 ? 0 : amount;
  const absolute = formatPortfolioMoney(Math.abs(normalized));
  if (normalized < 0) return `-${absolute}`;
  if (normalized > 0 && showPlusForPositive) return `+${absolute}`;
  return absolute;
};

const formatPortfolioPercent = (value: number) =>
  `${PORTFOLIO_PERCENT_FORMATTER.format(Math.round(value))}%`;

const formatPortfolioScore = (value: number) =>
  PORTFOLIO_PERCENT_FORMATTER.format(Math.max(0, Math.round(value)));

const allocatePortfolioShares = (values: number[]) => {
  if (!values.length) return [];
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);

  const ranked = values.map((value, index) => {
    const rawPercent = (value / total) * 100;
    const floored = Math.floor(rawPercent);
    return {
      index,
      value,
      floored,
      remainder: rawPercent - floored
    };
  });
  const shares = ranked.map((entry) => entry.floored);

  ranked
    .slice()
    .sort((left, right) => {
      if (right.remainder !== left.remainder) return right.remainder - left.remainder;
      if (right.value !== left.value) return right.value - left.value;
      return left.index - right.index;
    })
    .slice(0, Math.max(0, 100 - shares.reduce((sum, value) => sum + value, 0)))
    .forEach((entry) => {
      shares[entry.index] = (shares[entry.index] ?? 0) + 1;
    });

  return shares;
};

const getPortfolioRiskLabel = (
  status: "HEALTHY" | "WATCH" | "ACTION",
  risk: "LOW" | "MEDIUM" | "HIGH"
): "RENDAH" | "MENENGAH" | "TINGGI" => {
  if (status === "ACTION" || risk === "HIGH") return "TINGGI";
  if (status === "WATCH" || risk === "MEDIUM") return "MENENGAH";
  return "RENDAH";
};

const getPortfolioRiskNote = (riskLabel: "RENDAH" | "MENENGAH" | "TINGGI", topHoldingShare: number) => {
  if (riskLabel === "TINGGI") {
    return topHoldingShare >= 50
      ? "Portofoliomu masih cukup terkonsentrasi di satu aset. Kalau aset utama ini turun, nilai total portofoliomu bisa ikut turun cukup terasa."
      : "Sebaran asetmu masih belum cukup rata, jadi pergerakan beberapa posisi besar bisa cukup memengaruhi total portofolio.";
  }

  if (riskLabel === "MENENGAH") {
    return "Sebarannya sudah lumayan, tapi masih ada beberapa posisi yang cukup dominan dan perlu dipantau.";
  }

  return "Sebaran asetmu sudah cukup rapi untuk ukuran dasar, jadi risikonya tidak terlalu bertumpu pada satu posisi saja.";
};

const getRebalanceLabel = (status: "HEALTHY" | "WATCH" | "ACTION") => {
  if (status === "ACTION") return "IYA - Disarankan untuk mulai diversifikasi";
  if (status === "WATCH") return "BOLEH DIPERTIMBANGKAN - Komposisinya mulai berat di beberapa aset";
  return "BELUM MENDESAK - Komposisinya masih cukup seimbang";
};

const getRebalanceNote = (status: "HEALTHY" | "WATCH" | "ACTION") => {
  if (status === "ACTION") {
    return "Coba tambah aset lain supaya risiko portofoliomu tidak terlalu bergantung pada satu area saja.";
  }
  if (status === "WATCH") {
    return "Belum darurat, tapi mulai bagus kalau kamu rapikan komposisinya sedikit demi sedikit.";
  }
  return "Untuk sekarang komposisinya masih cukup sehat, jadi belum perlu buru-buru diatur ulang.";
};

const getPortfolioGainNote = (gain: number) => {
  if (gain < 0) {
    return `Belum nyata - baru terasa kalau kamu jual asetnya sekarang. Kamu masih rugi sekitar ${formatPortfolioMoney(
      Math.abs(gain)
    )} di atas kertas.`;
  }

  if (gain > 0) {
    return `Belum nyata - ini masih keuntungan di atas kertas. Kalau dijual sekarang, kamu sedang unggul sekitar ${formatPortfolioMoney(
      gain
    )}.`;
  }

  return "Kalau dijual sekarang, nilainya masih kurang lebih sama dengan modal yang sudah kamu keluarkan.";
};

const getLargestHoldingNote = (sharePercent: number) => {
  if (sharePercent >= 50) return "Hampir sebagian besar uangmu ada di sini.";
  if (sharePercent >= 35) return "Ini masih jadi porsi terbesar di portofoliomu saat ini.";
  return "Ini aset dengan bobot paling besar di portofoliomu sekarang.";
};

const getPortfolioWorstAssetNote = (item: ValuedPortfolioItem | undefined) => {
  if (!item || item.unrealizedGain >= 0) {
    return "Saat ini belum ada aset yang sedang merah, jadi belum ada posisi yang benar-benar membebani portofolio.";
  }

  return "Aset ini yang paling banyak menyumbang kerugian sementara di portofoliomu.";
};

const toDisplayUnitLabel = (unit: string) => {
  if (unit === "share") return "lembar";
  return unit;
};

const buildPortfolioPriceLine = (item: ValuedPortfolioItem) => {
  const unitLabel = toDisplayUnitLabel(item.unit);
  const shouldShowUnitPrice =
    unitLabel !== "unit" &&
    unitLabel !== "account" &&
    (item.quantity > 1 || item.assetType === "GOLD" || item.assetType === "STOCK");
  const priceText =
    shouldShowUnitPrice
      ? `${formatPortfolioMoney(item.currentPrice)} per ${unitLabel}`
      : formatPortfolioMoney(item.currentPrice);

  if (item.pricingMode === "market") {
    return `Harga pasar sekarang: ${priceText}`;
  }

  return `Harga yang dipakai saat ini: ${priceText} (sementara masih pakai harga beli)`;
};



const getCompositionInsight = (params: {
  item: ValuedPortfolioItem;
  itemSharePercent: number;
  index: number;
}) => {
  const { item, itemSharePercent, index } = params;

  if (index === 0 && item.pricingMode === "book") {
    return "Ini aset terbesar kamu, tapi harga pasarnya belum tersedia sehingga nilainya masih dihitung dari harga beli.";
  }

  if (index === 0) {
    return itemSharePercent >= 50
      ? "Ini aset terbesar kamu. Bobotnya sangat dominan, jadi geraknya paling terasa ke total portofolio."
      : "Ini aset terbesar kamu. Pergerakannya paling memengaruhi total nilai portofoliomu.";
  }

  if (item.pricingMode === "book") {
    return "Harga pasar belum tersedia, jadi posisi ini masih dihitung pakai harga beli sebagai acuan sementara.";
  }

  if (item.unrealizedGain < 0 && item.unrealizedGainPercent != null && Math.abs(item.unrealizedGainPercent) >= 10) {
    return "Posisi ini sedang turun cukup dalam dibanding modal awal, jadi layak dipantau lebih dekat.";
  }

  if (item.unrealizedGain < 0) {
    return "Posisi ini sedang minus tipis, tapi masih sebatas rugi di atas kertas.";
  }

  if (item.unrealizedGain > 0) {
    return "Posisi ini sedang di zona hijau dan ikut membantu menahan portofoliomu.";
  }

  return "Posisi ini masih relatif netral, belum banyak bergerak dari modal awal.";
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const parseDecimal = (raw: string): number | null => {
  const normalized = raw.trim().replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const hasGoldDraftFields = (draft: Partial<GoldDraft>) => Object.keys(draft).length > 0;

const normalizeMenuSelectionText = (value: string) =>
  normalizeSpaces(value)
    .replace(/\uFE0F?\u20E3/gu, "")
    .trim();

const detectSingleMenuChoice = (text: string) => {
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

const detectKnownGoldBrand = (text: string) => {
  if (/\bantam\b/i.test(text)) return "Antam";
  if (/\bubs\b/i.test(text)) return "UBS";
  if (/\bgaleri\s*24\b/i.test(text)) return "Galeri24";
  return null;
};

const normalizeGoldBrand = (text: string) => {
  const known = detectKnownGoldBrand(text);
  if (known) return known;
  const custom = normalizeCustomGoldLabel(text);
  return custom ? toTitleCase(custom) : null;
};

const detectKnownGoldPlatform = (text: string) => {
  if (/\bpegadaian\b/i.test(text)) return "Pegadaian";
  if (/\btokopedia(?:\s+emas)?\b/i.test(text)) return "Tokopedia Emas";
  if (/\bshopee(?:\s+emas)?\b/i.test(text)) return "Shopee Emas";
  return null;
};

const normalizeGoldPlatform = (text: string) => {
  const known = detectKnownGoldPlatform(text);
  if (known) return known;
  const custom = normalizeCustomGoldLabel(text);
  return custom ? toTitleCase(custom) : null;
};

const normalizeGoldKarat = (text: string) => {
  const normalized = normalizeSpaces(text);
  const match =
    normalized.match(/\b(\d{1,2})\s*(?:k|karat)\b/i) ??
    normalized.match(/^(\d{1,2})$/);
  if (!match) return null;

  const karat = Number(match[1]);
  if (!Number.isFinite(karat) || karat <= 0 || karat > 24) return null;
  return `${karat}K`;
};

const parseGoldQuantity = (text: string, allowBare = false) => {
  const explicit = text.match(/([\d.,]+)\s*(?:gram|gr|g)\b/i);
  if (explicit) return parseDecimal(explicit[1]);
  if (!allowBare) return null;

  const bare = normalizeSpaces(text).match(/^([\d.,]+)$/);
  if (!bare) return null;
  return parseDecimal(bare[1]);
};

const detectGoldPriceMode = (text: string): GoldPriceMode | null => {
  if (/\bper\s*gram\b|\/\s*gram\b/i.test(text)) return "PER_GRAM";
  if (/\btotal\b/i.test(text)) return "TOTAL";
  return null;
};

const parseGoldPriceAmountFromText = (text: string, allowBare = false) => {
  const normalized = normalizeSpaces(text);
  const explicit =
    normalized.match(/\bharga(?:\s+beli)?\s+(.+)$/i)?.[1] ??
    normalized.match(/\btotal(?:\s+beli)?\s+(.+)$/i)?.[1];
  if (explicit) return parsePositiveAmount(explicit);
  if (!allowBare) return null;
  return parsePositiveAmount(normalized);
};

const inferGoldAssetType = (draft: GoldDraft): GoldAssetKind | null => {
  if (draft.assetType) return draft.assetType;
  if (draft.brand) return "BATANGAN";
  if (draft.karat) return "PERHIASAN";
  if (draft.platform) return "DIGITAL";
  return null;
};

const inferGoldPriceMode = (draft: GoldDraft): GoldPriceMode | null => {
  if (draft.priceMode || !draft.priceAmount) return draft.priceMode ?? null;
  if (draft.quantityGram != null && draft.quantityGram <= 10 && draft.priceAmount > 5_000_000) {
    return "TOTAL";
  }
  if (draft.priceAmount > 500_000 && draft.priceAmount <= 5_000_000) {
    return "PER_GRAM";
  }
  return null;
};

const applyGoldDraftInferences = (draft: GoldDraft): GoldDraft => ({
  ...draft,
  assetType: inferGoldAssetType(draft) ?? undefined,
  priceMode: inferGoldPriceMode(draft) ?? draft.priceMode
});

const mergeGoldDraft = (base: GoldDraft, update: Partial<GoldDraft>): GoldDraft =>
  applyGoldDraftInferences({
    ...base,
    ...Object.fromEntries(Object.entries(update).filter(([, value]) => value != null))
  });

const extractGoldDraftFromFreeText = (text: string): Partial<GoldDraft> => {
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

const extractGoldDraftFromAnswer = (
  text: string,
  question: GoldQuestion | null
): GoldDraftResolution => {
  const update = extractGoldDraftFromFreeText(text);
  const choice = detectSingleMenuChoice(text);

  switch (question) {
    case "TYPE":
      if (!update.assetType) {
        if (choice === 1) update.assetType = "BATANGAN";
        if (choice === 2) update.assetType = "PERHIASAN";
        if (choice === 3) update.assetType = "DIGITAL";
      }
      break;
    case "BRAND":
      if (!update.brand) {
        if (choice === 1) update.brand = "Antam";
        else if (choice === 2) update.brand = "UBS";
        else if (choice === 3) update.brand = "Galeri24";
        else if (choice === 4) return { update, promptOverride: "BRAND_OTHER" };
        else {
          const brand = normalizeGoldBrand(text);
          if (brand) update.brand = brand;
        }
      }
      break;
    case "BRAND_OTHER":
      if (!update.brand) {
        const brand = normalizeGoldBrand(text);
        if (brand) update.brand = brand;
      }
      break;
    case "WEIGHT":
    case "DIGITAL_WEIGHT":
      if (!update.quantityGram) {
        const quantityGram = parseGoldQuantity(text, true);
        if (quantityGram) update.quantityGram = quantityGram;
      }
      break;
    case "KARAT":
      if (!update.karat) {
        if (choice === 1) update.karat = "24K";
        else if (choice === 2) update.karat = "23K";
        else if (choice === 3) update.karat = "22K";
        else if (choice === 4) update.karat = "18K";
        else if (choice === 5) update.karat = "17K";
        else if (choice === 6) return { update, promptOverride: "KARAT_OTHER" };
        else {
          const karat = normalizeGoldKarat(text);
          if (karat) update.karat = karat;
        }
      }
      break;
    case "KARAT_OTHER":
      if (!update.karat) {
        const karat = normalizeGoldKarat(text);
        if (karat) update.karat = karat;
      }
      break;
    case "PLATFORM":
      if (!update.platform) {
        if (choice === 1) update.platform = "Pegadaian";
        else if (choice === 2) update.platform = "Tokopedia Emas";
        else if (choice === 3) update.platform = "Shopee Emas";
        else if (choice === 4) return { update, promptOverride: "PLATFORM_OTHER" };
        else {
          const platform = normalizeGoldPlatform(text);
          if (platform) update.platform = platform;
        }
      }
      break;
    case "PLATFORM_OTHER":
      if (!update.platform) {
        const platform = normalizeGoldPlatform(text);
        if (platform) update.platform = platform;
      }
      break;
    case "PRICE":
      if (!update.priceAmount) {
        const priceAmount = parseGoldPriceAmountFromText(text, true);
        if (priceAmount) update.priceAmount = priceAmount;
      }
      if (!update.priceMode) {
        const priceMode = detectGoldPriceMode(text);
        if (priceMode) update.priceMode = priceMode;
      }
      break;
    case "PRICE_MODE":
      if (!update.priceMode) {
        const priceMode = detectGoldPriceMode(text);
        if (priceMode) update.priceMode = priceMode;
      }
      break;
    default:
      break;
  }

  return { update };
};

const detectGoldQuestion = (text: string): GoldQuestion | null => {
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

const isGoldConfirmationMessage = (text: string) =>
  /^\u2705?\s*Aset berhasil dicatat:/i.test(normalizeSpaces(text));

const buildGoldConversationState = async (params: {
  userId: string;
  currentMessageId?: string;
}): Promise<GoldConversationState | null> => {
  const recentTurns = await loadRecentConversationTurns({
    userId: params.userId,
    currentMessageId: params.currentMessageId,
    limit: 12
  });
  if (!recentTurns.length) return null;

  let draft: GoldDraft | null = null;
  let lastQuestion: GoldQuestion | null = null;

  for (const turn of [...recentTurns].reverse()) {
    if (turn.role === "assistant") {
      if (isGoldConfirmationMessage(turn.text)) {
        draft = null;
        lastQuestion = null;
        continue;
      }

      const question = detectGoldQuestion(turn.text);
      if (question) {
        draft = draft ?? {};
        lastQuestion = question;
      }
      continue;
    }

    if (GOLD_ADD_INTENT_PATTERN.test(turn.text)) {
      draft = applyGoldDraftInferences(extractGoldDraftFromFreeText(turn.text));
      lastQuestion = null;
      continue;
    }

    if (!draft) continue;
    const resolution = extractGoldDraftFromAnswer(turn.text, lastQuestion);
    draft = mergeGoldDraft(draft, resolution.update);
  }

  if (!draft) return null;
  return { draft, lastQuestion };
};

const looksLikeGoldFollowUpText = (text: string) => {
  const normalized = normalizeSpaces(text);
  if (!normalized) return false;
  if (detectSingleMenuChoice(normalized) != null) return true;
  if (/\b(?:gram|gr|karat|per\s*gram|total|harga|batangan|perhiasan|digital)\b/i.test(normalized)) {
    return true;
  }
  if (detectKnownGoldBrand(normalized) || detectKnownGoldPlatform(normalized)) return true;
  return normalized.split(" ").length <= 4;
};

const determineNextGoldQuestion = (draft: GoldDraft): GoldQuestion | null => {
  if (!draft.assetType) return "TYPE";

  if (draft.assetType === "BATANGAN") {
    if (!draft.brand) return "BRAND";
    if (!draft.quantityGram) return "WEIGHT";
  }

  if (draft.assetType === "PERHIASAN") {
    if (!draft.quantityGram) return "WEIGHT";
    if (!draft.karat) return "KARAT";
  }

  if (draft.assetType === "DIGITAL") {
    if (!draft.quantityGram) return "DIGITAL_WEIGHT";
    if (!draft.platform) return "PLATFORM";
  }

  if (!draft.priceAmount) return "PRICE";
  if (!draft.priceMode) return "PRICE_MODE";
  return null;
};

const getGoldQuestionText = (question: GoldQuestion) => {
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

const buildGoldAddInput = (draft: GoldDraft): ParsedAddAsset | null => {
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

const formatGoldQuantity = (quantity: number) => GRAM_FORMATTER.format(quantity);

const buildGoldSuccessReply = (draft: GoldDraft) => {
  const input = buildGoldAddInput(draft);
  if (!input || !draft.priceAmount || !draft.priceMode) {
    throw new Error("Draft emas belum lengkap");
  }

  const total =
    draft.priceMode === "TOTAL"
      ? draft.priceAmount
      : Number((input.quantity * input.pricePerUnit).toFixed(2));

  return [
    `\u2705 Aset berhasil dicatat: ${input.displayName}`,
    `- Qty: ${formatGoldQuantity(input.quantity)} gram`,
    `- Harga beli: ${formatMoney(input.pricePerUnit)}`,
    `- Total: ${formatMoney(total)}`,
    "",
    "Ketik *portfolio aku* untuk lihat nilai aset dan komposisinya."
  ].join("\n");
};

const tryResolveGoldAdd = async (params: {
  userId: string;
  text: string;
  currentMessageId?: string;
}): Promise<GoldAddResolution | null> => {
  const text = normalizeSpaces(params.text);
  const directIntent = GOLD_ADD_INTENT_PATTERN.test(text);
  let draft = directIntent ? applyGoldDraftInferences(extractGoldDraftFromFreeText(text)) : null;

  if (!directIntent) {
    if (!looksLikeGoldFollowUpText(text)) return null;

    const conversationState = await buildGoldConversationState({
      userId: params.userId,
      currentMessageId: params.currentMessageId
    });
    if (!conversationState?.lastQuestion) return null;

    const resolution = extractGoldDraftFromAnswer(text, conversationState.lastQuestion);
    if (!resolution.promptOverride && !hasGoldDraftFields(resolution.update)) return null;
    if (resolution.promptOverride) {
      return { handled: true as const, replyText: getGoldQuestionText(resolution.promptOverride) };
    }
    draft = mergeGoldDraft(conversationState.draft, resolution.update);
  }

  if (!draft || (!directIntent && !hasGoldDraftFields(draft))) return null;

  const nextQuestion = determineNextGoldQuestion(draft);
  if (nextQuestion) {
    return { handled: true as const, replyText: getGoldQuestionText(nextQuestion) };
  }

  const input = buildGoldAddInput(draft);
  if (!input) return null;

  return {
    handled: true as const,
    draft,
    input
  };
};

const mergeStockDraft = (base: StockDraft, update: Partial<StockDraft>): StockDraft => ({
  ...base,
  ...Object.fromEntries(Object.entries(update).filter(([, value]) => value != null))
});

const normalizeStockSymbolCandidate = (value: string) => {
  const normalized = normalizeSpaces(value)
    .replace(/^kode\s+saham(?:nya)?[:\s-]*/i, "")
    .replace(/^saham[:\s-]*/i, "")
    .replace(/[.,!?]+$/g, "")
    .replace(/\s+/g, "");
  if (!normalized || STOCK_NON_ANSWER_PATTERN.test(normalized)) return null;

  const cleaned = normalized.replace(/[^a-z.]/gi, "");
  if (!cleaned || !/^[a-z.]{2,10}$/i.test(cleaned)) return null;
  return normalizePortfolioSymbol("stock", cleaned);
};

const extractStockSymbolFromIntent = (text: string) => {
  const match = normalizeSpaces(text).match(/^(?:tambah|beli|catat|punya)\s+saham(?:\s+([a-z.]{2,10}))?\b/i);
  if (!match?.[1]) return null;
  return normalizeStockSymbolCandidate(match[1]);
};

const parseStockQuantity = (text: string) => {
  const match = normalizeSpaces(text).match(/(\d[\d.,]*)\s*(lot|lembar|lbr|share|shares|saham)\b/i);
  if (!match) return null;

  const amountText = match[1].replace(/[.,]/g, "");
  if (!/^\d+$/.test(amountText)) return null;

  const amount = Number(amountText);
  if (!Number.isInteger(amount) || amount <= 0) return null;

  const quantityUnit: StockQuantityUnit = /lot/i.test(match[2]) ? "lot" : "lembar";
  const quantityShares = quantityUnit === "lot" ? amount * 100 : amount;
  return { quantityAmount: amount, quantityUnit, quantityShares };
};

const parseStockPrice = (text: string, allowBare = false) => {
  const normalized = normalizeSpaces(text);
  const explicit =
    normalized.match(/\b(?:harga(?:\s+beli)?(?:\s+per\s+lembar)?|@\s*)\s+(.+)$/i)?.[1] ?? null;
  if (explicit) return parsePositiveAmount(explicit);
  if (!allowBare) return null;
  return parsePositiveAmount(normalized);
};

const extractStockDraftFromFreeText = (text: string): Partial<StockDraft> => {
  const draft: Partial<StockDraft> = {};

  const symbol = extractStockSymbolFromIntent(text);
  if (symbol) draft.symbol = symbol;

  const quantity = parseStockQuantity(text);
  if (quantity) {
    draft.quantityAmount = quantity.quantityAmount;
    draft.quantityUnit = quantity.quantityUnit;
    draft.quantityShares = quantity.quantityShares;
  }

  const pricePerUnit = parseStockPrice(text);
  if (pricePerUnit) draft.pricePerUnit = pricePerUnit;

  return draft;
};

const isStockConfirmationMessage = (text: string) =>
  normalizeSpaces(text).startsWith("Berikut catatan saham kamu:") &&
  normalizeSpaces(text).includes(normalizeSpaces(STOCK_CONFIRM_QUESTION));

const isStockSuccessMessage = (text: string) =>
  /^\u2705?\s*Saham berhasil dicatat:/i.test(normalizeSpaces(text));

const detectStockQuestion = (text: string): StockQuestion | null => {
  const normalized = normalizeSpaces(text);
  if (normalized === normalizeSpaces(STOCK_SYMBOL_QUESTION)) return "SYMBOL";
  if (normalized === normalizeSpaces(STOCK_QUANTITY_QUESTION)) return "QUANTITY";
  if (normalized === normalizeSpaces(STOCK_PRICE_QUESTION)) return "PRICE";
  if (normalized === normalizeSpaces(STOCK_CORRECTION_QUESTION)) return "CORRECTION";
  if (isStockConfirmationMessage(normalized)) return "CONFIRM";
  if (
    /^Kode saham [A-Z.]{2,10} tidak ditemukan,/i.test(normalized) ||
    normalized === normalizeSpaces(STOCK_VALIDATION_UNAVAILABLE_REPLY)
  ) {
    return "SYMBOL";
  }
  return null;
};

const parseStockConfirmation = (text: string) => {
  const normalized = normalizeSpaces(text).toLowerCase();
  if (
    /\b(?:tidak|ga|gak|ngga|nggak|engga|enggak|salah|belum|belum benar|kurang tepat)\b/i.test(
      normalized
    )
  ) {
    return false;
  }

  if (
    /\b(?:iya|iyaa|ya|yes|betul|benar|bener|sudah benar|udah benar|sesuai)\b/i.test(normalized)
  ) {
    return true;
  }

  return null;
};

const parseStockCorrectionField = (text: string): Exclude<StockQuestion, "CONFIRM" | "CORRECTION"> | null => {
  const normalized = normalizeSpaces(text).toLowerCase();
  if (/\b(?:kode|ticker|kode saham)\b/.test(normalized)) return "SYMBOL";
  if (/\b(?:jumlah|qty|kuantitas|lot|lembar)\b/.test(normalized)) return "QUANTITY";
  if (/\b(?:harga|harga beli)\b/.test(normalized)) return "PRICE";
  return null;
};

const getStockQuestionText = (question: Exclude<StockQuestion, "CONFIRM">) => {
  switch (question) {
    case "SYMBOL":
      return STOCK_SYMBOL_QUESTION;
    case "QUANTITY":
      return STOCK_QUANTITY_QUESTION;
    case "PRICE":
      return STOCK_PRICE_QUESTION;
    case "CORRECTION":
      return STOCK_CORRECTION_QUESTION;
  }
};

const buildStockConversationState = async (params: {
  userId: string;
  currentMessageId?: string;
}): Promise<StockConversationState | null> => {
  const recentTurns = await loadRecentConversationTurns({
    userId: params.userId,
    currentMessageId: params.currentMessageId,
    limit: 12
  });
  if (!recentTurns.length) return null;

  let draft: StockDraft | null = null;
  let lastQuestion: StockQuestion | null = null;

  for (const turn of [...recentTurns].reverse()) {
    if (turn.role === "assistant") {
      if (isStockSuccessMessage(turn.text)) {
        draft = null;
        lastQuestion = null;
        continue;
      }

      const question = detectStockQuestion(turn.text);
      if (question) {
        draft = draft ?? {};
        lastQuestion = question;
      }
      continue;
    }

    if (STOCK_ADD_INTENT_PATTERN.test(turn.text)) {
      draft = mergeStockDraft(draft ?? {}, extractStockDraftFromFreeText(turn.text));
      lastQuestion = null;
      continue;
    }

    if (!draft || !lastQuestion) continue;

    if (lastQuestion === "SYMBOL") {
      const symbol = normalizeStockSymbolCandidate(turn.text);
      if (symbol) {
        draft = mergeStockDraft(draft, { symbol });
      }
      continue;
    }

    if (lastQuestion === "QUANTITY") {
      const quantity = parseStockQuantity(turn.text);
      if (quantity) {
        draft = mergeStockDraft(draft, quantity);
      }
      continue;
    }

    if (lastQuestion === "PRICE") {
      const pricePerUnit = parseStockPrice(turn.text, true);
      if (pricePerUnit) {
        draft = mergeStockDraft(draft, { pricePerUnit });
      }
    }
  }

  if (!draft) return null;
  return { draft, lastQuestion };
};

const looksLikeStockFollowUpText = (text: string) => {
  const normalized = normalizeSpaces(text);
  if (!normalized) return false;
  if (parseStockConfirmation(normalized) !== null) return true;
  if (parseStockCorrectionField(normalized)) return true;
  if (parseStockQuantity(normalized)) return true;
  if (parseStockPrice(normalized, true)) return true;
  if (normalizeStockSymbolCandidate(normalized)) return true;
  return normalized.split(" ").length <= 4;
};

const validateStockSymbol = async (symbol: string) => {
  try {
    const quote = await getMarketQuoteBySymbol(symbol);
    return {
      ok: true as const,
      symbol: quote.symbol.toUpperCase()
    };
  } catch (error) {
    if (isMarketDataError(error) && error.code === "SYMBOL_NOT_FOUND") {
      return {
        ok: false as const,
        replyText: `Kode saham ${symbol.toUpperCase()} tidak ditemukan, coba cek kembali ya kode sahamnya.`
      };
    }

    return {
      ok: false as const,
      replyText: STOCK_VALIDATION_UNAVAILABLE_REPLY
    };
  }
};

const determineNextStockQuestion = (draft: StockDraft): Exclude<StockQuestion, "CONFIRM" | "CORRECTION"> | null => {
  if (!draft.symbol) return "SYMBOL";
  if (!draft.quantityAmount || !draft.quantityUnit || !draft.quantityShares) return "QUANTITY";
  if (!draft.pricePerUnit) return "PRICE";
  return null;
};

const formatStockQuantityLabel = (draft: StockDraft) => {
  if (!draft.quantityAmount || !draft.quantityUnit || !draft.quantityShares) return "-";
  if (draft.quantityUnit === "lot") {
    return `${STOCK_COUNT_FORMATTER.format(draft.quantityAmount)} lot (${STOCK_COUNT_FORMATTER.format(
      draft.quantityShares
    )} lembar)`;
  }

  return `${STOCK_COUNT_FORMATTER.format(draft.quantityShares)} lembar`;
};

const buildStockSummaryReply = (draft: StockDraft) => {
  const totalValue = (draft.quantityShares ?? 0) * (draft.pricePerUnit ?? 0);
  return [
    "Berikut catatan saham kamu:",
    `- Kode saham : ${draft.symbol ?? "-"}`,
    `- Jumlah     : ${formatStockQuantityLabel(draft)}`,
    `- Harga beli : ${formatMoney(draft.pricePerUnit ?? 0)}/lembar`,
    `- Total nilai: ${formatMoney(totalValue)}`,
    "",
    STOCK_CONFIRM_QUESTION
  ].join("\n");
};

const buildStockAddInput = (draft: StockDraft): ParsedAddAsset | null => {
  if (!draft.symbol || !draft.quantityShares || !draft.pricePerUnit) return null;

  return {
    assetType: "STOCK",
    symbol: draft.symbol,
    displayName: draft.symbol,
    quantity: draft.quantityShares,
    unit: "share",
    pricePerUnit: draft.pricePerUnit
  };
};

const buildStockSuccessReply = (draft: StockDraft) => {
  const totalValue = (draft.quantityShares ?? 0) * (draft.pricePerUnit ?? 0);
  return [
    `\u2705 Saham berhasil dicatat: ${draft.symbol ?? "Saham"}`,
    `- Jumlah: ${formatStockQuantityLabel(draft)}`,
    `- Harga beli: ${formatMoney(draft.pricePerUnit ?? 0)}/lembar`,
    `- Total nilai: ${formatMoney(totalValue)}`,
    "",
    "Ketik *portfolio aku* untuk lihat nilai aset dan komposisinya."
  ].join("\n");
};

const tryResolveStockAdd = async (params: {
  userId: string;
  text: string;
  currentMessageId?: string;
}): Promise<StockAddResolution | null> => {
  const text = normalizeSpaces(params.text);
  const directIntent = STOCK_ADD_INTENT_PATTERN.test(text);

  let draft = directIntent ? mergeStockDraft({}, extractStockDraftFromFreeText(text)) : null;
  let lastQuestion: StockQuestion | null = null;

  if (!directIntent) {
    if (!looksLikeStockFollowUpText(text)) return null;

    const conversationState = await buildStockConversationState({
      userId: params.userId,
      currentMessageId: params.currentMessageId
    });
    if (!conversationState?.lastQuestion) return null;

    draft = conversationState.draft;
    lastQuestion = conversationState.lastQuestion;
  }

  if (!draft) draft = {};

  if (lastQuestion === "CONFIRM") {
    const confirmation = parseStockConfirmation(text);
    if (confirmation === true) {
      const input = buildStockAddInput(draft);
      if (!input) return null;
      return { handled: true as const, draft, input };
    }
    if (confirmation === false) {
      return { handled: true as const, replyText: STOCK_CORRECTION_QUESTION };
    }
    return {
      handled: true as const,
      replyText: `Balas \`ya\` kalau sudah benar, atau \`tidak\` kalau mau koreksi ya.\n\n${buildStockSummaryReply(
        draft
      )}`
    };
  }

  if (lastQuestion === "CORRECTION") {
    const correctionField = parseStockCorrectionField(text);
    if (!correctionField) {
      return {
        handled: true as const,
        replyText: `${STOCK_CORRECTION_QUESTION}\n\nBalas salah satu: kode saham, jumlah, atau harga beli.`
      };
    }
    return { handled: true as const, replyText: getStockQuestionText(correctionField) };
  }

  if (directIntent || lastQuestion === "SYMBOL") {
    const symbolCandidate = directIntent ? draft.symbol ?? null : normalizeStockSymbolCandidate(text);
    if (!symbolCandidate) {
      return { handled: true as const, replyText: STOCK_SYMBOL_QUESTION };
    }

    const validation = await validateStockSymbol(symbolCandidate);
    if (!validation.ok) {
      return { handled: true as const, replyText: validation.replyText };
    }

    draft = mergeStockDraft(draft, { symbol: validation.symbol });
  }

  if (lastQuestion === "QUANTITY") {
    const quantity = parseStockQuantity(text);
    if (!quantity) {
      return {
        handled: true as const,
        replyText: `${STOCK_QUANTITY_QUESTION}\n\nTulis misalnya \`2 lot\` atau \`150 lembar\` ya.`
      };
    }
    draft = mergeStockDraft(draft, quantity);
  }

  if (lastQuestion === "PRICE") {
    const pricePerUnit = parseStockPrice(text, true);
    if (!pricePerUnit) {
      return {
        handled: true as const,
        replyText: `${STOCK_PRICE_QUESTION}\n\nKirim angka rupiahnya ya.`
      };
    }
    draft = mergeStockDraft(draft, { pricePerUnit });
  }

  const nextQuestion = determineNextStockQuestion(draft);
  if (nextQuestion) {
    return { handled: true as const, replyText: getStockQuestionText(nextQuestion) };
  }

  return {
    handled: true as const,
    replyText: buildStockSummaryReply(draft)
  };
};

const parseCryptoAdd = (text: string): ParsedAddAsset | null => {
  const directSymbolFirst = text.match(
    /^(?:tambah|catat|punya)\s+([a-z0-9/]{2,12})\s+([\d.,]+)\s+harga\s+(.+)$/i
  );
  if (directSymbolFirst) {
    const symbol = directSymbolFirst[1].toUpperCase();
    const normalizedSymbol = normalizePortfolioSymbol("crypto", symbol);
    if (/^(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|DOT|AVAX|USDT)$/i.test(normalizedSymbol)) {
      const quantity = parseDecimal(directSymbolFirst[2]);
      const pricePerUnit = parsePositiveAmount(directSymbolFirst[3]);
      if (quantity && pricePerUnit) {
        return {
          assetType: "CRYPTO",
          symbol: normalizedSymbol,
          displayName: normalizedSymbol,
          quantity,
          unit: "coin",
          pricePerUnit
        };
      }
    }
  }

  const match = text.match(
    /^(?:tambah|catat|punya)\s+(?:crypto\s+|kripto\s+)?([a-z0-9/]{2,12})\s+([\d.,]+)\s+harga\s+(.+)$/i
  );
  if (!match) return null;

  const symbol = normalizePortfolioSymbol("crypto", match[1]);
  if (!/^[A-Z]{2,10}$/.test(symbol)) return null;

  const quantity = parseDecimal(match[2]);
  const pricePerUnit = parsePositiveAmount(match[3]);
  if (!quantity || !pricePerUnit) return null;

  return {
    assetType: "CRYPTO",
    symbol,
    displayName: symbol,
    quantity,
    unit: "coin",
    pricePerUnit
  };
};

const parseSimpleAssetAdd = (text: string): ParsedAddAsset | null => {
  const directAmountMatch = text.match(
    /^(?:tambah|catat|punya)\s+(tabungan|cash|kas|deposito)\s+(.+)$/i
  );
  if (directAmountMatch) {
    const rawType = directAmountMatch[1].toLowerCase();
    const price = parsePositiveAmount(directAmountMatch[2]);
    if (!price) return null;

    const directTypeMap: Record<string, ParsedAddAsset> = {
      tabungan: {
        assetType: "DEPOSIT",
        symbol: "TABUNGAN",
        displayName: "Tabungan",
        quantity: 1,
        unit: "unit",
        pricePerUnit: price
      },
      cash: {
        assetType: "DEPOSIT",
        symbol: "CASH",
        displayName: "Cash",
        quantity: 1,
        unit: "unit",
        pricePerUnit: price
      },
      kas: {
        assetType: "DEPOSIT",
        symbol: "KAS",
        displayName: "Kas",
        quantity: 1,
        unit: "unit",
        pricePerUnit: price
      },
      deposito: {
        assetType: "DEPOSIT",
        symbol: "DEPOSITO",
        displayName: "Deposito",
        quantity: 1,
        unit: "unit",
        pricePerUnit: price
      }
    };

    return directTypeMap[rawType] ?? null;
  }

  const match = text.match(
    /^(?:tambah|catat|punya)\s+(tabungan|cash|kas|deposito|properti|bisnis)(?:\s+(.+?))?\s+(?:senilai|sebesar|harga|nilai)\s+(.+)$/i
  );
  if (!match) return null;

  const rawType = match[1].toLowerCase();
  const defaultNameMap: Record<string, string> = {
    tabungan: "Tabungan",
    cash: "Cash",
    kas: "Kas",
    deposito: "Deposito",
    properti: "Properti",
    bisnis: "Bisnis"
  };
  const name = normalizeSpaces(match[2] ?? defaultNameMap[rawType] ?? "Aset");
  const price = parsePositiveAmount(match[3]);
  if (!name || !price) return null;

  const typeMap: Record<string, SupportedPortfolioAssetType> = {
    tabungan: "DEPOSIT",
    cash: "DEPOSIT",
    kas: "DEPOSIT",
    deposito: "DEPOSIT",
    properti: "PROPERTY",
    bisnis: "BUSINESS"
  };

  return {
    assetType: typeMap[rawType] ?? "OTHER",
    symbol: name.toUpperCase().slice(0, 24),
    displayName: name,
    quantity: 1,
    unit: "unit",
    pricePerUnit: price
  };
};

const parseAddAssetCommand = (text: string): ParsedAddAsset | null =>
  parseCryptoAdd(text) ?? parseSimpleAssetAdd(text);

const getPortfolioModel = () => (prisma as { portfolioAsset?: any }).portfolioAsset;

export type PortfolioNewsContextItem = {
  assetType: PrismaPortfolioAssetType;
  symbol: string;
  displayName: string;
  normalizedSymbol: string;
  keywords: string[];
};

export const getPortfolioNewsContext = async (userId: string): Promise<PortfolioNewsContextItem[]> => {
  const portfolioModel = getPortfolioModel();
  if (!portfolioModel) return [];

  const assets = await portfolioModel.findMany({
    where: { userId },
    select: {
      assetType: true,
      symbol: true,
      displayName: true
    },
    take: 12
  });

  return assets
    .map((asset: { assetType: PrismaPortfolioAssetType; symbol: string; displayName: string }) => {
      const normalizedSymbol =
        asset.assetType === "GOLD"
          ? normalizePortfolioSymbol("gold", asset.symbol || asset.displayName)
          : asset.assetType === "CRYPTO"
            ? normalizePortfolioSymbol("crypto", asset.symbol || asset.displayName)
            : asset.assetType === "STOCK"
              ? normalizePortfolioSymbol("stock", asset.symbol || asset.displayName)
              : asset.symbol.toUpperCase();

      const normalizedDetails =
        asset.assetType === "GOLD"
          ? normalizeMarketSymbolForKind(normalizedSymbol, "gold")
          : asset.assetType === "CRYPTO"
            ? normalizeMarketSymbolForKind(normalizedSymbol, "crypto")
            : asset.assetType === "STOCK"
              ? normalizeMarketSymbolForKind(normalizedSymbol, "stock")
              : null;

      const keywords = Array.from(
        new Set(
          [
            normalizedSymbol,
            asset.symbol,
            asset.displayName,
            ...(normalizedDetails?.searchKeywords ?? [])
          ]
            .map((value) => normalizeSpaces(value))
            .filter(Boolean)
        )
      );

      return {
        assetType: asset.assetType,
        symbol: asset.symbol,
        displayName: asset.displayName,
        normalizedSymbol,
        keywords
      };
    })
    .filter((asset: PortfolioNewsContextItem) => asset.keywords.length > 0);
};

const createOrUpdateAsset = async (params: { userId: string; input: ParsedAddAsset }) => {
  const portfolioModel = getPortfolioModel();
  if (!portfolioModel) {
    throw new Error("Model portfolio belum tersedia. Jalankan prisma generate.");
  }

  const existing = await portfolioModel.findUnique({
    where: {
      userId_assetType_symbol: {
        userId: params.userId,
        assetType: params.input.assetType,
        symbol: params.input.symbol
      }
    }
  });

  if (!existing) {
    return portfolioModel.create({
      data: {
        userId: params.userId,
        assetType: params.input.assetType,
        symbol: params.input.symbol,
        displayName: params.input.displayName,
        quantity: params.input.quantity,
        unit: params.input.unit,
        averageBuyPrice: params.input.pricePerUnit,
        currency: "IDR"
      }
    });
  }

  const existingQty = toNumber(existing.quantity);
  const existingPrice = toNumber(existing.averageBuyPrice);
  const mergedQty = existingQty + params.input.quantity;
  const mergedAvgPrice =
    mergedQty > 0
      ? (existingQty * existingPrice + params.input.quantity * params.input.pricePerUnit) / mergedQty
      : params.input.pricePerUnit;

  return portfolioModel.update({
    where: { id: existing.id },
    data: {
      quantity: mergedQty,
      averageBuyPrice: mergedAvgPrice
    }
  });
};

const buildPortfolioSummary = async (userId: string) => {
  const portfolioModel = getPortfolioModel();
  if (!portfolioModel) {
    return "Model portfolio belum aktif. Jalankan migrasi + `prisma generate` dulu.";
  }

  const assets = await portfolioModel.findMany({
    where: { userId },
    orderBy: [{ assetType: "asc" }, { displayName: "asc" }]
  });
  if (!assets.length) {
    return "Portfolio masih kosong. Contoh: `Tambah saham BBCA 10 lot harga 9000`.";
  }

  const snapshot = await getUserPortfolioValuation(userId);
  const itemSharePercents = allocatePortfolioShares(snapshot.items.map((item) => item.currentValue));
  const typeSharePercents = allocatePortfolioShares(
    snapshot.typeBreakdown.map((item) => item.currentValue)
  );
  const topHoldingShare = itemSharePercents[0] ?? 0;
  const riskLabel = getPortfolioRiskLabel(snapshot.rebalanceStatus, snapshot.concentrationRisk);
  const bestAsset = [...snapshot.items].sort((left, right) => right.unrealizedGain - left.unrealizedGain)[0];
  const worstAsset = [...snapshot.items].sort((left, right) => left.unrealizedGain - right.unrealizedGain)[0];

  const lines = [
    "📊 **Ringkasan Portofolio Kamu**",
    "",
    `💰 **Nilai portofoliomu saat ini:** ${formatPortfolioMoney(snapshot.totalCurrentValue)}`,
    "",
    `Total uang yang sudah kamu masukkan: ${formatPortfolioMoney(snapshot.totalBookValue)}`,
    "",
    `📉 **Untung / Rugi sementara:** ${formatPortfolioSignedMoney(snapshot.totalUnrealizedGain, true)}`,
    `   (${getPortfolioGainNote(snapshot.totalUnrealizedGain)})`,
    "",
    `Uang tunai / kas: ${formatPortfolioMoney(snapshot.totalLiquidValue)}`,
    "   (Bagian dana yang masih likuid dan relatif mudah dipakai kembali)",
    "",
    `🏆 **Aset terbesar yang kamu pegang:** ${snapshot.topHoldingName ?? "-"} (${formatPortfolioPercent(topHoldingShare)})`,
    `   (${getLargestHoldingNote(topHoldingShare)})`,
    "",
    `Tingkat risiko portofolio:  ${riskLabel}`,
    `   (${getPortfolioRiskNote(riskLabel, topHoldingShare)})`,
    "",
    `🔁 **Perlu diatur ulang?:** ${getRebalanceLabel(snapshot.rebalanceStatus)}`,
    `   (${getRebalanceNote(snapshot.rebalanceStatus)})`,
    "",
    `📊 **Skor diversifikasi:** ${formatPortfolioScore(snapshot.diversificationScore)}/100`,
    "",
    `Aset yang lagi untung / rugi: ${snapshot.profitableAssetCount} untung, ${snapshot.losingAssetCount} rugi`,
    "",
    `Aset paling banyak ruginya: ${
      worstAsset && worstAsset.unrealizedGain < 0
        ? `${worstAsset.displayName} (${formatPortfolioSignedMoney(worstAsset.unrealizedGain)})`
        : "Belum ada aset yang rugi"
    }`,
    `   (${getPortfolioWorstAssetNote(worstAsset)})`,
    "",
    "🗂️ **Rincian jenis investasi:**"
  ];

  snapshot.typeBreakdown.forEach((item, index) => {
    lines.push(
      `   - ${PORTFOLIO_ASSET_TYPE_LABELS[item.assetType] ?? item.assetType}: ${formatPortfolioPercent(
        typeSharePercents[index] ?? 0
      )}`
    );
  });

  lines.push("");
  lines.push("🏅 **Komposisi Aset Kamu**");
  lines.push("");

  snapshot.items.forEach((item, index) => {
    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "▪️";
    lines.push(
      `${index + 1}. ${medal} **${item.displayName}** - ${formatPortfolioMoney(
        item.currentValue
      )} (${formatPortfolioPercent(itemSharePercents[index] ?? 0)})`
    );
    lines.push(`   - ${buildPortfolioPriceLine(item)}`);
    lines.push(`   - Untung/Rugi: ${formatPortfolioSignedMoney(item.unrealizedGain, true)}`);
    lines.push(
      `   - _(${getCompositionInsight({
        item,
        itemSharePercent: itemSharePercents[index] ?? 0,
        index
      })})_`
    );

    if (index < snapshot.items.length - 1) {
      lines.push("");
    }
  });

  if (snapshot.bookFallbackCount > 0) {
    lines.push("");
    lines.push(
      ` ${snapshot.bookFallbackCount} aset masih menggunakan harga beli karena harga pasar belum tersedia.`
    );
  }

  if (bestAsset && bestAsset.unrealizedGain > 0 && snapshot.losingAssetCount === 0) {
    lines.push("");
    lines.push(
      `Saat ini belum ada aset yang rugi. Posisi terbaikmu sementara ada di ${bestAsset.displayName} dengan ${formatPortfolioSignedMoney(
        bestAsset.unrealizedGain,
        true
      )}.`
    );
  }

  return lines.join("\n");
};

const buildPortfolioPerformanceReply = async (userId: string) => {
  const snapshot = await getUserPortfolioValuation(userId);
  if (!snapshot.items.length) {
    return "Portfolio masih kosong. Contoh: `Tambah saham BBCA 10 lot harga 9000`.";
  }

  const sortedByGain = [...snapshot.items].sort((left, right) => right.unrealizedGain - left.unrealizedGain);
  const bestAsset = sortedByGain[0];
  const worstAsset = [...snapshot.items].sort((left, right) => left.unrealizedGain - right.unrealizedGain)[0];
  const bestPercent =
    bestAsset?.unrealizedGainPercent != null ? `${bestAsset.unrealizedGainPercent.toFixed(1)}%` : "-";
  const worstPercent =
    worstAsset?.unrealizedGainPercent != null ? `${worstAsset.unrealizedGainPercent.toFixed(1)}%` : "-";

  return [
    "Analisa performa portfolio:",
    `- Total unrealized P/L: ${snapshot.totalUnrealizedGain >= 0 ? "+" : "-"}${formatMoney(
      Math.abs(snapshot.totalUnrealizedGain)
    )}`,
    bestAsset
      ? `- Aset paling cuan: ${bestAsset.displayName} (${bestAsset.unrealizedGain >= 0 ? "+" : "-"}${formatMoney(
          Math.abs(bestAsset.unrealizedGain)
        )} | ${bestPercent})`
      : null,
    worstAsset
      ? `- Aset paling rugi: ${worstAsset.displayName} (${worstAsset.unrealizedGain >= 0 ? "+" : "-"}${formatMoney(
          Math.abs(worstAsset.unrealizedGain)
        )} | ${worstPercent})`
      : null,
    `- Jumlah aset profit/rugi: ${snapshot.profitableAssetCount}/${snapshot.losingAssetCount}`,
    snapshot.bookFallbackCount > 0
      ? `- Catatan: ${snapshot.bookFallbackCount} aset masih pakai harga buku, jadi P/L-nya belum sepenuhnya market-based.`
      : null
  ]
    .filter(Boolean)
    .join("\n");
};

const buildPortfolioDiversificationReply = async (userId: string) => {
  const snapshot = await getUserPortfolioValuation(userId);
  if (!snapshot.items.length) {
    return "Portfolio masih kosong. Contoh: `Tambah saham BBCA 10 lot harga 9000`.";
  }

  return [
    "Analisa diversifikasi portfolio:",
    `- Skor diversifikasi: ${snapshot.diversificationScore.toFixed(1)}/100`,
    `- Holding terbesar: ${snapshot.topHoldingName ?? "-"} (${snapshot.largestAssetShare.toFixed(1)}%)`,
    `- Tipe aset dominan: ${snapshot.dominantType ?? "-"} (${snapshot.dominantTypeShare.toFixed(1)}%)`,
    `- Rasio aset likuid: ${snapshot.liquidSharePercent.toFixed(1)}%`,
    `- Status rebalance: ${snapshot.rebalanceStatus}`,
    `- Komposisi tipe aset: ${snapshot.typeBreakdown
      .slice(0, 5)
      .map((item) => `${item.assetType} ${item.sharePercent.toFixed(1)}%`)
      .join(", ")}`,
    snapshot.rebalanceReasons.length
      ? `- Fokus perbaikan: ${snapshot.rebalanceReasons.slice(0, 2).join("; ")}`
      : "- Fokus perbaikan: komposisi relatif seimbang saat ini."
  ]
    .filter(Boolean)
    .join("\n");
};

const buildPortfolioRiskReply = async (userId: string) => {
  const snapshot = await getUserPortfolioValuation(userId);
  if (!snapshot.items.length) {
    return "Portfolio masih kosong. Contoh: `Tambah saham BBCA 10 lot harga 9000`.";
  }

  const lines = [
    "Analisa risiko portfolio:",
    `- Aset terbesar: ${snapshot.topHoldingName ?? "-"} (${snapshot.largestAssetShare.toFixed(1)}%)`,
    `- Tipe aset dominan: ${snapshot.dominantType ?? "-"} (${snapshot.dominantTypeShare.toFixed(1)}%)`,
    `- Rasio aset likuid: ${snapshot.liquidSharePercent.toFixed(1)}%`,
    `- Skor diversifikasi: ${snapshot.diversificationScore.toFixed(1)}/100`,
    `- Status rebalance: ${snapshot.rebalanceStatus}`
  ];

  if (snapshot.rebalanceReasons.length) {
    lines.push("Yang paling perlu diperhatikan:");
    for (const reason of snapshot.rebalanceReasons.slice(0, 3)) {
      lines.push(`- ${reason}`);
    }
  }

  if (snapshot.rebalanceStatus === "ACTION") {
    lines.push(
      "Saran: kurangi dominasi aset terbesar, tambah tipe aset lain, dan jaga buffer aset likuid minimal 10-20%."
    );
  } else if (snapshot.rebalanceStatus === "WATCH") {
    lines.push(
      "Saran: portfolio belum gawat, tapi komposisinya perlu dipantau supaya tidak makin terkonsentrasi."
    );
  } else {
    lines.push("Saran: komposisi portfolio relatif sehat untuk ukuran diversifikasi dasar saat ini.");
  }

  return lines.join("\n");
};

const buildPortfolioDominanceReply = async (userId: string) => {
  const snapshot = await getUserPortfolioValuation(userId);
  if (!snapshot.items.length) {
    return "Portfolio masih kosong. Contoh: `Tambah saham BBCA 10 lot harga 9000`.";
  }

  const biggestAsset = snapshot.items[0];
  const biggestType = snapshot.typeBreakdown[0];
  const lines = [
    "Aset dominan portfolio kamu:",
    `- Holding terbesar: ${biggestAsset.displayName} (${snapshot.largestAssetShare.toFixed(1)}%)`,
    `- Tipe terbesar: ${biggestType?.assetType ?? "-"} (${snapshot.dominantTypeShare.toFixed(1)}%)`,
    `- Risiko konsentrasi: ${snapshot.concentrationRisk}`,
    `- Status rebalance: ${snapshot.rebalanceStatus}`
  ];

  if (snapshot.rebalanceReasons.length) {
    lines.push(`- Alasan utama: ${snapshot.rebalanceReasons[0]}`);
  }

  return lines.join("\n");
};

export const tryHandlePortfolioCommand = async (params: {
  userId: string;
  text: string;
  currentMessageId?: string;
}) => {
  const text = normalizeSpaces(params.text);
  const portfolioModelReady = Boolean(getPortfolioModel());
  if (
    /^(portfolio|portofolio|aset investasi|lihat portfolio|lihat portofolio|portfolio aku|portfolio saya|portofolio aku|portofolio saya|aset aku|aset saya|asetku|nilai aset|berapa aset|komposisi aset)\b/i.test(
      text
    )
  ) {
    if (!portfolioModelReady) {
      return {
        handled: true as const,
        replyText: "Fitur portfolio butuh migrasi DB + `prisma generate` sebelum dipakai."
      };
    }
    const replyText = await buildPortfolioSummary(params.userId);
    return { handled: true as const, replyText };
  }

  if (
    /\b(risiko portfolio|risiko portofolio|portfolio .* aman|portofolio .* aman|perlu rebalance|rebalance gak|rebalance portfolio|portfolio terlalu numpuk|portofolio terlalu numpuk|komposisi portfolio .* aman|komposisi portofolio .* aman)\b/i.test(
      text
    )
  ) {
    if (!portfolioModelReady) {
      return {
        handled: true as const,
        replyText: "Fitur portfolio butuh migrasi DB + `prisma generate` sebelum dipakai."
      };
    }
    const replyText = await buildPortfolioRiskReply(params.userId);
    return { handled: true as const, replyText };
  }

  if (
    /\b(aset paling cuan|aset paling rugi|profit portfolio|rugi portfolio|performa portfolio|portfolio cuan|portfolio rugi)\b/i.test(
      text
    )
  ) {
    if (!portfolioModelReady) {
      return {
        handled: true as const,
        replyText: "Fitur portfolio butuh migrasi DB + `prisma generate` sebelum dipakai."
      };
    }
    const replyText = await buildPortfolioPerformanceReply(params.userId);
    return { handled: true as const, replyText };
  }

  if (
    /\b(diversifikasi portfolio|diversifikasi portofolio|portfolio terdiversifikasi|portofolio terdiversifikasi|portfolio tersebar|portofolio tersebar)\b/i.test(
      text
    )
  ) {
    if (!portfolioModelReady) {
      return {
        handled: true as const,
        replyText: "Fitur portfolio butuh migrasi DB + `prisma generate` sebelum dipakai."
      };
    }
    const replyText = await buildPortfolioDiversificationReply(params.userId);
    return { handled: true as const, replyText };
  }

  if (
    /\b(aset paling dominan|holding terbesar|aset terbesar|portfolio paling besar di mana|portfolio paling dominan|aset yang paling numpuk)\b/i.test(
      text
    )
  ) {
    if (!portfolioModelReady) {
      return {
        handled: true as const,
        replyText: "Fitur portfolio butuh migrasi DB + `prisma generate` sebelum dipakai."
      };
    }
    const replyText = await buildPortfolioDominanceReply(params.userId);
    return { handled: true as const, replyText };
  }

  const stockAdd = await tryResolveStockAdd({
    userId: params.userId,
    text,
    currentMessageId: params.currentMessageId
  });
  if (stockAdd?.handled) {
    if (!portfolioModelReady) {
      return {
        handled: true as const,
        replyText: "Fitur portfolio butuh migrasi DB + `prisma generate` sebelum dipakai."
      };
    }

    if ("input" in stockAdd) {
      await createOrUpdateAsset({
        userId: params.userId,
        input: stockAdd.input
      });

      return {
        handled: true as const,
        replyText: buildStockSuccessReply(stockAdd.draft)
      };
    }

    return stockAdd;
  }

  const goldAdd = await tryResolveGoldAdd({
    userId: params.userId,
    text,
    currentMessageId: params.currentMessageId
  });
  if (goldAdd?.handled) {
    if (!portfolioModelReady) {
      return {
        handled: true as const,
        replyText: "Fitur portfolio butuh migrasi DB + `prisma generate` sebelum dipakai."
      };
    }

    if ("input" in goldAdd) {
      await createOrUpdateAsset({
        userId: params.userId,
        input: goldAdd.input
      });

      return {
        handled: true as const,
        replyText: buildGoldSuccessReply(goldAdd.draft)
      };
    }

    return goldAdd;
  }

  const addCommand = parseAddAssetCommand(text);
  if (!addCommand) return { handled: false as const };
  if (!portfolioModelReady) {
    return {
      handled: true as const,
      replyText: "Fitur portfolio butuh migrasi DB + `prisma generate` sebelum dipakai."
    };
  }

  const saved = await createOrUpdateAsset({
    userId: params.userId,
    input: addCommand
  });

  return {
    handled: true as const,
    replyText: [
      `Aset berhasil dicatat: ${saved.displayName}`,
      `- Qty: ${toNumber(saved.quantity).toFixed(4)} ${saved.unit}`,
      `- Harga rata-rata: ${formatMoney(saved.averageBuyPrice)}`,
      "Ketik `portfolio aku` untuk lihat nilai aset dan komposisinya."
    ].join("\n")
  };
};
