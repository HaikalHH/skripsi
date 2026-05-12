import type {
  MarketObservationReason
} from "@/lib/services/observability/market-observability-service";
import type {
  PortfolioNewsContextItem
} from "@/lib/services/market/portfolio/portfolio-news-context";

export type RawRssItem = {
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
  summary: string | null;
};

export type NewsProviderFailure = {
  providerId: string;
  reason: MarketObservationReason;
  message: string;
  retriable: boolean;
};

export type CachedNewsPayload = {
  articles: NewsArticle[];
  providerId: string;
  fallbackTrail: string[];
};

export type NewsProviderRequest = {
  searchQuery: string;
  portfolioContext: PortfolioNewsContextItem[];
  limit: number;
};

export type NewsProvider = {
  id: string;
  enabled: boolean;
  fetchNews: (request: NewsProviderRequest) => Promise<NewsArticle[]>;
};

export type NewsDeliveryPayload = {
  kind: "FINANCE_NEWS_DELIVERY";
  scope: "daily" | "portfolio";
  cacheKey: string;
  providerId: string;
  deliveryKey: string;
  articleId: string;
  title: string;
  source: string;
  link: string;
  deliveredAt: string;
};

export type NewsArticle = {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  summary: string | null;
  symbols: string[];
  providerId: string;
  matchedSymbols: string[];
  relevanceScore: number;
  impactHint: "bullish" | "bearish" | "neutral";
};

export class FinanceNewsError extends Error {
  code: "PROVIDER_UNAVAILABLE" | "NO_RELEVANT_NEWS";
  fallbackTrail: string[];

  constructor(params: {
    code: "PROVIDER_UNAVAILABLE" | "NO_RELEVANT_NEWS";
    message: string;
    fallbackTrail?: string[];
  }) {
    super(params.message);
    this.name = "FinanceNewsError";
    this.code = params.code;
    this.fallbackTrail = params.fallbackTrail ?? [];
  }
}
