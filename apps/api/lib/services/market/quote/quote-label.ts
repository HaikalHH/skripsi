import {
  recordMarketCacheOutcome,
  recordMarketProviderSelection
} from "@/lib/services/observability/market-observability-service";
import type { MemoryCacheState } from "@/lib/services/market/cache/market-memory-cache";
import type {
  CachedQuotePayload,
  ProviderFailure,
  ProviderQuotePayload
} from "@/lib/services/market/types/provider.types";
import type { MarketQuote } from "@/lib/services/market/types/quote.types";
import type { NormalizedMarketSymbol } from "@/lib/services/market/types/symbol.types";

export const buildQuoteLabel = (normalized: NormalizedMarketSymbol) => {
  if (normalized.kind === "gold") return "Emas (IDR/gram)";
  if (normalized.kind === "crypto") return `Crypto ${normalized.displaySymbol}`;
  return `Saham ${normalized.displaySymbol}`;
};

export const buildSourceLabel = (
  payload: ProviderQuotePayload,
  fallbackTrail: ProviderFailure[]
) => {
  if (!fallbackTrail.length) return payload.source;
  return `${payload.source} (fallback)`;
};

export const finalizeQuote = (params: {
  cachedPayload: CachedQuotePayload;
  cacheState: MemoryCacheState;
  cachedAt: number;
  failures: ProviderFailure[];
}) => {
  const status = params.cacheState === "stale" ? "stale" : "live";
  const normalized = params.cachedPayload.normalized;
  recordMarketCacheOutcome(
    params.cacheState === "fresh" ? "hit" : params.cacheState === "stale" ? "stale" : "miss",
    `quote:${normalized.kind}:${normalized.canonicalSymbol}`
  );
  recordMarketProviderSelection({
    providerId: params.cachedPayload.providerId,
    operation: "quote",
    cacheState: status
  });

  return {
    symbol: normalized.displaySymbol,
    label: buildQuoteLabel(normalized),
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
