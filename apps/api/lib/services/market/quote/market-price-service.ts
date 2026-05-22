import { logger } from "@/lib/logger";
import { loadWithMarketMemoryCache } from "@/lib/services/market/cache/market-memory-cache";
import {
  normalizeMarketSymbol,
  suggestMarketSymbols
} from "@/lib/services/market/symbol";
import {
  MarketDataError,
  type MarketQuote
} from "@/lib/services/market/types/quote.types";
import type {
  CachedQuotePayload,
  ProviderFailure
} from "@/lib/services/market/types/provider.types";
import { TROY_OUNCE_TO_GRAM } from "@/lib/services/market/types/market.constants";
import { isRetriableFailure } from "@/lib/services/market/providers/shared/provider-failure";
import { finalizeQuote } from "@/lib/services/market/quote/quote-label";
import { getQuoteFromProviders } from "@/lib/services/market/quote/quote-provider-chain";

export { TROY_OUNCE_TO_GRAM };
export * from "@/lib/services/market/types/quote.types";

const QUOTE_TTL_MS = 60_000;

const shouldUseStaleQuote = (error: unknown) =>
  Array.isArray(error) && error.every((failure) => isRetriableFailure(failure));

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
        return { ...result, normalized };
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

    logger.warn({ symbol: normalized.displaySymbol, failures }, "Market quote resolution failed");
    throw new MarketDataError({
      code,
      symbol: normalized.displaySymbol,
      message,
      suggestions: suggestMarketSymbols(normalized.displaySymbol),
      fallbackTrail: failures.map((failure) => `${failure.providerId}:${failure.reason}`)
    });
  }
};
