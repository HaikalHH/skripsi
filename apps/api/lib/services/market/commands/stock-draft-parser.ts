import { parsePositiveAmount } from "@/lib/services/transactions/amount";
import type {
  StockDraft,
  StockQuestion,
  StockQuantityUnit
} from "@/lib/services/market/commands/portfolio-command.types";
import {
  STOCK_CONFIRM_QUESTION,
  STOCK_CORRECTION_QUESTION,
  STOCK_NON_ANSWER_PATTERN,
  STOCK_PRICE_QUESTION,
  STOCK_QUANTITY_QUESTION,
  STOCK_SYMBOL_QUESTION,
  STOCK_VALIDATION_UNAVAILABLE_REPLY
} from "@/lib/services/market/commands/stock-command-constants";
import {
  normalizePortfolioSymbol,
  normalizeSpaces
} from "@/lib/services/market/commands/portfolio-formatters";

export const mergeStockDraft = (base: StockDraft, update: Partial<StockDraft>): StockDraft => ({
  ...base,
  ...Object.fromEntries(Object.entries(update).filter(([, value]) => value != null))
});

export const normalizeStockSymbolCandidate = (value: string) => {
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

export const parseStockQuantity = (text: string) => {
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

export const parseStockPrice = (text: string, allowBare = false) => {
  const normalized = normalizeSpaces(text);
  const explicit =
    normalized.match(/\b(?:harga(?:\s+beli)?(?:\s+per\s+lembar)?|@\s*)\s+(.+)$/i)?.[1] ?? null;
  if (explicit) return parsePositiveAmount(explicit);
  if (!allowBare) return null;
  return parsePositiveAmount(normalized);
};

export const extractStockDraftFromFreeText = (text: string): Partial<StockDraft> => {
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

export const parseStockConfirmation = (text: string) => {
  const normalized = normalizeSpaces(text).toLowerCase();
  if (/\b(?:tidak|ga|gak|ngga|nggak|engga|enggak|salah|belum|belum benar|kurang tepat)\b/i.test(normalized)) return false;
  if (/\b(?:iya|iyaa|ya|yes|betul|benar|bener|sudah benar|udah benar|sesuai)\b/i.test(normalized)) return true;
  return null;
};

export const parseStockCorrectionField = (
  text: string
): Exclude<StockQuestion, "CONFIRM" | "CORRECTION"> | null => {
  const normalized = normalizeSpaces(text).toLowerCase();
  if (/\b(?:kode|ticker|kode saham)\b/.test(normalized)) return "SYMBOL";
  if (/\b(?:jumlah|qty|kuantitas|lot|lembar)\b/.test(normalized)) return "QUANTITY";
  if (/\b(?:harga|harga beli)\b/.test(normalized)) return "PRICE";
  return null;
};

export const detectStockQuestion = (text: string): StockQuestion | null => {
  const normalized = normalizeSpaces(text);
  if (normalized === normalizeSpaces(STOCK_SYMBOL_QUESTION)) return "SYMBOL";
  if (normalized === normalizeSpaces(STOCK_QUANTITY_QUESTION)) return "QUANTITY";
  if (normalized === normalizeSpaces(STOCK_PRICE_QUESTION)) return "PRICE";
  if (normalized === normalizeSpaces(STOCK_CORRECTION_QUESTION)) return "CORRECTION";
  if (normalized.startsWith("Berikut catatan saham kamu:") && normalized.includes(normalizeSpaces(STOCK_CONFIRM_QUESTION))) return "CONFIRM";
  if (/^Kode saham [A-Z.]{2,10} tidak ditemukan,/i.test(normalized) || normalized === normalizeSpaces(STOCK_VALIDATION_UNAVAILABLE_REPLY)) return "SYMBOL";
  return null;
};
