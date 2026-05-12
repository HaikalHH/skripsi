import type { NewsArticle } from "@/lib/services/market/news/news.types";
import { FinanceNewsError } from "@/lib/services/market/news/news.types";
import { buildNewsProviderLabel } from "@/lib/services/market/news/news-utils";

export const buildSingleArticleDigestText = (params: {
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
          { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }
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

export const buildFinanceNewsFailureReply = (error: unknown) => {
  if (error instanceof FinanceNewsError && error.code === "NO_RELEVANT_NEWS") {
    return "Belum ada artikel yang cukup relevan dengan holdings Anda saat ini.";
  }

  return "Maaf, layanan market sedang gangguan. Coba lagi dalam beberapa menit.";
};
