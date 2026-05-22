import { normalizeExpenseBucketCategory } from "../category";
import { normalizeSpaces } from "../helpers/text";

export const EXPENSE_PLAN_CATEGORY_LABELS: Record<string, string> = {
  food: "Food & Drink",
  transport: "Transport",
  bills: "Bills",
  entertainment: "Entertainment",
  others: "Others"
};

export const normalizeBudgetCategoryName = (raw: string) => {
  const normalized = normalizeSpaces(raw).replace(/^kategori\s+/i, "").trim();
  const mapped = EXPENSE_PLAN_CATEGORY_LABELS[normalized.toLowerCase()];
  if (mapped) return mapped;
  return normalized || "Others";
};

export const getBudgetCategoryLookupKey = (raw: string) =>
  normalizeBudgetCategoryName(raw).toLowerCase();

export const getBudgetCategoryBucket = (raw: string) =>
  normalizeExpenseBucketCategory(normalizeBudgetCategoryName(raw));
