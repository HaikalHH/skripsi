import type { NewsArticle } from "@/lib/services/market/news/news.types";

const LINK_RESOLVE_TIMEOUT_MS = 2_500;

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
      headers: { "User-Agent": "finance-bot/1.0" },
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

export const withResolvedArticleLink = async (article: NewsArticle) => ({
  ...article,
  link: await resolveCanonicalNewsLink(article.link)
});
