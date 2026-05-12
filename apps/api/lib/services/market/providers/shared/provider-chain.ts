import {
  recordMarketFallback,
  type MarketObservationOperation
} from "@/lib/services/observability/market-observability-service";
import type {
  FxProvider,
  ProviderFailure,
  QuoteProvider
} from "@/lib/services/market/types/provider.types";
import {
  classifyProviderFailure,
  createDisabledProviderFailure
} from "@/lib/services/market/providers/shared/provider-failure";

export const runProviderChain = async <T>(params: {
  providers: Array<QuoteProvider | FxProvider>;
  operation: MarketObservationOperation;
  execute: (provider: QuoteProvider | FxProvider) => Promise<T>;
}) => {
  const failures: ProviderFailure[] = [];

  for (const provider of params.providers) {
    if (!provider.enabled) {
      const failure = createDisabledProviderFailure(provider.id);
      failures.push(failure);
      recordMarketFallback({ providerId: provider.id, operation: params.operation, reason: failure.reason });
      continue;
    }

    try {
      const result = await params.execute(provider);
      return { result, failures };
    } catch (error) {
      const failure = classifyProviderFailure(provider.id, error);
      failures.push(failure);
      recordMarketFallback({ providerId: provider.id, operation: params.operation, reason: failure.reason });
    }
  }

  throw failures;
};
