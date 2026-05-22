import { normalizeExpenseBucketCategory } from "../category";
import { normalizeSpaces } from "../helpers/text";

export const normalizeBudgetCategoryName = (raw: string) => {
  const normalized = normalizeSpaces(raw).replace(/^kategori\s+/i, "").trim();
  return normalized || "Others";
};

export const getBudgetCategoryLookupKey = (raw: string) =>
  normalizeBudgetCategoryName(raw).toLowerCase();

export const getBudgetCategoryBucket = (raw: string) =>
  normalizeExpenseBucketCategory(normalizeBudgetCategoryName(raw));

