import type {
  MarketAssetKind,
  NormalizedMarketSymbol
} from "@/lib/services/market/types/symbol.types";
import { GOLD_ALIASES } from "@/lib/services/market/symbol/gold-registry";
import {
  STOCK_ALIAS_TO_CANONICAL,
  STOCK_METADATA
} from "@/lib/services/market/symbol/stock-registry";
import {
  BLOCKED_CRYPTO_MARKET_SYMBOLS,
  buildGoldSymbol,
  buildStockSymbol,
  normalizeRawSymbol
} from "@/lib/services/market/symbol/symbol-builders";
export {
  listKnownMarketSymbols,
  suggestMarketSymbols
} from "@/lib/services/market/symbol/symbol-suggestions";
export type {
  MarketAssetKind,
  NormalizedMarketSymbol
} from "@/lib/services/market/types/symbol.types";

export const normalizeMarketSymbolForKind = (
  raw: string,
  kind: MarketAssetKind
): NormalizedMarketSymbol | null => {
  const cleaned = normalizeRawSymbol(raw);
  if (!cleaned) return null;

  if (kind === "gold") return buildGoldSymbol(raw);

  const stockKey = cleaned.replace(/\.JK$/, "");
  if (BLOCKED_CRYPTO_MARKET_SYMBOLS.has(stockKey)) return null;
  const canonicalSymbol = STOCK_ALIAS_TO_CANONICAL[stockKey] ?? stockKey;
  if (!/^[A-Z]{1,6}$/.test(canonicalSymbol)) return null;

  return buildStockSymbol(raw, canonicalSymbol, STOCK_METADATA[canonicalSymbol]);
};

export const normalizeMarketSymbol = (raw: string): NormalizedMarketSymbol | null => {
  const cleaned = normalizeRawSymbol(raw);
  if (!cleaned) return null;

  if (GOLD_ALIASES.includes(cleaned)) return buildGoldSymbol(raw);

  if (BLOCKED_CRYPTO_MARKET_SYMBOLS.has(cleaned.replace(/\.JK$/, ""))) return null;

  const stockCandidate = normalizeMarketSymbolForKind(raw, "stock");
  if (stockCandidate) return stockCandidate;

  return null;
};

export const normalizeSymbolForNewsQuery = (value: string) => {
  const normalized = normalizeMarketSymbol(value);
  if (!normalized) return value.trim();
  return normalized.searchKeywords.join(" OR ");
};
