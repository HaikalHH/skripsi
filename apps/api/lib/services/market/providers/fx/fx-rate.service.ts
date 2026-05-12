import { loadWithMarketMemoryCache } from "@/lib/services/market/cache/market-memory-cache";
import { MarketDataError } from "@/lib/services/market/types/quote.types";
import type {
  FxProvider,
  ProviderFailure
} from "@/lib/services/market/types/provider.types";
import {
  recordMarketCacheOutcome,
  recordMarketProviderSelection
} from "@/lib/services/observability/market-observability-service";
import { runProviderChain } from "@/lib/services/market/providers/shared/provider-chain";
import { isRetriableFailure } from "@/lib/services/market/providers/shared/provider-failure";
import { exchangerateHostProvider } from "@/lib/services/market/providers/fx/exchangerate-host";
import {
  openExchangeRateFallbackProvider
} from "@/lib/services/market/providers/fx/open-exchange-rate";

const FX_TTL_MS = 5 * 60_000;

const shouldUseStaleRate = (error: unknown) =>
  Array.isArray(error) && error.every((failure) => isRetriableFailure(failure));

export const getExchangeRate = async (baseCurrency: string, quoteCurrency: string) => {
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
          execute: (provider) => (provider as FxProvider).fetchRate(baseCurrency, quoteCurrency)
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
