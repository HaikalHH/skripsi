import { env } from "@/lib/env";
import type { QuoteProvider } from "@/lib/services/market/types/provider.types";
import { requestProviderResource } from "@/lib/services/market/providers/shared/request";
import {
  toIsoTimestamp,
  toNumber,
  toRecord
} from "@/lib/services/market/providers/shared/value-parsing";
import { convertUsdToIdr } from "@/lib/services/market/providers/shared/currency-conversion";
import { createProviderFailure } from "@/lib/services/market/providers/shared/provider-failure";

export const finnhubCryptoQuoteProvider: QuoteProvider = {
  id: "finnhub",
  operation: "quote",
  enabled: env.FINNHUB_API_KEY.length > 0,
  supports: (symbol) => symbol.kind === "crypto",
  fetchQuote: async (symbol) => {
    const payload = toRecord(
      await requestProviderResource({
        providerId: "finnhub",
        operation: "quote",
        url: `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
          symbol.providerSymbols.finnhub ?? symbol.canonicalSymbol
        )}&token=${encodeURIComponent(env.FINNHUB_API_KEY)}`
      })
    );
    const currentPrice = toNumber(payload?.c);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw createProviderFailure({
        providerId: "finnhub",
        reason: "no-data",
        message: "Finnhub returned empty quote",
        retriable: false
      });
    }

    const timestamp = typeof payload?.t === "number" || typeof payload?.t === "string" ? payload.t : null;
    if (symbol.canonicalSymbol === "USDT") {
      return {
        price: currentPrice,
        providerId: "finnhub",
        source: "Finnhub",
        asOf: toIsoTimestamp(timestamp)
      };
    }

    const converted = await convertUsdToIdr(currentPrice, "finnhub", timestamp);
    return {
      price: converted.price,
      providerId: "finnhub",
      source: "Finnhub + exchangerate.host",
      asOf: converted.asOf
    };
  }
};
