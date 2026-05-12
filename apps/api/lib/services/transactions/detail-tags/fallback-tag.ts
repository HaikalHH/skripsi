import { normalizeSpaces, titleCase } from "../helpers/text";

export const buildCandidateText = (params: {
  category?: string | null;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
}) =>
  normalizeSpaces(
    [params.category ?? "", params.merchant ?? "", params.note ?? "", params.rawText ?? ""]
      .filter(Boolean)
      .join(" ")
  );

export const sanitizeFallbackTag = (value: string) =>
  normalizeSpaces(
    value
      .replace(/(?:rp\.?\s*)?\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?/gi, " ")
      .replace(/[|/_,()+.-]+/g, " ")
      .replace(/\b(?:bayar|beli|belanja|transfer|top up|topup|untuk|yang|bulan|minggu|hari|ini|tadi|kemarin)\b/gi, " ")
  );

export const buildFallbackTag = (value: string) => {
  const fallbackText = sanitizeFallbackTag(value);
  if (!fallbackText) return null;

  const firstMeaningfulChunk = fallbackText
    .split(/\s+/)
    .filter((part) => part.length >= 3)
    .slice(0, 3)
    .join(" ");

  return firstMeaningfulChunk ? titleCase(firstMeaningfulChunk) : null;
};
