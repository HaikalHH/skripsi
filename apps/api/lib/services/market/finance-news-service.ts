import { AnalysisType, OutboundMessageStatus } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getPortfolioNewsContext, type PortfolioNewsContextItem } from "@/lib/services/market/portfolio-command-service";
import { loadWithMarketMemoryCache } from "@/lib/services/market/market-memory-cache";
import {
  recordMarketCacheOutcome,
  recordMarketFallback,
  recordMarketProviderError,
  recordMarketProviderLatency,
  recordMarketProviderSelection,
  type MarketObservationReason
} from "@/lib/services/observability/market-observability-service";

const DAILY_NEWS_PATTERN =
  /berita finance(?:\s+hari ini)?|finance update(?:\s+pagi ini)?|ringkas berita ekonomi|berita ekonomi(?:\s+hari ini)?|daily digest|update ekonomi|headline finance|news finance|berita(?:nya)?\s+(?:lagi|lainnya|berikutnya)|news\s+(?:lagi|lainnya|berikutnya)|artikel\s+(?:lagi|lainnya|berikutnya)/i;
const PORTFOLIO_NEWS_PATTERN =
  /berita tentang saham aku|news tentang aset aku|portfolio news|ada news penting tentang aset aku|berita aset aku|update buat portfolio aku|news portfolio/i;

const NEWS_TTL_MS = 15 * 60_000;
const REQUEST_TIMEOUT_MS = 4_500;
const LINK_RESOLVE_TIMEOUT_MS = 2_500;

type RawRssItem = {
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
  summary: string | null;
};

type NewsProviderFailure = {
  providerId: string;
  reason: MarketObservationReason;
  message: string;
  retriable: boolean;
};

type CachedNewsPayload = {
  articles: NewsArticle[];
  providerId: string;
  fallbackTrail: string[];
};

type NewsProviderRequest = {
  searchQuery: string;
  portfolioContext: PortfolioNewsContextItem[];
  limit: number;
};

type NewsProvider = {
  id: string;
  enabled: boolean;
  fetchNews: (request: NewsProviderRequest) => Promise<NewsArticle[]>;
};

type NewsDeliveryPayload = {
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

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const stripCdata = (value: string) => value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");

const getTagValue = (block: string, tag: string) => {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match) return "";
  return decodeHtml(stripCdata(match[1]).trim());
};

const toIsoTimestamp = (value?: string | number | null) => {
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(value > 1_000_000_000_000 ? value : value * 1000).toISOString();
  }

  return new Date().toISOString();
};

const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");
const uniq = <T>(values: T[]) => Array.from(new Set(values));

const buildNewsProviderLabel = (providerId: string) => {
  if (providerId === "marketaux") return "Marketaux";
  if (providerId === "rss_google_news") return "Google News RSS";
  return providerId;
};

const deliveredArticleIdsByKey = new Map<string, Set<string>>();

export const resetFinanceNewsDeliveryMemory = () => {
  deliveredArticleIdsByKey.clear();
};

const buildDeliveryKey = (params: {
  userId: string;
  scope: "daily" | "portfolio";
  cacheKey: string;
  providerId: string;
}) => `${params.userId}:${params.scope}:${params.cacheKey}:${params.providerId}`;

const buildArticleDeliveryKey = (article: NewsArticle) =>
  normalizeWhitespace(`${article.providerId}:${article.source}:${article.title}`).toLowerCase();

const getArticleDeliveryKeys = (article: NewsArticle) =>
  uniq([article.id, buildArticleDeliveryKey(article)].filter(Boolean));

const isNewsDeliveryPayload = (value: unknown): value is NewsDeliveryPayload =>
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

const loadPersistedDeliveredArticleKeys = async (params: {
  userId: string;
  scope: "daily" | "portfolio";
  cacheKey: string;
  providerId: string;
}) => {
  const deliveredKeys = new Set<string>();

  try {
    const rows = await prisma.aIAnalysisLog.findMany({
      where: {
        userId: params.userId,
        analysisType: AnalysisType.INSIGHT
      },
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
      where: {
        userId,
        status: OutboundMessageStatus.SENT
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        messageText: true
      }
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
      for (const deliveryKey of getArticleDeliveryKeys(article)) {
        deliveredKeys.add(deliveryKey);
      }
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
  for (const deliveryKey of getArticleDeliveryKeys(params.article)) {
    deliveredArticleIds.add(deliveryKey);
  }
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

const pickNextNewsArticle = async (params: {
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

  await recordNewsArticleDelivery({
    userId: params.userId,
    scope: params.scope,
    cacheKey: params.cacheKey,
    providerId: params.providerId,
    article: nextArticle
  });

  return nextArticle;
};

const isGoogleNewsLink = (value: string) => {
  try {
    return new URL(value).hostname.toLowerCase() === "news.google.com";
  } catch {
    return false;
  }
};

const getEmbeddedCanonicalUrl = (link: string) => {
  try {
    const parsed = new URL(link);
    const embeddedUrl = parsed.searchParams.get("url") ?? parsed.searchParams.get("u");
    if (!embeddedUrl) return null;

    const normalized = decodeURIComponent(embeddedUrl);
    return isGoogleNewsLink(normalized) ? null : normalized;
  } catch {
    return null;
  }
};

const resolveCanonicalNewsLink = async (link: string) => {
  const embeddedUrl = getEmbeddedCanonicalUrl(link);
  if (embeddedUrl) return embeddedUrl;

  if (!isGoogleNewsLink(link)) return link;

  try {
    const response = await fetch(link, {
      headers: {
        "User-Agent": "finance-bot/1.0"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(LINK_RESOLVE_TIMEOUT_MS)
    });

    if (response.url && response.url !== link && !isGoogleNewsLink(response.url)) {
      return response.url;
    }
  } catch {
    // Keep the original item URL when Google News does not expose a publisher redirect.
  }

  return link;
};

const withResolvedArticleLink = async (article: NewsArticle) => ({
  ...article,
  link: await resolveCanonicalNewsLink(article.link)
});

const splitRssTitleAndSource = (title: string, source: string) => {
  if (source.trim()) {
    const normalizedSource = source.trim();
    const sourceSuffix = ` - ${normalizedSource}`;

    return {
      title: title.toLowerCase().endsWith(sourceSuffix.toLowerCase())
        ? title.slice(0, -sourceSuffix.length).trim()
        : title,
      source: normalizedSource
    };
  }

  const match = title.match(/^(.*?)\s+-\s+([^-]+)$/);
  if (!match) {
    return {
      title,
      source: "Google News"
    };
  }

  return {
    title: match[1].trim(),
    source: match[2].trim()
  };
};

const createProviderFailure = (params: {
  providerId: string;
  reason: MarketObservationReason;
  message: string;
  retriable?: boolean;
}) =>
  ({
    providerId: params.providerId,
    reason: params.reason,
    message: params.message,
    retriable: params.retriable ?? params.reason !== "no-data"
  }) satisfies NewsProviderFailure;

const isProviderFailure = (value: unknown): value is NewsProviderFailure =>
  Boolean(
    value &&
      typeof value === "object" &&
      "providerId" in value &&
      "reason" in value &&
      "message" in value
  );

const requestNewsResource = async (params: {
  providerId: string;
  url: string;
  headers?: Record<string, string>;
  responseType?: "json" | "text";
}) => {
  const startedAt = Date.now();

  try {
    const response = await fetch(params.url, {
      headers: {
        "User-Agent": "finance-bot/1.0",
        ...(params.headers ?? {})
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    const latencyMs = Date.now() - startedAt;
    recordMarketProviderLatency({
      providerId: params.providerId,
      operation: "news",
      latencyMs
    });

    if (!response.ok) {
      const reason: MarketObservationReason =
        response.status === 429 ? "rate-limit" : response.status >= 500 ? "5xx" : "no-data";
      recordMarketProviderError({
        providerId: params.providerId,
        operation: "news",
        reason
      });

      throw createProviderFailure({
        providerId: params.providerId,
        reason,
        message: `${params.providerId} request failed with status ${response.status}`,
        retriable: reason !== "no-data"
      });
    }

    return params.responseType === "text" ? response.text() : response.json();
  } catch (error) {
    if (isProviderFailure(error)) {
      throw error;
    }

    const latencyMs = Date.now() - startedAt;
    recordMarketProviderLatency({
      providerId: params.providerId,
      operation: "news",
      latencyMs
    });

    const reason: MarketObservationReason =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        ? "timeout"
        : error instanceof Error && /timeout/i.test(error.message)
          ? "timeout"
          : "network";

    recordMarketProviderError({
      providerId: params.providerId,
      operation: "news",
      reason
    });

    throw createProviderFailure({
      providerId: params.providerId,
      reason,
      message: error instanceof Error ? error.message : "News provider request failed"
    });
  }
};

const classifyNewsFailure = (providerId: string, error: unknown): NewsProviderFailure => {
  if (isProviderFailure(error)) return error;

  if (error instanceof FinanceNewsError) {
    return createProviderFailure({
      providerId,
      reason: error.code === "NO_RELEVANT_NEWS" ? "no-data" : "network",
      message: error.message,
      retriable: error.code !== "NO_RELEVANT_NEWS"
    });
  }

  if (error instanceof Error) {
    return createProviderFailure({
      providerId,
      reason: /timeout/i.test(error.message) ? "timeout" : "network",
      message: error.message
    });
  }

  return createProviderFailure({
    providerId,
    reason: "network",
    message: "Unknown news provider failure"
  });
};

const parseRssItems = (xml: string): RawRssItem[] => {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  return blocks
    .map((block) => ({
      title: getTagValue(block, "title"),
      link: getTagValue(block, "link"),
      source: getTagValue(block, "source"),
      publishedAt: getTagValue(block, "pubDate") || null,
      summary: getTagValue(block, "description") || null
    }))
    .filter((item) => item.title && item.link);
};

const buildImpactHint = (article: Pick<NewsArticle, "title" | "summary">) => {
  const content = `${article.title} ${article.summary ?? ""}`.toLowerCase();

  if (
    /\b(beat|surge|rally|strong demand|record high|upgrade|buyback|dividend|approval|partnership)\b/i.test(
      content
    )
  ) {
    return "bullish" as const;
  }

  if (
    /\b(drop|fall|lawsuit|downgrade|loss|probe|fraud|default|miss|plunge|weak guidance)\b/i.test(
      content
    )
  ) {
    return "bearish" as const;
  }

  return "neutral" as const;
};

const normalizeMarketauxArticle = (article: any): NewsArticle => ({
  id: String(article?.uuid ?? article?.url ?? article?.title ?? crypto.randomUUID()),
  title: normalizeWhitespace(String(article?.title ?? "").trim()),
  link: String(article?.url ?? ""),
  source: String(article?.source ?? article?.source_name ?? "Marketaux"),
  publishedAt: toIsoTimestamp(article?.published_at ?? article?.publishedAt),
  summary: article?.description ? normalizeWhitespace(String(article.description)) : null,
  symbols: uniq(
    Array.isArray(article?.entities)
      ? article.entities
          .map((entity: any) => String(entity?.symbol ?? entity?.name ?? "").toUpperCase().trim())
          .filter(Boolean)
      : []
  ),
  providerId: "marketaux",
  matchedSymbols: [],
  relevanceScore: 0,
  impactHint: buildImpactHint({
    title: String(article?.title ?? ""),
    summary: article?.description ? String(article.description) : null
  })
});

const normalizeRssArticle = (item: RawRssItem): NewsArticle => {
  const parsed = splitRssTitleAndSource(normalizeWhitespace(item.title), item.source);

  return {
    id: item.link,
    title: parsed.title,
    link: item.link,
    source: parsed.source,
    publishedAt: toIsoTimestamp(item.publishedAt),
    summary: item.summary ? normalizeWhitespace(item.summary) : null,
    symbols: [],
    providerId: "rss_google_news",
    matchedSymbols: [],
    relevanceScore: 0,
    impactHint: buildImpactHint({
      title: item.title,
      summary: item.summary
    })
  };
};

const buildPortfolioQuery = (portfolioContext: PortfolioNewsContextItem[]) =>
  portfolioContext
    .slice(0, 5)
    .flatMap((item) => item.keywords.slice(0, 3))
    .join(" OR ");

const scoreArticleAgainstPortfolio = (
  article: NewsArticle,
  portfolioContext: PortfolioNewsContextItem[]
) => {
  const haystack = `${article.title} ${article.summary ?? ""} ${article.symbols.join(" ")}`.toLowerCase();
  const matchedAssets = portfolioContext.filter((asset) =>
    asset.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))
  );
  const matchedSymbols = uniq(matchedAssets.map((asset) => asset.normalizedSymbol));

  let score = 0;
  for (const asset of matchedAssets) {
    if (article.symbols.includes(asset.normalizedSymbol)) {
      score += 0.65;
      continue;
    }

    if (haystack.includes(asset.normalizedSymbol.toLowerCase())) {
      score += 0.55;
      continue;
    }

    score += 0.35;
  }

  if (matchedAssets.length > 1) {
    score += 0.1;
  }

  if (matchedAssets.length > 0 && article.providerId === "marketaux" && article.symbols.length > 0) {
    score += 0.1;
  }

  return {
    ...article,
    matchedSymbols,
    relevanceScore: Number(Math.min(1, score).toFixed(2))
  };
};

export const scorePersonalizedNewsArticles = (
  articles: NewsArticle[],
  portfolioContext: PortfolioNewsContextItem[]
) =>
  articles
    .map((article) => scoreArticleAgainstPortfolio(article, portfolioContext))
    .filter((article) => article.relevanceScore > 0)
    .sort(
      (left, right) =>
        right.relevanceScore - left.relevanceScore ||
        right.publishedAt.localeCompare(left.publishedAt)
    );

const buildSingleArticleDigestText = (params: {
  title: string;
  article: NewsArticle | null;
  isStale: boolean;
  cachedAt: string;
  personalized: boolean;
  providerId: string;
}) => {
  if (!params.article) {
    return params.personalized
      ? "Belum ada artikel yang cukup relevan dengan holdings Anda saat ini."
      : "Belum ada headline relevan yang berhasil diambil saat ini.";
  }

  const providerLabel = buildNewsProviderLabel(params.providerId);
  const relevanceLine =
    params.personalized && params.article.matchedSymbols.length
      ? `Relevansi: ${params.article.matchedSymbols.join(", ")} | score ${params.article.relevanceScore.toFixed(2)} | ${params.article.impactHint}`
      : null;

  return [
    params.isStale
      ? `Berita real-time sedang tidak tersedia, menampilkan artikel terakhir dari ${new Intl.DateTimeFormat(
          "id-ID",
          {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Jakarta"
          }
        ).format(new Date(params.cachedAt))}.`
      : params.title,
    params.isStale ? `Sumber berita terakhir: ${providerLabel}` : `Sumber berita: ${providerLabel}`,
    ...(params.isStale ? [params.title] : []),
    "",
    `1. ${params.article.title}`,
    `Sumber: ${params.article.source}`,
    `Link: ${params.article.link}`,
    relevanceLine
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
};

const marketauxProvider: NewsProvider = {
  id: "marketaux",
  enabled: env.MARKETAUX_API_TOKEN.length > 0,
  fetchNews: async (request) => {
    const payload = (await requestNewsResource({
      providerId: "marketaux",
      url: `https://api.marketaux.com/v1/news/all?language=en&filter_entities=true&limit=${request.limit}&search=${encodeURIComponent(
        request.searchQuery
      )}&api_token=${encodeURIComponent(env.MARKETAUX_API_TOKEN)}`
    })) as { data?: any[] };

    const articles = (payload.data ?? []).map(normalizeMarketauxArticle).filter((article) => article.title && article.link);
    if (!articles.length) {
      throw new FinanceNewsError({
        code: "NO_RELEVANT_NEWS",
        message: "Marketaux returned no articles"
      });
    }

    return articles;
  }
};

const rssFallbackProvider: NewsProvider = {
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

const runNewsProviderChain = async (request: NewsProviderRequest) => {
  const failures: NewsProviderFailure[] = [];

  for (const provider of [marketauxProvider, rssFallbackProvider]) {
    if (!provider.enabled) {
      const failure = createProviderFailure({
        providerId: provider.id,
        reason: "no-key",
        message: `${provider.id} disabled because API key is missing`
      });
      failures.push(failure);
      recordMarketFallback({
        providerId: provider.id,
        operation: "news",
        reason: failure.reason
      });
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
      recordMarketFallback({
        providerId: provider.id,
        operation: "news",
        reason: failure.reason
      });
    }
  }

  throw failures;
};

const shouldUseStaleNews = (error: unknown) =>
  Array.isArray(error) && error.every((failure) => (failure as NewsProviderFailure).retriable);

const getCachedNewsArticles = async (params: {
  cacheKey: string;
  title: string;
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
      articles: cached.value.articles,
      providerId: cached.value.providerId,
      fallbackTrail: cached.value.fallbackTrail,
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

export const buildFinanceNewsFailureReply = (error: unknown) => {
  if (error instanceof FinanceNewsError && error.code === "NO_RELEVANT_NEWS") {
    return "Belum ada artikel yang cukup relevan dengan holdings Anda saat ini.";
  }

  return "Maaf, layanan market sedang gangguan. Coba lagi dalam beberapa menit.";
};

export const tryHandleFinanceNewsCommand = async (params: { userId: string; text: string }) => {
  const text = params.text.trim();

  if (DAILY_NEWS_PATTERN.test(text)) {
    const cacheKey = "news:daily:finance";
    const result = await getCachedNewsArticles({
      cacheKey,
      title: "Daily finance digest:",
      request: {
        searchQuery: "finance OR ekonomi OR pasar saham OR bank sentral OR rupiah",
        portfolioContext: [],
        limit: 7
      },
      personalized: false
    });
    const selectedArticle = await pickNextNewsArticle({
      userId: params.userId,
      scope: "daily",
      cacheKey,
      providerId: result.providerId,
      articles: result.articles
    });
    const article = selectedArticle ? await withResolvedArticleLink(selectedArticle) : null;

    return {
      handled: true as const,
      replyText: buildSingleArticleDigestText({
        title: "Daily finance digest:",
        article,
        isStale: result.isStale,
        cachedAt: result.cachedAt,
        personalized: false,
        providerId: result.providerId
      })
    };
  }

  if (PORTFOLIO_NEWS_PATTERN.test(text)) {
    const portfolioContext = await getPortfolioNewsContext(params.userId);
    if (!portfolioContext.length) {
      return {
        handled: true as const,
        replyText:
          "Portfolio Anda masih kosong, jadi news personal belum bisa difilter. Tambahkan aset dulu dengan format `Tambah saham BBCA 10 lot harga 9000`."
      };
    }

    const portfolioSymbols = portfolioContext.map((item) => item.normalizedSymbol);
    const cacheKey = `news:portfolio:${params.userId}:${portfolioSymbols.join(",")}`;
    const title = `News relevan untuk aset Anda (${portfolioSymbols.join(", ")}):`;
    const result = await getCachedNewsArticles({
      cacheKey,
      title,
      request: {
        searchQuery: buildPortfolioQuery(portfolioContext),
        portfolioContext,
        limit: 7
      },
      personalized: true
    });
    const selectedArticle = await pickNextNewsArticle({
      userId: params.userId,
      scope: "portfolio",
      cacheKey,
      providerId: result.providerId,
      articles: result.articles
    });
    const article = selectedArticle ? await withResolvedArticleLink(selectedArticle) : null;

    return {
      handled: true as const,
      replyText: buildSingleArticleDigestText({
        title,
        article,
        isStale: result.isStale,
        cachedAt: result.cachedAt,
        personalized: true,
        providerId: result.providerId
      })
    };
  }

  return { handled: false as const };
};
