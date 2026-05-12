import { MarketDataError, type MarketQuote } from "@/lib/services/market/types/quote.types";
import { requestProviderResource } from "@/lib/services/market/providers/shared/request";
import { convertQuoteToIdr } from "@/lib/services/market/providers/shared/currency-conversion";
import {
  readYahooCurrency,
  readYahooRegularPrice,
  readYahooTimestamp
} from "@/lib/services/market/providers/shared/value-parsing";

export const MANUAL_MUTUAL_FUND_SYMBOL_PREFIX = "MANUALMF_";

const normalizeMutualFundToken = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-=]/g, "");

const normalizeManualMutualFundToken = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 24);

export const isManualMutualFundSymbol = (value: string) =>
  value.trim().toUpperCase().startsWith(MANUAL_MUTUAL_FUND_SYMBOL_PREFIX);

export const buildManualMutualFundSymbol = (value: string) =>
  `${MANUAL_MUTUAL_FUND_SYMBOL_PREFIX}${normalizeManualMutualFundToken(value) || "CUSTOM"}`;

const getYahooChartPayload = async (symbol: string) =>
  requestProviderResource({
    providerId: "yahoo_finance",
    operation: "quote",
    url: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?interval=1d&range=5d`
  });

export const resolveMutualFundSymbol = async (raw: string) => {
  const normalized = normalizeMutualFundToken(raw);
  if (!normalized) return null;

  const payload = (await requestProviderResource({
    providerId: "yahoo_finance",
    operation: "quote",
    url: `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
      raw.trim()
    )}&quotesCount=8&newsCount=0&enableFuzzyQuery=true`
  })) as {
    quotes?: Array<{ symbol?: string; quoteType?: string; shortname?: string; longname?: string }>;
  };

  const fundQuote = payload.quotes?.find((item) => item.quoteType === "MUTUALFUND");
  if (!fundQuote?.symbol) {
    return /^[A-Z0-9.\-=]{3,24}$/.test(normalized)
      ? { symbol: normalized, displayName: normalized }
      : null;
  }

  const symbol = normalizeMutualFundToken(fundQuote.symbol);
  if (!symbol) return null;
  return {
    symbol,
    displayName: fundQuote.shortname?.trim() || fundQuote.longname?.trim() || symbol
  };
};

export const getMutualFundQuoteBySymbol = async (symbol: string): Promise<MarketQuote> => {
  const normalized = normalizeMutualFundToken(symbol);
  if (!normalized || isManualMutualFundSymbol(normalized)) {
    throw new MarketDataError({
      code: "SYMBOL_NOT_FOUND",
      symbol: normalized,
      message: "Reksa dana ini perlu valuasi manual."
    });
  }

  const payload = await getYahooChartPayload(normalized);
  const rawPrice = readYahooRegularPrice(payload);
  if (!rawPrice) {
    throw new MarketDataError({
      code: "NO_DATA",
      symbol: normalized,
      message: "Quote reksa dana belum tersedia."
    });
  }

  const converted = await convertQuoteToIdr(
    rawPrice,
    readYahooCurrency(payload),
    "Yahoo Finance",
    readYahooTimestamp(payload)
  );
  if (!converted) {
    throw new MarketDataError({
      code: "NO_DATA",
      symbol: readYahooCurrency(payload) ?? "",
      message: `Currency ${readYahooCurrency(payload) ?? ""} belum didukung untuk quote reksa dana.`
    });
  }

  const now = new Date().toISOString();
  return {
    symbol: normalized,
    label: `Reksa dana ${normalized}`,
    price: converted.price,
    currency: "IDR",
    source: converted.source,
    providerId: "yahoo_finance",
    asOf: converted.asOf,
    cachedAt: now,
    status: "live",
    fallbackTrail: []
  };
};

export const getMutualFundQuoteBySelection = async (
  raw: string
): Promise<MarketQuote & { displayName: string }> => {
  const selection = await resolveMutualFundSymbol(raw);
  if (!selection) {
    throw new MarketDataError({
      code: "SYMBOL_NOT_FOUND",
      symbol: raw.trim().toUpperCase(),
      message: "Simbol reksa dana belum ditemukan."
    });
  }

  const quote = await getMutualFundQuoteBySymbol(selection.symbol);
  return { ...quote, label: selection.displayName, displayName: selection.displayName };
};
