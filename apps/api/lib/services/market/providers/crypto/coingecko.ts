import type { QuoteProvider } from "@/lib/services/market/types/provider.types";
import { requestProviderResource } from "@/lib/services/market/providers/shared/request";
import {
  toIsoTimestamp,
  toNumber,
  toRecord
} from "@/lib/services/market/providers/shared/value-parsing";
import { createProviderFailure } from "@/lib/services/market/providers/shared/provider-failure";

export const coingeckoQuoteProvider: QuoteProvider = {
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

    const payload = toRecord(
      await requestProviderResource({
        providerId: "coingecko",
        operation: "quote",
        url: `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
          coinId
        )}&vs_currencies=idr&include_last_updated_at=true`
      })
    );
    const coinPayload = toRecord(payload?.[coinId]);
    const price = toNumber(coinPayload?.idr);
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
      asOf: toIsoTimestamp(toNumber(coinPayload?.last_updated_at))
    };
  }
};
