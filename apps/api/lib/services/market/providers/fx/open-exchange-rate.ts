import type { FxProvider } from "@/lib/services/market/types/provider.types";
import { createProviderFailure } from "@/lib/services/market/providers/shared/provider-failure";
import { requestProviderResource } from "@/lib/services/market/providers/shared/request";
import {
  toIsoTimestamp,
  toNumber,
  toRecord
} from "@/lib/services/market/providers/shared/value-parsing";

export const openExchangeRateFallbackProvider: FxProvider = {
  id: "open_er_api",
  operation: "fx",
  enabled: true,
  fetchRate: async (baseCurrency, quoteCurrency) => {
    const payload = toRecord(
      await requestProviderResource({
        providerId: "open_er_api",
        operation: "fx",
        url: `https://open.er-api.com/v6/latest/${encodeURIComponent(baseCurrency)}`
      })
    );
    const rate = toNumber(toRecord(payload?.rates)?.[quoteCurrency]);
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
      asOf: toIsoTimestamp(toNumber(payload?.time_last_update_unix))
    };
  }
};
