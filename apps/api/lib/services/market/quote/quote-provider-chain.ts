import type {
  MarketAssetKind,
  NormalizedMarketSymbol
} from "@/lib/services/market/types/symbol.types";
import type { QuoteProvider } from "@/lib/services/market/types/provider.types";
import { runProviderChain } from "@/lib/services/market/providers/shared/provider-chain";
import { goldApiQuoteProvider } from "@/lib/services/market/providers/gold/goldapi";
import { yahooGoldQuoteProvider } from "@/lib/services/market/providers/gold/yahoo-gold";
import { finnhubStockQuoteProvider } from "@/lib/services/market/providers/stock/finnhub-stock";
import { yahooStockQuoteProvider } from "@/lib/services/market/providers/stock/yahoo-stock";

const quoteProvidersByKind: Record<MarketAssetKind, QuoteProvider[]> = {
  stock: [finnhubStockQuoteProvider, yahooStockQuoteProvider],
  gold: [goldApiQuoteProvider, yahooGoldQuoteProvider]
};

export const getQuoteFromProviders = async (normalized: NormalizedMarketSymbol) => {
  const providers = quoteProvidersByKind[normalized.kind].filter((provider) =>
    provider.supports(normalized)
  );
  const { result, failures } = await runProviderChain({
    providers,
    operation: "quote",
    execute: (provider) => (provider as QuoteProvider).fetchQuote(normalized)
  });

  return { result, failures };
};
