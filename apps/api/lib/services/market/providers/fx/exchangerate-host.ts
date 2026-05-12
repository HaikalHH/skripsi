import { env } from "@/lib/env";
import type { FxProvider } from "@/lib/services/market/types/provider.types";
import { createProviderFailure } from "@/lib/services/market/providers/shared/provider-failure";
import { requestProviderResource } from "@/lib/services/market/providers/shared/request";
import {
  toIsoTimestamp,
  toNumber,
  toRecord
} from "@/lib/services/market/providers/shared/value-parsing";

export const exchangerateHostProvider: FxProvider = {
  id: "exchangerate_host",
  operation: "fx",
  enabled: env.EXCHANGERATE_API_KEY.length > 0,
  fetchRate: async (baseCurrency, quoteCurrency) => {
    const providerId = "exchangerate_host";
    const query = `from=${encodeURIComponent(baseCurrency)}&to=${encodeURIComponent(
      quoteCurrency
    )}&amount=1&access_key=${encodeURIComponent(env.EXCHANGERATE_API_KEY)}`;

    const payload = toRecord(
      await requestProviderResource({
        providerId,
        operation: "fx",
        url: `https://api.exchangerate.host/convert?${query}`
      })
    );
    const quotes = toRecord(payload?.quotes);
    const rates = toRecord(payload?.rates);
    const info = toRecord(payload?.info);
    const directRate =
      toNumber(payload?.result) ||
      toNumber(info?.quote) ||
      toNumber(quotes?.[`${baseCurrency}${quoteCurrency}`]) ||
      toNumber(rates?.[quoteCurrency]);

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
      asOf: toIsoTimestamp(
        typeof payload?.date === "string" ? payload.date : toNumber(payload?.timestamp)
      )
    };
  }
};
