import { LARGE_UNIT_MULTIPLIERS } from "./constants";
import { parseLocalizedNumber } from "./localized-number";
import { parseMixedUnitAmount } from "./mixed-unit";
import { normalizeAmountInput } from "./normalizer";
import { parseWordAmount } from "./word-amount";


export const isNegativeAmountInput = (raw: string): boolean => {

  if (raw.trim().startsWith("-")) return true;
  
  return /-\s*\d/.test(raw);
};

export const parsePositiveAmount = (raw: string): number | null => {
  const normalized = normalizeAmountInput(raw);
  if (!normalized) return null;

  const singleUnitMatch = normalized.match(
    /^([\d.,]+)\s*(jt|jta|jtan|juta|jutaan|rb|rbu|ribu|ribuan|k|miliar|milyar|triliun)$/i
  );
  if (singleUnitMatch) {
    const numericValue = parseLocalizedNumber(singleUnitMatch[1]);
    if (!numericValue) return null;

    const multiplier = LARGE_UNIT_MULTIPLIERS[singleUnitMatch[2].toLowerCase()];
    if (!multiplier) return null;
    return Math.round(numericValue * multiplier);
  }

  const mixedNumericAmount = parseMixedUnitAmount(normalized);
  if (mixedNumericAmount) return mixedNumericAmount;

  const wordAmount = parseWordAmount(normalized);
  if (wordAmount) return wordAmount;

  const digitsOnly = normalized.replace(/[^\d]/g, "");
  if (!digitsOnly) return null;
  const amount = Number(digitsOnly);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
};

