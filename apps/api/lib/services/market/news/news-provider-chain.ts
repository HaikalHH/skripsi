import {
  recordMarketFallback
} from "@/lib/services/observability/market-observability-service";
import {
  FinanceNewsError,
  type NewsProviderFailure,
  type NewsProviderRequest
} from "@/lib/services/market/news/news.types";
import { classifyNewsFailure, createNewsProviderFailure } from "@/lib/services/market/news/news-provider-client";
import { scorePersonalizedNewsArticles } from "@/lib/services/market/news/news-relevance";
import { rssFallbackProvider } from "@/lib/services/market/news/providers/google-news-rss";
import { marketauxProvider } from "@/lib/services/market/news/providers/marketaux-api";

export const runNewsProviderChain = async (request: NewsProviderRequest) => {
  const failures: NewsProviderFailure[] = [];

  for (const provider of [marketauxProvider, rssFallbackProvider]) {
    if (!provider.enabled) {
      const failure = createNewsProviderFailure({
        providerId: provider.id,
        reason: "no-key",
        message: `${provider.id} disabled because API key is missing`
      });
      failures.push(failure);
      recordMarketFallback({ providerId: provider.id, operation: "news", reason: failure.reason });
      continue;
    }

    try {
      const providerArticles = await provider.fetchNews(request);
      const articles = request.portfolioContext.length
        ? scorePersonalizedNewsArticles(providerArticles, request.portfolioContext).slice(0, request.limit)
        : providerArticles.slice(0, request.limit);

      if (request.portfolioContext.length && !articles.length) {
        throw new FinanceNewsError({
          code: "NO_RELEVANT_NEWS",
          message: `${provider.id} returned no articles relevant to the portfolio`
        });
      }

      return { articles, providerId: provider.id, failures };
    } catch (error) {
      const failure = classifyNewsFailure(provider.id, error);
      failures.push(failure);
      recordMarketFallback({ providerId: provider.id, operation: "news", reason: failure.reason });
    }
  }

  throw failures;
};
