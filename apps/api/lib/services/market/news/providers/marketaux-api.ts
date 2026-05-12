import { env } from "@/lib/env";
import { FinanceNewsError, type NewsProvider } from "@/lib/services/market/news/news.types";
import { requestNewsResource } from "@/lib/services/market/news/news-provider-client";
import { normalizeMarketauxArticle } from "@/lib/services/market/news/news-normalization";
import { toRecord } from "@/lib/services/market/news/news-utils";

export const marketauxProvider: NewsProvider = {
  id: "marketaux",
  enabled: env.MARKETAUX_API_TOKEN.length > 0,
  fetchNews: async (request) => {
    const payload = toRecord(
      await requestNewsResource({
        providerId: "marketaux",
        url: `https://api.marketaux.com/v1/news/all?language=en&filter_entities=true&limit=${request.limit}&search=${encodeURIComponent(
          request.searchQuery
        )}&api_token=${encodeURIComponent(env.MARKETAUX_API_TOKEN)}`
      })
    );
    const data = Array.isArray(payload?.data) ? payload.data : [];
    const articles = data.map(normalizeMarketauxArticle).filter((article) => article.title && article.link);
    if (!articles.length) {
      throw new FinanceNewsError({
        code: "NO_RELEVANT_NEWS",
        message: "Marketaux returned no articles"
      });
    }

    return articles;
  }
};
