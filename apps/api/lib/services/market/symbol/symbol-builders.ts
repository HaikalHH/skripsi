import type {
  MarketAssetKind,
  NormalizedMarketSymbol
} from "@/lib/services/market/types/symbol.types";
import { GOLD_ALIASES } from "@/lib/services/market/symbol/gold-registry";
import {
  STOCK_METADATA,
  type StockMetadata
} from "@/lib/services/market/symbol/stock-registry";

export const normalizeRawSymbol = (raw: string) =>
  raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^[^A-Z0-9]+|[^A-Z0-9./:-]+$/g, "");

const isKnownGlobalStock = (symbol: string) =>
  STOCK_METADATA[symbol]?.market === "GLOBAL";

export const BLOCKED_CRYPTO_MARKET_SYMBOLS = new Set([
  "ADA",
  "AVAX",
  "BINANCE:BTCUSDT",
  "BINANCE:ETHUSDT",
  "BINANCE:SOLUSDT",
  "BITCOIN",
  "BNB",
  "BTC",
  "BTC/USDT",
  "BTCUSDT",
  "DOGE",
  "DOT",
  "ETH",
  "ETH/USDT",
  "ETHEREUM",
  "ETHUSDT",
  "KRIPTO",
  "SOL",
  "SOL/USDT",
  "SOLANA",
  "SOLUSDT",
  "USDC",
  "USDT",
  "XRP"
]);

const toYahooIdxSymbol = (symbol: string) => `${symbol}.JK`;

export const buildGoldSymbol = (rawInput: string): NormalizedMarketSymbol => ({
  rawInput,
  kind: "gold",
  canonicalSymbol: "XAU",
  displaySymbol: "XAU",
  displayName: "Emas",
  aliases: GOLD_ALIASES,
  searchKeywords: ["XAU", "Emas", "Gold"],
  providerSymbols: {
    goldApi: "XAU/USD",
    yahoo: "GC=F",
    rssQuery: "emas OR gold OR XAU"
  }
});

export const buildStockSymbol = (
  rawInput: string,
  canonicalSymbol: string,
  metadata?: StockMetadata
): NormalizedMarketSymbol => {
  const market = metadata?.market ?? (isKnownGlobalStock(canonicalSymbol) ? "GLOBAL" : "IDX");
  const providerSymbol = market === "IDX" ? toYahooIdxSymbol(canonicalSymbol) : canonicalSymbol;
  const displayName = metadata?.displayName ?? `Saham ${canonicalSymbol}`;
  const aliases = metadata?.aliases ?? [canonicalSymbol];
  const searchKeywords = metadata?.searchKeywords ?? [canonicalSymbol];

  return {
    rawInput,
    kind: "stock",
    canonicalSymbol,
    displaySymbol: canonicalSymbol,
    displayName,
    aliases,
    searchKeywords,
    providerSymbols: {
      finnhub: providerSymbol,
      yahoo: providerSymbol,
      rssQuery: searchKeywords.join(" OR ")
    }
  };
};

export const toSupportedKind = (kind: MarketAssetKind) => kind;
