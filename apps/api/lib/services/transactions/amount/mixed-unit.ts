import { DIGIT_WORDS, LARGE_UNIT_MULTIPLIERS } from "./constants";
import { isNumericToken, parseNumericChunk } from "./localized-number";

export const parseMixedUnitAmount = (normalized: string): number | null => {
  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) return null;

  let total = 0;
  let pendingValue: number | null = null;
  let usedAny = false;

  for (const token of tokens) {
    if (isNumericToken(token)) {
      if (pendingValue != null) {
        total += pendingValue;
        usedAny = true;
      }
      pendingValue = parseNumericChunk(token);
      if (pendingValue == null) return null;
      continue;
    }

    const multiplier = LARGE_UNIT_MULTIPLIERS[token];
    if (multiplier && pendingValue != null) {
      total += Math.round(pendingValue * multiplier);
      pendingValue = null;
      usedAny = true;
      continue;
    }

    if (DIGIT_WORDS[token] != null || token === "ratus" || token === "puluh" || token === "belas") {
      return null;
    }

    return null;
  }

  if (pendingValue != null) {
    total += pendingValue;
    usedAny = true;
  }

  return usedAny && total > 0 ? Math.round(total) : null;
};
