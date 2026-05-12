import { env } from "@/lib/env";
import { TROY_OUNCE_TO_GRAM } from "@/lib/services/market/types/market.constants";
import type { QuoteProvider } from "@/lib/services/market/types/provider.types";
import { getExchangeRate } from "@/lib/services/market/providers/fx/fx-rate.service";
import { requestProviderResource } from "@/lib/services/market/providers/shared/request";
import {
  toIsoTimestamp,
  toNumber,
  toRecord
} from "@/lib/services/market/providers/shared/value-parsing";
import { createProviderFailure } from "@/lib/services/market/providers/shared/provider-failure";

export const goldApiQuoteProvider: QuoteProvider = {
  id: "goldapi",
  operation: "quote",
  enabled: env.GOLDAPI_API_KEY.length > 0,
  supports: (symbol) => symbol.kind === "gold",
  fetchQuote: async () => {
    const payload = toRecord(
      await requestProviderResource({
        providerId: "goldapi",
        operation: "quote",
        url: "https://www.goldapi.io/api/XAU/USD",
        headers: {
          "x-access-token": env.GOLDAPI_API_KEY,
          "Content-Type": "application/json"
        }
      })
    );
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
    return {
      price: (usdPerOunce * usdToIdr.rate) / TROY_OUNCE_TO_GRAM,
      providerId: "goldapi",
      source: "GoldAPI + exchangerate.host",
      asOf: toIsoTimestamp(
        typeof payload?.timestamp === "string" ? payload.timestamp : toNumber(payload?.timestamp)
      )
    };
  }
};
