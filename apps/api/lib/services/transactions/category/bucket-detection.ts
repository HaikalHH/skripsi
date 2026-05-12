import { normalizeSpaces } from "../helpers/text";
import { EXPENSE_BUCKET_ALIASES } from "./aliases";
import type { ExpenseBucketMatch } from "./types";

const getAliasPosition = (value: string, alias: string) => {
  const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\b)${escapedAlias}(?:\\b|$)`, "i").exec(value);
  return match?.index ?? -1;
};

export const detectExpenseBucketMatches = (raw: string): ExpenseBucketMatch[] => {
  const normalized = normalizeSpaces(raw).toLowerCase();
  if (!normalized) return [];

  return EXPENSE_BUCKET_ALIASES.map(([alias, bucket]) => ({
    alias,
    bucket,
    index: getAliasPosition(normalized, alias)
  }))
    .filter((match) => match.index >= 0)
    .sort((left, right) => {
      if (left.index !== right.index) return left.index - right.index;
      return right.alias.length - left.alias.length;
    });
};

export const detectExpenseBucketCategory = (raw: string) => {
  const matches = detectExpenseBucketMatches(raw);
  return matches[0]?.bucket ?? null;
};

export const normalizeExpenseBucketCategory = (raw: string) =>
  detectExpenseBucketCategory(raw) ?? "Others";
