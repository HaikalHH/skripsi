import type { NewsArticle, RawRssItem } from "@/lib/services/market/news/news.types";
import {
  getTagValue,
  normalizeWhitespace,
  toIsoTimestamp,
  toRecord,
  uniq
} from "@/lib/services/market/news/news-utils";

export const parseRssItems = (xml: string): RawRssItem[] => {
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

export const buildImpactHint = (article: Pick<NewsArticle, "title" | "summary">) => {
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
  return match
    ? { title: match[1].trim(), source: match[2].trim() }
    : { title, source: "Google News" };
};

const normalizeEntitySymbol = (entity: unknown) => {
  const record = toRecord(entity);
  const symbol = record?.symbol ?? record?.name ?? "";
  return String(symbol).toUpperCase().trim();
};

export const normalizeMarketauxArticle = (article: unknown): NewsArticle => {
  const record = toRecord(article);
  const title = String(record?.title ?? "");
  const description = record?.description ? String(record.description) : null;

  return {
    id: String(record?.uuid ?? record?.url ?? record?.title ?? crypto.randomUUID()),
    title: normalizeWhitespace(title.trim()),
    link: String(record?.url ?? ""),
    source: String(record?.source ?? record?.source_name ?? "Marketaux"),
    publishedAt: toIsoTimestamp(
      typeof record?.published_at === "string" || typeof record?.published_at === "number"
        ? record.published_at
        : typeof record?.publishedAt === "string" || typeof record?.publishedAt === "number"
          ? record.publishedAt
          : null
    ),
    summary: description ? normalizeWhitespace(description) : null,
    symbols: uniq(Array.isArray(record?.entities) ? record.entities.map(normalizeEntitySymbol).filter(Boolean) : []),
    providerId: "marketaux",
    matchedSymbols: [],
    relevanceScore: 0,
    impactHint: buildImpactHint({ title, summary: description })
  };
};

export const normalizeRssArticle = (item: RawRssItem): NewsArticle => {
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
    impactHint: buildImpactHint({ title: item.title, summary: item.summary })
  };
};
