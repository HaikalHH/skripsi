import type {
  MarketAssetKind,
  NormalizedMarketSymbol
} from "@/lib/services/market/types/symbol.types";
import {
  CRYPTO_METADATA,
  type CryptoMetadata
} from "@/lib/services/market/symbol/crypto-registry";
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

export const buildCryptoSymbol = (
  rawInput: string,
  metadata: CryptoMetadata
): NormalizedMarketSymbol => ({
  rawInput,
  kind: "crypto",
  canonicalSymbol: metadata.canonicalSymbol,
  displaySymbol: metadata.canonicalSymbol,
  displayName: metadata.displayName,
  aliases: metadata.aliases,
  searchKeywords: metadata.searchKeywords,
  providerSymbols: {
    finnhub: metadata.finnhubSymbol,
    coingeckoId: metadata.coingeckoId,
    rssQuery: metadata.searchKeywords.join(" OR ")
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

export const normalizeCryptoKey = (cleaned: string) =>
  cleaned
    .replace(/^BINANCE:/, "")
    .replace(/\/USDT$/, "")
    .replace(/USDT$/, "");

export const findCryptoMetadata = (cleaned: string) => {
  const cryptoKey = normalizeCryptoKey(cleaned);
  return (
    CRYPTO_METADATA[cryptoKey] ??
    Object.values(CRYPTO_METADATA).find((entry) => entry.aliases.includes(cleaned)) ??
    null
  );
};

export const toSupportedKind = (kind: MarketAssetKind) => kind;
