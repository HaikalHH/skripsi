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

export const finnhubStockQuoteProvider: QuoteProvider = {
  id: "finnhub",
  operation: "quote",
  enabled: env.FINNHUB_API_KEY.length > 0,
  supports: (symbol) => symbol.kind === "stock",
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
    const previousClose = toNumber(payload?.pc);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw createProviderFailure({
        providerId: "finnhub",
        reason: "no-data",
        message: "Finnhub returned empty quote",
        retriable: false
      });
    }

    const timestamp = typeof payload?.t === "number" || typeof payload?.t === "string" ? payload.t : null;
    const buildChange = (price: number, previous: number | null) => {
      if (previous == null || !Number.isFinite(previous) || previous <= 0) {
        return { previousClose: null, change: null, changePercent: null };
      }
      const change = price - previous;
      return {
        previousClose: previous,
        change,
        changePercent: (change / previous) * 100
      };
    };

    if (symbol.providerSymbols.finnhub?.endsWith(".JK")) {
      const change = buildChange(
        currentPrice,
        Number.isFinite(previousClose) && previousClose > 0 ? previousClose : null
      );
      return {
        price: currentPrice,
        ...change,
        providerId: "finnhub",
        source: "Finnhub",
        asOf: toIsoTimestamp(timestamp)
      };
    }

    const converted = await convertUsdToIdr(currentPrice, "finnhub", timestamp);
    const conversionRate = converted.price / currentPrice;
    const convertedPreviousClose =
      Number.isFinite(previousClose) && previousClose > 0 ? previousClose * conversionRate : null;
    const change = buildChange(converted.price, convertedPreviousClose);
    return {
      price: converted.price,
      ...change,
      providerId: "finnhub",
      source: "Finnhub + exchangerate.host",
      asOf: converted.asOf
    };
  }
};
