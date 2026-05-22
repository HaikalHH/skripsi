import type { QuoteProvider } from "@/lib/services/market/types/provider.types";
import { requestProviderResource } from "@/lib/services/market/providers/shared/request";
import {
  readYahooPreviousClose,
  readYahooRegularPrice,
  readYahooTimestamp,
  toIsoTimestamp
} from "@/lib/services/market/providers/shared/value-parsing";
import { convertUsdToIdr } from "@/lib/services/market/providers/shared/currency-conversion";
import { createProviderFailure } from "@/lib/services/market/providers/shared/provider-failure";

export const yahooStockQuoteProvider: QuoteProvider = {
  id: "yahoo_finance",
  operation: "quote",
  enabled: true,
  supports: (symbol) => symbol.kind === "stock",
  fetchQuote: async (symbol) => {
    const providerSymbol = symbol.providerSymbols.yahoo ?? symbol.canonicalSymbol;
    const payload = await requestProviderResource({
      providerId: "yahoo_finance",
      operation: "quote",
      url: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        providerSymbol
      )}?interval=1d&range=5d`
    });
    const price = readYahooRegularPrice(payload);
    if (!price) {
      throw createProviderFailure({
        providerId: "yahoo_finance",
        reason: "no-data",
        message: "Yahoo Finance returned empty quote",
        retriable: false
      });
    }

    const timestamp = readYahooTimestamp(payload);
    const previousClose = readYahooPreviousClose(payload, price);
    const buildChange = (currentPrice: number, previous: number | null) => {
      if (previous == null || !Number.isFinite(previous) || previous <= 0) {
        return { previousClose: null, change: null, changePercent: null };
      }
      const change = currentPrice - previous;
      return {
        previousClose: previous,
        change,
        changePercent: (change / previous) * 100
      };
    };

    if (providerSymbol.endsWith(".JK")) {
      const change = buildChange(price, previousClose);
      return {
        price,
        ...change,
        providerId: "yahoo_finance",
        source: "https://finance.yahoo.com/",
        asOf: toIsoTimestamp(timestamp)
      };
    }

    const converted = await convertUsdToIdr(price, "yahoo_finance", timestamp);
    const conversionRate = converted.price / price;
    const convertedPreviousClose = previousClose != null ? previousClose * conversionRate : null;
    const change = buildChange(converted.price, convertedPreviousClose);
    return {
      price: converted.price,
      ...change,
      providerId: "yahoo_finance",
      source: "Yahoo Finance + ER-API",
      asOf: converted.asOf
    };
  }
};
