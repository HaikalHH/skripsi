import type { NewsArticle, NewsDeliveryPayload } from "@/lib/services/market/news/news.types";
import { normalizeWhitespace, uniq } from "@/lib/services/market/news/news-utils";

export const deliveredArticleIdsByKey = new Map<string, Set<string>>();

export const buildDeliveryKey = (params: {
  userId: string;
  scope: "daily" | "portfolio";
  cacheKey: string;
  providerId: string;
}) => `${params.userId}:${params.scope}:${params.cacheKey}:${params.providerId}`;

export const buildArticleDeliveryKey = (article: NewsArticle) =>
  normalizeWhitespace(`${article.providerId}:${article.source}:${article.title}`).toLowerCase();

export const getArticleDeliveryKeys = (article: NewsArticle) =>
  uniq([article.id, buildArticleDeliveryKey(article)].filter(Boolean));

export const isNewsDeliveryPayload = (value: unknown): value is NewsDeliveryPayload =>
  Boolean(
    value &&
      typeof value === "object" &&
      "kind" in value &&
      value.kind === "FINANCE_NEWS_DELIVERY" &&
      "scope" in value &&
      "cacheKey" in value &&
      "providerId" in value &&
      "deliveryKey" in value
  );
