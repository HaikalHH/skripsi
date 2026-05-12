import { normalizeSpaces } from "../helpers/text";
import { normalizeForcedCategory } from "./normalization";
import type { CategoryOverrideResult } from "./types";

export const extractForcedCategory = (rawText: string): CategoryOverrideResult => {
  const text = normalizeSpaces(rawText);
  const match = text.match(/\b(?:kategori|category)\s+([a-z0-9/& -]{2,40})$/i);
  if (!match) {
    return { cleanedText: text, forcedCategory: null };
  }

  const forcedCategory = normalizeForcedCategory(match[1]);
  const cleanedText = normalizeSpaces(text.slice(0, match.index ?? text.length));
  return {
    cleanedText: cleanedText || text,
    forcedCategory
  };
};
