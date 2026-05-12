import { FinanceNewsError, type NewsProvider } from "@/lib/services/market/news/news.types";
import { requestNewsResource } from "@/lib/services/market/news/news-provider-client";
import {
  normalizeRssArticle,
  parseRssItems
} from "@/lib/services/market/news/news-normalization";

export const rssFallbackProvider: NewsProvider = {
  id: "rss_google_news",
  enabled: true,
  fetchNews: async (request) => {
    const xml = (await requestNewsResource({
      providerId: "rss_google_news",
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(
        request.searchQuery
      )}&hl=id&gl=ID&ceid=ID:id`,
      responseType: "text"
    })) as string;
    const articles = parseRssItems(xml).slice(0, request.limit).map(normalizeRssArticle);
    if (!articles.length) {
      throw new FinanceNewsError({
        code: "NO_RELEVANT_NEWS",
        message: "RSS fallback returned no articles"
      });
    }

    return articles;
  }
};
