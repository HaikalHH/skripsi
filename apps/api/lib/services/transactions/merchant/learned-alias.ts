import { prisma } from "@/lib/prisma";
import { normalizeSpaces } from "../helpers/text";
import { ALIAS_TEXT_STOPWORDS } from "./aliases";
import { normalizeDetectedMerchant } from "./normalization";

const sanitizeAliasText = (value: string | null | undefined) => {
  if (!value) return null;

  const normalized = normalizeSpaces(
    value
      .toLowerCase()
      .replace(/(?:rp\.?\s*)?\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?/gi, " ")
      .replace(/[|/_,()+.-]+/g, " ")
      .replace(/\b(?:tanggal|tgl|jan|feb|mar|apr|mei|jun|jul|agu|agt|aug|sep|sept|okt|oct|nov|des|dec)\b/gi, " ")
  )
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !ALIAS_TEXT_STOPWORDS.has(token))
    .join(" ");

  return normalized || null;
};

const extractAliasCandidates = (params: { merchant?: string | null; rawText?: string | null }) => {
  const candidates = new Set<string>();
  const merchantAlias = sanitizeAliasText(params.merchant ?? null);
  const rawAlias = sanitizeAliasText(params.rawText ?? null);

  if (merchantAlias) candidates.add(merchantAlias);
  if (rawAlias) candidates.add(rawAlias);

  return Array.from(candidates);
};

const computeAliasSimilarity = (left: string, right: string) => {
  if (left === right) return 100;
  if (left.replace(/\s+/g, "") === right.replace(/\s+/g, "")) return 90;
  if (left.includes(right) || right.includes(left)) return 70;

  const leftTokens = new Set(left.split(/\s+/));
  const rightTokens = new Set(right.split(/\s+/));
  const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  if (!intersection) return 0;

  const score = Math.round((intersection / Math.max(leftTokens.size, rightTokens.size)) * 60);
  return score >= 30 ? score : 0;
};

export const findLearnedMerchantAlias = async (params: {
  userId: string;
  merchant?: string | null;
  rawText?: string | null;
}) => {
  const currentCandidates = extractAliasCandidates(params);
  if (!currentCandidates.length) return null;

  const rows = await prisma.transaction.findMany({
    where: {
      userId: params.userId,
      merchant: {
        not: null
      }
    },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 200
  });

  const merchantScores = new Map<string, number>();
  for (const row of rows) {
    if (!row.merchant) continue;
    const historicalCandidates = extractAliasCandidates({
      merchant: row.merchant,
      rawText: row.rawText
    });
    if (!historicalCandidates.length) continue;

    const bestScore = Math.max(
      ...currentCandidates.flatMap((currentAlias) =>
        historicalCandidates.map((historicalAlias) => computeAliasSimilarity(currentAlias, historicalAlias))
      )
    );
    if (bestScore <= 0) continue;

    merchantScores.set(row.merchant, Math.max(merchantScores.get(row.merchant) ?? 0, bestScore));
  }

  const ranked = Array.from(merchantScores.entries()).sort((left, right) => right[1] - left[1]);
  if (!ranked.length) return null;

  const [top, second] = ranked;
  if (top[1] < 70) return null;
  if (second && top[1] < second[1] + 15) return null;

  return top[0];
};

export const resolveMerchantNameForUser = async (params: {
  userId: string;
  merchant?: string | null;
  rawText?: string | null;
}) => {
  const normalized = normalizeDetectedMerchant(params);
  if (normalized) return normalized;

  return findLearnedMerchantAlias(params);
};
