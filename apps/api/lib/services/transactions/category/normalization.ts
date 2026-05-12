import { normalizeSpaces } from "../helpers/text";
import { INCOME_CATEGORY_ALIASES } from "./aliases";
import { detectExpenseBucketCategory, normalizeExpenseBucketCategory } from "./bucket-detection";
import { matchIncomeAliasCategory } from "./income-category";

export const normalizeForcedCategory = (raw: string) => normalizeExpenseBucketCategory(raw);

export const normalizeTransactionCategory = (params: {
  type: "INCOME" | "EXPENSE" | "SAVING";
  category: string;
  merchant?: string | null;
  rawText?: string | null;
}) => {
  if (params.type === "SAVING") {
    return "Tabungan";
  }

  const candidates = [params.category, params.merchant ?? "", params.rawText ?? ""].filter(Boolean);
  if (params.type === "EXPENSE") {
    for (const candidate of candidates) {
      const matched = detectExpenseBucketCategory(candidate);
      if (matched) return matched;
    }
    return "Others";
  }

  for (const candidate of candidates) {
    const matched = matchIncomeAliasCategory(candidate, INCOME_CATEGORY_ALIASES);
    if (matched) return matched;
  }

  if (params.type === "INCOME") {
    const normalized = normalizeSpaces(params.category);
    return normalized || "Other Income";
  }

  return "Other Income";
};
