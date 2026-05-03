import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  loadWithMarketMemoryCache,
  type MemoryCacheState
} from "@/lib/services/market/market-memory-cache";
import {
  normalizeMarketSymbol,
  normalizeMarketSymbolForKind,
  suggestMarketSymbols,
  type MarketAssetKind,
  type NormalizedMarketSymbol
} from "@/lib/services/market/market-symbol-normalization";
import {
  recordMarketCacheOutcome,
  recordMarketFallback,
  recordMarketProviderError,
  recordMarketProviderLatency,
  recordMarketProviderSelection,
  type MarketObservationOperation,
  type MarketObservationReason
} from "@/lib/services/observability/market-observability-service";

const QUOTE_TTL_MS = 60_000;
const FX_TTL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 4_500;
export const TROY_OUNCE_TO_GRAM = 31.1034768;

type ProviderQuotePayload = {
  price: number;
  providerId: string;
  source: string;
  asOf: string;
};

type ExchangeRatePayload = {
  rate: number;
  providerId: string;
  source: string;
  asOf: string;
};

type CachedQuotePayload = ProviderQuotePayload & {
  normalized: NormalizedMarketSymbol;
};

type QuoteProvider = {
  id: string;
  operation: "quote";
  enabled: boolean;
  supports: (symbol: NormalizedMarketSymbol) => boolean;
  fetchQuote: (symbol: NormalizedMarketSymbol) => Promise<ProviderQuotePayload>;
};

type FxProvider = {
  id: string;
  operation: "fx";
  enabled: boolean;
  fetchRate: (baseCurrency: string, quoteCurrency: string) => Promise<ExchangeRatePayload>;
};

type ProviderFailure = {
  providerId: string;
  reason: MarketObservationReason;
  message: string;
  retriable: boolean;
};

export type MarketQuote = {
  symbol: string;
  label: string;
  price: number;
  currency: "IDR";
  source: string;
  providerId: string;
  asOf: string;
  cachedAt: string;
  status: "live" | "stale";
  fallbackTrail: string[];
};

export type MutualFundSelection = {
  symbol: string;
  displayName: string;
};

export class MarketDataError extends Error {
  code: "SYMBOL_NOT_FOUND" | "PROVIDER_UNAVAILABLE" | "NO_DATA";
  symbol: string;
  suggestions: string[];
  fallbackTrail: string[];
  staleTimestamp?: string | null;

  constructor(params: {
    code: "SYMBOL_NOT_FOUND" | "PROVIDER_UNAVAILABLE" | "NO_DATA";
    symbol: string;
    message: string;
    suggestions?: string[];
    fallbackTrail?: string[];
    staleTimestamp?: string | null;
  }) {
    super(params.message);
    this.name = "MarketDataError";
    this.code = params.code;
    this.symbol = params.symbol;
    this.suggestions = params.suggestions ?? [];
    this.fallbackTrail = params.fallbackTrail ?? [];
    this.staleTimestamp = params.staleTimestamp ?? null;
  }
}

export const isMarketDataError = (value: unknown): value is MarketDataError =>
  value instanceof MarketDataError;

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return NaN;
};

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

export const normalizeSupportedCryptoSymbol = (raw: string) =>
  normalizeMarketSymbolForKind(raw, "crypto")?.canonicalSymbol ?? null;

const toIsoTimestamp = (value?: string | number | null) => {
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const normalized = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(normalized).toISOString();
  }

  return new Date().toISOString();
};

const readYahooRegularPrice = (payload: any): number | null => {
  const result = payload?.chart?.result?.[0];
  const metaPrice = toNumber(result?.meta?.regularMarketPrice);
  if (Number.isFinite(metaPrice) && metaPrice > 0) return metaPrice;

  const closes = result?.indicators?.quote?.[0]?.close;
  if (Array.isArray(closes)) {
    for (let index = closes.length - 1; index >= 0; index -= 1) {
      const candidate = toNumber(closes[index]);
      if (Number.isFinite(candidate) && candidate > 0) return candidate;
    }
  }

  return null;
};

const createProviderFailure = (params: {
  providerId: string;
  reason: MarketObservationReason;
  message: string;
  retriable?: boolean;
}) => ({
  providerId: params.providerId,
  reason: params.reason,
  message: params.message,
  retriable: params.retriable ?? params.reason !== "no-data"
});

const isRetriableFailure = (failure: ProviderFailure) => failure.retriable;
const isProviderFailure = (value: unknown): value is ProviderFailure =>
  Boolean(
    value &&
      typeof value === "object" &&
      "providerId" in value &&
      "reason" in value &&
      "message" in value
  );

const classifyProviderFailure = (providerId: string, error: unknown): ProviderFailure => {
  if (isProviderFailure(error)) {
    return error;
  }

  if (error instanceof MarketDataError) {
    return createProviderFailure({
      providerId,
      reason: error.code === "SYMBOL_NOT_FOUND" ? "no-data" : "network",
      message: error.message,
      retriable: error.code !== "SYMBOL_NOT_FOUND"
    });
  }

  if (error instanceof Error) {
    return createProviderFailure({
      providerId,
      reason: /timeout/i.test(error.message) ? "timeout" : "network",
      message: error.message
    });
  }

  return createProviderFailure({
    providerId,
    reason: "network",
    message: "Unknown provider failure"
  });
};

const createDisabledProviderFailure = (providerId: string): ProviderFailure =>
  createProviderFailure({
    providerId,
    reason: "no-key",
    message: `Provider ${providerId} disabled because API key is missing`
  });

const requestProviderResource = async (params: {
  providerId: string;
  operation: MarketObservationOperation;
  url: string;
  headers?: Record<string, string>;
  responseType?: "json" | "text";
}) => {
  const startedAt = Date.now();

  try {
    const response = await fetch(params.url, {
      headers: {
        "User-Agent": "finance-bot/1.0",
        ...(params.headers ?? {})
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    const latencyMs = Date.now() - startedAt;
    recordMarketProviderLatency({
      providerId: params.providerId,
      operation: params.operation,
      latencyMs
    });

    if (!response.ok) {
      const reason: MarketObservationReason =
        response.status === 429 ? "rate-limit" : response.status >= 500 ? "5xx" : "no-data";
      recordMarketProviderError({
        providerId: params.providerId,
        operation: params.operation,
        reason
      });
      throw createProviderFailure({
        providerId: params.providerId,
        reason,
        message: `${params.providerId} request failed with status ${response.status}`,
        retriable: reason !== "no-data"
      });
    }

    return params.responseType === "text" ? response.text() : response.json();
  } catch (error) {
    if (isProviderFailure(error)) {
      throw error;
    }

    const latencyMs = Date.now() - startedAt;
    recordMarketProviderLatency({
      providerId: params.providerId,
      operation: params.operation,
      latencyMs
    });

    const reason: MarketObservationReason =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        ? "timeout"
        : error instanceof Error && /timeout/i.test(error.message)
          ? "timeout"
          : error instanceof Error && /429/.test(error.message)
            ? "rate-limit"
            : "network";

    recordMarketProviderError({
      providerId: params.providerId,
      operation: params.operation,
      reason
    });

    throw createProviderFailure({
      providerId: params.providerId,
      reason,
      message: error instanceof Error ? error.message : "Provider request failed"
    });
  }
};

const runProviderChain = async <T>(params: {
  providers: Array<QuoteProvider | FxProvider>;
  operation: MarketObservationOperation;
  execute: (provider: QuoteProvider | FxProvider) => Promise<T>;
}) => {
  const failures: ProviderFailure[] = [];

  for (const provider of params.providers) {
    if (!provider.enabled) {
      const failure = createDisabledProviderFailure(provider.id);
      failures.push(failure);
      recordMarketFallback({
        providerId: provider.id,
        operation: params.operation,
        reason: failure.reason
      });
      continue;
    }

    try {
      const result = await params.execute(provider);
      return { result, failures };
    } catch (error) {
      const failure = classifyProviderFailure(provider.id, error);
      failures.push(failure);
      recordMarketFallback({
        providerId: provider.id,
        operation: params.operation,
        reason: failure.reason
      });
    }
  }

  throw failures;
};

const buildQuoteLabel = (normalized: NormalizedMarketSymbol) => {
  if (normalized.kind === "gold") return "Emas (IDR/gram)";
  if (normalized.kind === "crypto") return `Crypto ${normalized.displaySymbol}`;
  return `Saham ${normalized.displaySymbol}`;
};

const buildSourceLabel = (payload: ProviderQuotePayload, fallbackTrail: ProviderFailure[]) => {
  if (!fallbackTrail.length) return payload.source;
  return `${payload.source} (fallback setelah ${fallbackTrail.map((item) => item.providerId).join(" -> ")})`;
};

const shouldUseStaleQuote = (error: unknown) =>
  Array.isArray(error) && error.every((failure) => isRetriableFailure(failure));

const shouldUseStaleRate = shouldUseStaleQuote;

const finalizeQuote = (params: {
  cachedPayload: CachedQuotePayload;
  cacheState: MemoryCacheState;
  cachedAt: number;
  failures: ProviderFailure[];
}) => {
  const status = params.cacheState === "stale" ? "stale" : "live";
  recordMarketCacheOutcome(
    params.cacheState === "fresh" ? "hit" : params.cacheState === "stale" ? "stale" : "miss",
    `quote:${params.cachedPayload.normalized.kind}:${params.cachedPayload.normalized.canonicalSymbol}`
  );
  recordMarketProviderSelection({
    providerId: params.cachedPayload.providerId,
    operation: "quote",
    cacheState: status
  });

  return {
    symbol: params.cachedPayload.normalized.displaySymbol,
    label: buildQuoteLabel(params.cachedPayload.normalized),
    price: params.cachedPayload.price,
    currency: "IDR" as const,
    source: buildSourceLabel(params.cachedPayload, params.failures),
    providerId: params.cachedPayload.providerId,
    asOf: params.cachedPayload.asOf,
    cachedAt: new Date(params.cachedAt).toISOString(),
    status,
    fallbackTrail: params.failures.map((failure) => `${failure.providerId}:${failure.reason}`)
  } satisfies MarketQuote;
};

const convertUsdToIdr = async (usdPrice: number, source: string, asOf?: string | number | null) => {
  const usdToIdr = await getExchangeRate("USD", "IDR");
  return {
    price: usdPrice * usdToIdr.rate,
    providerId: source,
    asOf: toIsoTimestamp(asOf ?? usdToIdr.asOf)
  };
};

const exchangerateHostProvider: FxProvider = {
  id: "exchangerate_host",
  operation: "fx",
  enabled: env.EXCHANGERATE_API_KEY.length > 0,
  fetchRate: async (baseCurrency, quoteCurrency) => {
    const providerId = "exchangerate_host";
    const query = `from=${encodeURIComponent(baseCurrency)}&to=${encodeURIComponent(
      quoteCurrency
    )}&amount=1&access_key=${encodeURIComponent(env.EXCHANGERATE_API_KEY)}`;

    const payload = (await requestProviderResource({
      providerId,
      operation: "fx",
      url: `https://api.exchangerate.host/convert?${query}`
    })) as any;

    const directRate =
      toNumber(payload?.result) ||
      toNumber(payload?.info?.quote) ||
      toNumber(payload?.quotes?.[`${baseCurrency}${quoteCurrency}`]) ||
      toNumber(payload?.rates?.[quoteCurrency]);

    if (!Number.isFinite(directRate) || directRate <= 0) {
      throw createProviderFailure({
        providerId,
        reason: "no-data",
        message: "exchangerate.host returned an invalid rate",
        retriable: false
      });
    }

    return {
      rate: directRate,
      providerId,
      source: "exchangerate.host",
      asOf: toIsoTimestamp(payload?.date ?? payload?.timestamp)
    };
  }
};

const openExchangeRateFallbackProvider: FxProvider = {
  id: "open_er_api",
  operation: "fx",
  enabled: true,
  fetchRate: async (baseCurrency, quoteCurrency) => {
    const payload = (await requestProviderResource({
      providerId: "open_er_api",
      operation: "fx",
      url: `https://open.er-api.com/v6/latest/${encodeURIComponent(baseCurrency)}`
    })) as { rates?: Record<string, number>; time_last_update_unix?: number };

    const rate = payload.rates?.[quoteCurrency];
    if (!rate || !Number.isFinite(rate)) {
      throw createProviderFailure({
        providerId: "open_er_api",
        reason: "no-data",
        message: "Fallback exchange rate unavailable",
        retriable: false
      });
    }

    return {
      rate,
      providerId: "open_er_api",
      source: "ER-API",
      asOf: toIsoTimestamp(payload.time_last_update_unix)
    };
  }
};

const getExchangeRate = async (baseCurrency: string, quoteCurrency: string) => {
  const cacheKey = `fx:${baseCurrency}:${quoteCurrency}`;

  try {
    const cached = await loadWithMarketMemoryCache({
      key: cacheKey,
      ttlMs: FX_TTL_MS,
      shouldUseStaleOnError: shouldUseStaleRate,
      load: async () => {
        const { result } = await runProviderChain({
          providers: [exchangerateHostProvider, openExchangeRateFallbackProvider],
          operation: "fx",
          execute: (provider) =>
            (provider as FxProvider).fetchRate(baseCurrency, quoteCurrency)
        });

        return result;
      }
    });

    recordMarketCacheOutcome(
      cached.state === "fresh" ? "hit" : cached.state === "stale" ? "stale" : "miss",
      cacheKey
    );
    recordMarketProviderSelection({
      providerId: cached.value.providerId,
      operation: "fx",
      cacheState: cached.state === "stale" ? "stale" : "live"
    });

    return cached.value;
  } catch (error) {
    const failures = Array.isArray(error) ? (error as ProviderFailure[]) : [];
    throw new MarketDataError({
      code: "PROVIDER_UNAVAILABLE",
      symbol: `${baseCurrency}/${quoteCurrency}`,
      message:
        failures.length > 0
          ? `Rate provider unavailable: ${failures.map((item) => `${item.providerId}:${item.reason}`).join(", ")}`
          : "Rate provider unavailable",
      fallbackTrail: failures.map((item) => `${item.providerId}:${item.reason}`)
    });
  }
};

const finnhubQuoteProvider: QuoteProvider = {
  id: "finnhub",
  operation: "quote",
  enabled: env.FINNHUB_API_KEY.length > 0,
  supports: (symbol) => symbol.kind === "stock" || symbol.kind === "crypto",
  fetchQuote: async (symbol) => {
    const payload = (await requestProviderResource({
      providerId: "finnhub",
      operation: "quote",
      url: `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
        symbol.providerSymbols.finnhub ?? symbol.canonicalSymbol
      )}&token=${encodeURIComponent(env.FINNHUB_API_KEY)}`
    })) as any;

    const currentPrice = toNumber(payload?.c);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw createProviderFailure({
        providerId: "finnhub",
        reason: "no-data",
        message: "Finnhub returned empty quote",
        retriable: false
      });
    }

    if (symbol.kind === "stock" && symbol.providerSymbols.finnhub?.endsWith(".JK")) {
      return {
        price: currentPrice,
        providerId: "finnhub",
        source: "Finnhub",
        asOf: toIsoTimestamp(payload?.t)
      };
    }

    if (symbol.kind === "crypto" && symbol.canonicalSymbol === "USDT") {
      return {
        price: currentPrice,
        providerId: "finnhub",
        source: "Finnhub",
        asOf: toIsoTimestamp(payload?.t)
      };
    }

    const converted = await convertUsdToIdr(currentPrice, "finnhub", payload?.t);
    return {
      price: converted.price,
      providerId: "finnhub",
      source: "Finnhub + exchangerate.host",
      asOf: converted.asOf
    };
  }
};

const yahooQuoteProvider: QuoteProvider = {
  id: "yahoo_finance",
  operation: "quote",
  enabled: true,
  supports: (symbol) => symbol.kind === "stock" || symbol.kind === "gold",
  fetchQuote: async (symbol) => {
    const providerSymbol = symbol.providerSymbols.yahoo ?? symbol.canonicalSymbol;
    const payload = (await requestProviderResource({
      providerId: "yahoo_finance",
      operation: "quote",
      url: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        providerSymbol
      )}?interval=1d&range=5d`
    })) as any;

    const price = readYahooRegularPrice(payload);
    if (!price) {
      throw createProviderFailure({
        providerId: "yahoo_finance",
        reason: "no-data",
        message: "Yahoo Finance returned empty quote",
        retriable: false
      });
    }

    const timestamp =
      payload?.chart?.result?.[0]?.meta?.regularMarketTime ??
      payload?.chart?.result?.[0]?.timestamp?.at?.(-1) ??
      null;

    if (symbol.kind === "stock" && providerSymbol.endsWith(".JK")) {
      return {
        price,
        providerId: "yahoo_finance",
        source: "Yahoo Finance",
        asOf: toIsoTimestamp(timestamp)
      };
    }

    const converted = await convertUsdToIdr(price, "yahoo_finance", timestamp);
    return {
      price: symbol.kind === "gold" ? converted.price / TROY_OUNCE_TO_GRAM : converted.price,
      providerId: "yahoo_finance",
      source: "Yahoo Finance + ER-API",
      asOf: converted.asOf
    };
  }
};

const coingeckoQuoteProvider: QuoteProvider = {
  id: "coingecko",
  operation: "quote",
  enabled: true,
  supports: (symbol) => symbol.kind === "crypto" && Boolean(symbol.providerSymbols.coingeckoId),
  fetchQuote: async (symbol) => {
    const coinId = symbol.providerSymbols.coingeckoId;
    if (!coinId) {
      throw createProviderFailure({
        providerId: "coingecko",
        reason: "no-data",
        message: "CoinGecko symbol unsupported",
        retriable: false
      });
    }

    const payload = (await requestProviderResource({
      providerId: "coingecko",
      operation: "quote",
      url: `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
        coinId
      )}&vs_currencies=idr&include_last_updated_at=true`
    })) as Record<string, { idr?: number; last_updated_at?: number }>;

    const price = payload?.[coinId]?.idr;
    if (!price || !Number.isFinite(price)) {
      throw createProviderFailure({
        providerId: "coingecko",
        reason: "no-data",
        message: "CoinGecko returned empty quote",
        retriable: false
      });
    }

    return {
      price,
      providerId: "coingecko",
      source: "CoinGecko",
      asOf: toIsoTimestamp(payload?.[coinId]?.last_updated_at)
    };
  }
};

const goldApiQuoteProvider: QuoteProvider = {
  id: "goldapi",
  operation: "quote",
  enabled: env.GOLDAPI_API_KEY.length > 0,
  supports: (symbol) => symbol.kind === "gold",
  fetchQuote: async () => {
    const payload = (await requestProviderResource({
      providerId: "goldapi",
      operation: "quote",
      url: "https://www.goldapi.io/api/XAU/USD",
      headers: {
        "x-access-token": env.GOLDAPI_API_KEY,
        "Content-Type": "application/json"
      }
    })) as any;

    const usdPerOunce = toNumber(payload?.price);
    if (!Number.isFinite(usdPerOunce) || usdPerOunce <= 0) {
      throw createProviderFailure({
        providerId: "goldapi",
        reason: "no-data",
        message: "GoldAPI returned invalid gold quote",
        retriable: false
      });
    }

    const usdToIdr = await getExchangeRate("USD", "IDR");
    const idrPerGram = (usdPerOunce * usdToIdr.rate) / TROY_OUNCE_TO_GRAM;

    return {
      price: idrPerGram,
      providerId: "goldapi",
      source: "GoldAPI + exchangerate.host",
      asOf: toIsoTimestamp(payload?.timestamp)
    };
  }
};

const quoteProvidersByKind: Record<MarketAssetKind, QuoteProvider[]> = {
  stock: [finnhubQuoteProvider, yahooQuoteProvider],
  crypto: [finnhubQuoteProvider, coingeckoQuoteProvider],
  gold: [goldApiQuoteProvider, yahooQuoteProvider]
};

const getQuoteFromProviders = async (normalized: NormalizedMarketSymbol) => {
  const providers = quoteProvidersByKind[normalized.kind].filter((provider) => provider.supports(normalized));
  const { result, failures } = await runProviderChain({
    providers,
    operation: "quote",
    execute: (provider) => (provider as QuoteProvider).fetchQuote(normalized)
  });

  return { result, failures };
};

const getYahooChartPayload = async (params: {
  providerId: string;
  symbol: string;
}) =>
  requestProviderResource({
    providerId: params.providerId,
    operation: "quote",
    url: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      params.symbol
    )}?interval=1d&range=5d`
  });

const convertQuoteToIdr = async (
  price: number,
  rawCurrency: string | null | undefined,
  source: string,
  asOf?: string | number | null
) => {
  const normalizedCurrency = (rawCurrency ?? "IDR").toUpperCase();
  if (normalizedCurrency === "IDR") {
    return {
      price,
      source,
      asOf: toIsoTimestamp(asOf)
    };
  }

  if (normalizedCurrency === "USD") {
    const usdToIdr = await getExchangeRate("USD", "IDR");
    return {
      price: price * usdToIdr.rate,
      source: `${source} + ${usdToIdr.source}`,
      asOf: toIsoTimestamp(asOf ?? usdToIdr.asOf)
    };
  }

  throw new MarketDataError({
    code: "NO_DATA",
    symbol: rawCurrency ?? "",
    message: `Currency ${normalizedCurrency} belum didukung untuk quote reksa dana.`
  });
};

export const resolveMutualFundSymbol = async (
  raw: string
): Promise<MutualFundSelection | null> => {
  const normalized = normalizeMutualFundToken(raw);
  if (!normalized) return null;

  const payload = (await requestProviderResource({
    providerId: "yahoo_finance",
    operation: "quote",
    url: `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
      raw.trim()
    )}&quotesCount=8&newsCount=0&enableFuzzyQuery=true`
  })) as {
    quotes?: Array<{
      symbol?: string;
      quoteType?: string;
      shortname?: string;
      longname?: string;
    }>;
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

export const getMutualFundQuoteBySymbol = async (
  symbol: string
): Promise<MarketQuote> => {
  const normalized = normalizeMutualFundToken(symbol);
  if (!normalized || isManualMutualFundSymbol(normalized)) {
    throw new MarketDataError({
      code: "SYMBOL_NOT_FOUND",
      symbol: normalized,
      message: "Reksa dana ini perlu valuasi manual."
    });
  }

  const payload = (await getYahooChartPayload({
    providerId: "yahoo_finance",
    symbol: normalized
  })) as any;
  const rawPrice = readYahooRegularPrice(payload);
  if (!rawPrice) {
    throw new MarketDataError({
      code: "NO_DATA",
      symbol: normalized,
      message: "Quote reksa dana belum tersedia."
    });
  }

  const result = payload?.chart?.result?.[0];
  const timestamp =
    result?.meta?.regularMarketTime ?? result?.timestamp?.at?.(-1) ?? null;
  const converted = await convertQuoteToIdr(
    rawPrice,
    result?.meta?.currency,
    "Yahoo Finance",
    timestamp
  );
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
  return {
    ...quote,
    label: selection.displayName,
    displayName: selection.displayName
  };
};

export const resolveMarketSymbol = (raw: string) => {
  const normalized = normalizeMarketSymbol(raw);
  if (!normalized) return null;

  return {
    kind: normalized.kind,
    symbol: normalized.canonicalSymbol
  };
};

export const getMarketQuoteBySymbol = async (raw: string): Promise<MarketQuote> => {
  const normalized = normalizeMarketSymbol(raw);
  if (!normalized) {
    throw new MarketDataError({
      code: "SYMBOL_NOT_FOUND",
      symbol: raw.trim().toUpperCase(),
      message: "Kode market belum didukung.",
      suggestions: suggestMarketSymbols(raw)
    });
  }

  const cacheKey = `quote:${normalized.kind}:${normalized.canonicalSymbol}`;

  try {
    let providerFailures: ProviderFailure[] = [];
    const cached = await loadWithMarketMemoryCache<CachedQuotePayload>({
      key: cacheKey,
      ttlMs: QUOTE_TTL_MS,
      shouldUseStaleOnError: shouldUseStaleQuote,
      load: async () => {
        const { result, failures } = await getQuoteFromProviders(normalized);
        providerFailures = failures;
        return {
          ...result,
          normalized
        };
      }
    });

    return finalizeQuote({
      cachedPayload: cached.value,
      cacheState: cached.state,
      cachedAt: cached.cachedAt,
      failures: providerFailures
    });
  } catch (error) {
    const failures = Array.isArray(error) ? (error as ProviderFailure[]) : [];
    const allNoData = failures.length > 0 && failures.every((failure) => failure.reason === "no-data");
    const code = allNoData ? "SYMBOL_NOT_FOUND" : "PROVIDER_UNAVAILABLE";
    const message =
      code === "SYMBOL_NOT_FOUND"
        ? `Simbol '${normalized.displaySymbol}' tidak ditemukan.`
        : "Layanan market sedang gangguan.";

    logger.warn(
      {
        symbol: normalized.displaySymbol,
        failures
      },
      "Market quote resolution failed"
    );

    throw new MarketDataError({
      code,
      symbol: normalized.displaySymbol,
      message,
      suggestions: suggestMarketSymbols(normalized.displaySymbol),
      fallbackTrail: failures.map((failure) => `${failure.providerId}:${failure.reason}`)
    });
  }
};
