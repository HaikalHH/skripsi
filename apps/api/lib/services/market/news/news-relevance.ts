import type { NewsArticle } from "@/lib/services/market/news/news.types";
import type {
  PortfolioNewsContextItem
} from "@/lib/services/market/portfolio/portfolio-news-context";
import { uniq } from "@/lib/services/market/news/news-utils";

export const buildPortfolioQuery = (portfolioContext: PortfolioNewsContextItem[]) =>
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

  if (matchedAssets.length > 1) score += 0.1;
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
