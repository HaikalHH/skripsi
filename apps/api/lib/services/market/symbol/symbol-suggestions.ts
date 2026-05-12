import { CRYPTO_METADATA } from "@/lib/services/market/symbol/crypto-registry";
import { GOLD_ALIASES } from "@/lib/services/market/symbol/gold-registry";
import {
  STOCK_ALIAS_TO_CANONICAL,
  STOCK_METADATA
} from "@/lib/services/market/symbol/stock-registry";
import { normalizeRawSymbol } from "@/lib/services/market/symbol/symbol-builders";

const MARKET_SYMBOL_CANDIDATES = Array.from(
  new Set([
    ...GOLD_ALIASES,
    ...Object.keys(CRYPTO_METADATA),
    ...Object.values(CRYPTO_METADATA).flatMap((entry) => entry.aliases),
    ...Object.keys(STOCK_METADATA),
    ...Object.keys(STOCK_ALIAS_TO_CANONICAL),
    ...Object.values(STOCK_METADATA).flatMap((entry) => entry.aliases)
  ])
);

const levenshtein = (left: string, right: string) => {
  const matrix = Array.from({ length: left.length + 1 }, (_, index) => [index]);
  for (let column = 0; column <= right.length; column += 1) {
    matrix[0]![column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row]![column] = Math.min(
        matrix[row - 1]![column]! + 1,
        matrix[row]![column - 1]! + 1,
        matrix[row - 1]![column - 1]! + cost
      );
    }
  }

  return matrix[left.length]![right.length]!;
};

export const suggestMarketSymbols = (raw: string, limit = 3) => {
  const cleaned = normalizeRawSymbol(raw);
  if (!cleaned) return [];

  return MARKET_SYMBOL_CANDIDATES
    .map((candidate) => ({
      symbol: candidate,
      score: candidate.startsWith(cleaned)
        ? 0
        : candidate.includes(cleaned) || cleaned.includes(candidate)
          ? 1
          : levenshtein(cleaned, candidate)
    }))
    .sort((left, right) => left.score - right.score || left.symbol.localeCompare(right.symbol))
    .slice(0, limit)
    .map((item) => item.symbol);
};

export const listKnownMarketSymbols = () =>
  Array.from(
    new Set([
      "XAU",
      ...Object.keys(CRYPTO_METADATA),
      ...Object.keys(STOCK_METADATA),
      ...Object.keys(STOCK_ALIAS_TO_CANONICAL)
    ])
  );
