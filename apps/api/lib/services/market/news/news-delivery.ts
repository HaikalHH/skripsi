import { AnalysisType, OutboundMessageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { NewsArticle, NewsDeliveryPayload } from "@/lib/services/market/news/news.types";
import { normalizeWhitespace } from "@/lib/services/market/news/news-utils";
import {
  buildArticleDeliveryKey,
  buildDeliveryKey,
  deliveredArticleIdsByKey,
  getArticleDeliveryKeys,
  isNewsDeliveryPayload
} from "@/lib/services/market/news/news-delivery-keys";

export const resetFinanceNewsDeliveryMemory = () => {
  deliveredArticleIdsByKey.clear();
};

const loadPersistedDeliveredArticleKeys = async (params: {
  userId: string;
  scope: "daily" | "portfolio";
  cacheKey: string;
  providerId: string;
}) => {
  const deliveredKeys = new Set<string>();

  try {
    const rows = await prisma.aIAnalysisLog.findMany({
      where: { userId: params.userId, analysisType: AnalysisType.INSIGHT },
      orderBy: { createdAt: "desc" },
      take: 200
    });

    for (const row of rows) {
      const payload = row.payloadJson;
      if (
        !isNewsDeliveryPayload(payload) ||
        payload.scope !== params.scope ||
        payload.cacheKey !== params.cacheKey ||
        payload.providerId !== params.providerId
      ) {
        continue;
      }
      deliveredKeys.add(payload.deliveryKey);
      deliveredKeys.add(payload.articleId);
    }
  } catch {
    // Keep news delivery non-blocking if the analysis log table is unavailable.
  }

  return deliveredKeys;
};

const loadRecentNewsReplyTexts = async (userId: string) => {
  try {
    const rows = await prisma.outboundMessage.findMany({
      where: { userId, status: OutboundMessageStatus.SENT },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { messageText: true }
    });
    return rows
      .map((row) => normalizeWhitespace(row.messageText).toLowerCase())
      .filter((text) => /daily finance digest|news relevan|sumber berita/i.test(text));
  } catch {
    return [];
  }
};

const addLegacyReplyDeliveredKeys = (
  deliveredKeys: Set<string>,
  articles: NewsArticle[],
  recentReplyTexts: string[]
) => {
  if (!recentReplyTexts.length) return;
  for (const article of articles) {
    const title = normalizeWhitespace(article.title).toLowerCase();
    if (title.length < 12) continue;
    if (recentReplyTexts.some((replyText) => replyText.includes(title))) {
      for (const deliveryKey of getArticleDeliveryKeys(article)) deliveredKeys.add(deliveryKey);
    }
  }
};

const recordNewsArticleDelivery = async (params: {
  userId: string;
  scope: "daily" | "portfolio";
  cacheKey: string;
  providerId: string;
  article: NewsArticle;
}) => {
  const key = buildDeliveryKey(params);
  const deliveredArticleIds = deliveredArticleIdsByKey.get(key) ?? new Set<string>();
  for (const deliveryKey of getArticleDeliveryKeys(params.article)) deliveredArticleIds.add(deliveryKey);
  deliveredArticleIdsByKey.set(key, deliveredArticleIds);

  try {
    await prisma.aIAnalysisLog.create({
      data: {
        userId: params.userId,
        analysisType: AnalysisType.INSIGHT,
        payloadJson: {
          kind: "FINANCE_NEWS_DELIVERY",
          scope: params.scope,
          cacheKey: params.cacheKey,
          providerId: params.providerId,
          deliveryKey: buildArticleDeliveryKey(params.article),
          articleId: params.article.id,
          title: params.article.title,
          source: params.article.source,
          link: params.article.link,
          deliveredAt: new Date().toISOString()
        } satisfies NewsDeliveryPayload
      }
    });
  } catch {
    // The in-memory fallback above still prevents duplicate articles during this process lifetime.
  }
};

export const pickNextNewsArticle = async (params: {
  userId: string;
  scope: "daily" | "portfolio";
  cacheKey: string;
  providerId: string;
  articles: NewsArticle[];
}) => {
  if (!params.articles.length) return null;

  const key = buildDeliveryKey(params);
  const memoryDeliveredKeys = deliveredArticleIdsByKey.get(key) ?? new Set<string>();
  const persistedDeliveredKeys = await loadPersistedDeliveredArticleKeys(params);
  const recentReplyTexts = await loadRecentNewsReplyTexts(params.userId);
  const deliveredKeys = new Set([...memoryDeliveredKeys, ...persistedDeliveredKeys]);
  addLegacyReplyDeliveredKeys(deliveredKeys, params.articles, recentReplyTexts);
  const nextArticle =
    params.articles.find((article) =>
      getArticleDeliveryKeys(article).every((deliveryKey) => !deliveredKeys.has(deliveryKey))
    ) ?? params.articles[0];

  await recordNewsArticleDelivery({ ...params, article: nextArticle });
  return nextArticle;
};
