import { normalizeSpaces } from "../helpers/text";
import { extractSavingAmount } from "./amount";
import {
  SAVING_KEYWORD_PATTERN,
  SAVING_PLANNING_PATTERN,
  SAVING_PROJECTION_PATTERN,
  SAVING_TARGET_INTENT_PATTERN
} from "./patterns";

export const hasSavingKeyword = (rawText: string) => SAVING_KEYWORD_PATTERN.test(rawText);

export const isLikelySavingTransactionText = (rawText: string) => {
  const text = normalizeSpaces(rawText);
  if (!text || text.includes("?")) return false;
  if (!hasSavingKeyword(text)) return false;
  if (SAVING_PROJECTION_PATTERN.test(text)) return false;
  if (SAVING_TARGET_INTENT_PATTERN.test(text)) return false;
  if (SAVING_PLANNING_PATTERN.test(text)) return false;
  return Boolean(extractSavingAmount(text));
};
