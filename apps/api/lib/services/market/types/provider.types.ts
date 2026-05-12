import type {
  MarketObservationReason
} from "@/lib/services/observability/market-observability-service";
import type { NormalizedMarketSymbol } from "@/lib/services/market/types/symbol.types";

export type ProviderQuotePayload = {
  price: number;
  providerId: string;
  source: string;
  asOf: string;
};

export type ExchangeRatePayload = {
  rate: number;
  providerId: string;
  source: string;
  asOf: string;
};

export type CachedQuotePayload = ProviderQuotePayload & {
  normalized: NormalizedMarketSymbol;
};

export type QuoteProvider = {
  id: string;
  operation: "quote";
  enabled: boolean;
  supports: (symbol: NormalizedMarketSymbol) => boolean;
  fetchQuote: (symbol: NormalizedMarketSymbol) => Promise<ProviderQuotePayload>;
};

export type FxProvider = {
  id: string;
  operation: "fx";
  enabled: boolean;
  fetchRate: (baseCurrency: string, quoteCurrency: string) => Promise<ExchangeRatePayload>;
};

export type ProviderFailure = {
  providerId: string;
  reason: MarketObservationReason;
  message: string;
  retriable: boolean;
};
