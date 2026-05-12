import { loadWithMarketMemoryCache } from "@/lib/services/market/cache/market-memory-cache";
import { getPortfolioNewsContext } from "@/lib/services/market/commands";
import {
  recordMarketCacheOutcome,
  recordMarketProviderSelection
} from "@/lib/services/observability/market-observability-service";
import {
  FinanceNewsError,
  type CachedNewsPayload,
  type NewsProviderFailure,
  type NewsProviderRequest
} from "@/lib/services/market/news/news.types";
import {
  buildFinanceNewsFailureReply,
  buildSingleArticleDigestText
} from "@/lib/services/market/news/news-digest-builder";
import { pickNextNewsArticle } from "@/lib/services/market/news/news-delivery";
import { withResolvedArticleLink } from "@/lib/services/market/news/news-link-resolution";
import { parseFinanceNewsCommandScope } from "@/lib/services/market/news/news-command-parser";
import { runNewsProviderChain } from "@/lib/services/market/news/news-provider-chain";
import { buildPortfolioQuery } from "@/lib/services/market/news/news-relevance";

export { buildFinanceNewsFailureReply };
export { resetFinanceNewsDeliveryMemory } from "@/lib/services/market/news/news-delivery";
export { scorePersonalizedNewsArticles } from "@/lib/services/market/news/news-relevance";
export * from "@/lib/services/market/news/news.types";
const NEWS_TTL_MS = 15 * 60_000;

const shouldUseStaleNews = (error: unknown) =>
  Array.isArray(error) && error.every((failure) => (failure as NewsProviderFailure).retriable);

const getCachedNewsArticles = async (params: {
  cacheKey: string;
  request: NewsProviderRequest;
  personalized: boolean;
}) => {
  try {
    const cached = await loadWithMarketMemoryCache<CachedNewsPayload>({
      key: params.cacheKey,
      ttlMs: NEWS_TTL_MS,
      shouldUseStaleOnError: shouldUseStaleNews,
      load: async () => {
        const { articles, providerId, failures } = await runNewsProviderChain(params.request);
        return {
          articles,
          providerId,
          fallbackTrail: failures.map((failure) => `${failure.providerId}:${failure.reason}`)
        };
      }
    });

    recordMarketCacheOutcome(
      cached.state === "fresh" ? "hit" : cached.state === "stale" ? "stale" : "miss",
      params.cacheKey
    );
    recordMarketProviderSelection({
      providerId: cached.value.providerId,
      operation: "news",
      cacheState: cached.state === "stale" ? "stale" : "live"
    });

    return {
      ...cached.value,
      isStale: cached.state === "stale",
      cachedAt: new Date(cached.cachedAt).toISOString()
    };
  } catch (error) {
    const failures = Array.isArray(error) ? (error as NewsProviderFailure[]) : [];
    const allNoData = failures.length > 0 && failures.every((failure) => failure.reason === "no-data");
    throw new FinanceNewsError({
      code: allNoData && params.personalized ? "NO_RELEVANT_NEWS" : "PROVIDER_UNAVAILABLE",
      message:
        allNoData && params.personalized
          ? "Belum ada artikel yang cukup relevan dengan holdings Anda saat ini."
          : "Layanan berita market sedang gangguan.",
      fallbackTrail: failures.map((failure) => `${failure.providerId}:${failure.reason}`)
    });
  }
};

export const tryHandleFinanceNewsCommand = async (params: { userId: string; text: string }) => {
  const scope = parseFinanceNewsCommandScope(params.text.trim());
  if (scope === "daily") return handleDailyNewsCommand(params.userId);
  if (scope === "portfolio") return handlePortfolioNewsCommand(params.userId);
  return { handled: false as const };
};

const buildReply = async (params: {
  userId: string;
  scope: "daily" | "portfolio";
  cacheKey: string;
  title: string;
  result: Awaited<ReturnType<typeof getCachedNewsArticles>>;
  personalized: boolean;
}) => {
  const selectedArticle = await pickNextNewsArticle({
    userId: params.userId,
    scope: params.scope,
    cacheKey: params.cacheKey,
    providerId: params.result.providerId,
    articles: params.result.articles
  });
  const article = selectedArticle ? await withResolvedArticleLink(selectedArticle) : null;
  return {
    handled: true as const,
    replyText: buildSingleArticleDigestText({
      title: params.title,
      article,
      isStale: params.result.isStale,
      cachedAt: params.result.cachedAt,
      personalized: params.personalized,
      providerId: params.result.providerId
    })
  };
};

const handleDailyNewsCommand = async (userId: string) => {
  const cacheKey = "news:daily:finance";
  const result = await getCachedNewsArticles({
    cacheKey,
    request: {
      searchQuery: "finance OR ekonomi OR pasar saham OR bank sentral OR rupiah",
      portfolioContext: [],
      limit: 7
    },
    personalized: false
  });
  return buildReply({ userId, scope: "daily", cacheKey, title: "Daily finance digest:", result, personalized: false });
};

const handlePortfolioNewsCommand = async (userId: string) => {
  const portfolioContext = await getPortfolioNewsContext(userId);
  if (!portfolioContext.length) {
    return {
      handled: true as const,
      replyText:
        "Portfolio Anda masih kosong, jadi news personal belum bisa difilter. Tambahkan aset dulu dengan format `Tambah saham BBCA 10 lot harga 9000`."
    };
  }

  const portfolioSymbols = portfolioContext.map((item) => item.normalizedSymbol);
  const cacheKey = `news:portfolio:${userId}:${portfolioSymbols.join(",")}`;
  const title = `News relevan untuk aset Anda (${portfolioSymbols.join(", ")}):`;
  const result = await getCachedNewsArticles({
    cacheKey,
    request: { searchQuery: buildPortfolioQuery(portfolioContext), portfolioContext, limit: 7 },
    personalized: true
  });
  return buildReply({ userId, scope: "portfolio", cacheKey, title, result, personalized: true });
};
