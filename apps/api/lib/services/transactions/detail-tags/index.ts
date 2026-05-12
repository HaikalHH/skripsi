import { normalizeExpenseBucketCategory } from "../category";
import { normalizeSpaces, titleCase } from "../helpers/text";
import { normalizeDetectedMerchant, normalizeMerchantName } from "../merchant";
import { buildCandidateText, buildFallbackTag } from "./fallback-tag";
import { DETAIL_TAG_RULES } from "./rules";

export const inferTransactionDetailTag = (params: {
  type: "INCOME" | "EXPENSE" | "SAVING";
  category?: string | null;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
}) => {
  const merchant = normalizeMerchantName(params.merchant ?? null);
  if (params.type === "SAVING") {
    return null;
  }

  if (params.type === "INCOME") {
    return merchant ?? (params.category ? titleCase(normalizeSpaces(params.category)) : null);
  }

  const bucket = normalizeExpenseBucketCategory(params.category ?? params.rawText ?? params.merchant ?? "Others");
  const candidateText = buildCandidateText(params);
  const canonicalMerchant = normalizeDetectedMerchant({
    merchant: params.merchant ?? null,
    rawText: [params.note ?? "", params.rawText ?? ""].filter(Boolean).join(" ")
  });

  for (const rule of DETAIL_TAG_RULES) {
    if (rule.bucket !== bucket) continue;
    if (rule.patterns.some((pattern) => pattern.test(candidateText))) {
      return rule.tag;
    }
  }

  if (canonicalMerchant) {
    return canonicalMerchant;
  }

  return buildFallbackTag(params.note ?? params.rawText ?? "");
};

export const buildTransactionDetailLabel = (params: {
  detailTag?: string | null;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
}) =>
  (() => {
    const normalizedMerchant =
      normalizeDetectedMerchant({
        merchant: params.merchant ?? null,
        rawText: [params.note ?? "", params.rawText ?? ""].filter(Boolean).join(" ")
      }) ?? params.merchant;
    if (
      normalizedMerchant &&
      params.detailTag &&
      normalizedMerchant.toLowerCase() !== params.detailTag.toLowerCase()
    ) {
      return normalizedMerchant;
    }

    return params.detailTag ?? normalizedMerchant;
  })() ??
  params.note ??
  params.rawText ??
  "Tanpa keterangan";
