export type MarketQuote = {
  symbol: string;
  label: string;
  price: number;
  currency: "IDR";
  source: string;
  providerId: string;
  asOf: string;
  cachedAt: string;
  status: "live" | "stale";
  fallbackTrail: string[];
};

export type MutualFundSelection = {
  symbol: string;
  displayName: string;
};

export class MarketDataError extends Error {
  code: "SYMBOL_NOT_FOUND" | "PROVIDER_UNAVAILABLE" | "NO_DATA";
  symbol: string;
  suggestions: string[];
  fallbackTrail: string[];
  staleTimestamp?: string | null;

  constructor(params: {
    code: "SYMBOL_NOT_FOUND" | "PROVIDER_UNAVAILABLE" | "NO_DATA";
    symbol: string;
    message: string;
    suggestions?: string[];
    fallbackTrail?: string[];
    staleTimestamp?: string | null;
  }) {
    super(params.message);
    this.name = "MarketDataError";
    this.code = params.code;
    this.symbol = params.symbol;
    this.suggestions = params.suggestions ?? [];
    this.fallbackTrail = params.fallbackTrail ?? [];
    this.staleTimestamp = params.staleTimestamp ?? null;
  }
}

export const isMarketDataError = (value: unknown): value is MarketDataError =>
  value instanceof MarketDataError;
