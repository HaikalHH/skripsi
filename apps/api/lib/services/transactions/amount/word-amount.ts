import { DIGIT_WORDS } from "./constants";
import { isNumericToken, parseNumericChunk } from "./localized-number";

const parseUnderThousandTokens = (tokens: string[]): number | null => {
  if (!tokens.length) return 0;
  if (tokens.length === 1 && tokens[0] === "ratus") {
    return 100;
  }
  if (tokens.length === 1 && isNumericToken(tokens[0]!)) {
    return parseNumericChunk(tokens[0]!);
  }

  let index = 0;
  let total = 0;

  if (tokens[index] === "satu" && tokens[index + 1] === "ratus") {
    total += 100;
    index += 2;
  } else if (tokens[index] && DIGIT_WORDS[tokens[index]!] != null && tokens[index + 1] === "ratus") {
    total += DIGIT_WORDS[tokens[index]!] * 100;
    index += 2;
  }

  if (tokens[index] === "satu" && tokens[index + 1] === "belas") {
    total += 11;
    index += 2;
  } else if (tokens[index] && DIGIT_WORDS[tokens[index]!] != null && tokens[index + 1] === "belas") {
    total += DIGIT_WORDS[tokens[index]!] + 10;
    index += 2;
  } else if (tokens[index] === "satu" && tokens[index + 1] === "puluh") {
    total += 10;
    index += 2;
    if (tokens[index] && DIGIT_WORDS[tokens[index]!] != null) {
      total += DIGIT_WORDS[tokens[index]!]!;
      index += 1;
    }
  } else if (tokens[index] && DIGIT_WORDS[tokens[index]!] != null && tokens[index + 1] === "puluh") {
    total += DIGIT_WORDS[tokens[index]!] * 10;
    index += 2;
    if (tokens[index] && DIGIT_WORDS[tokens[index]!] != null) {
      total += DIGIT_WORDS[tokens[index]!]!;
      index += 1;
    }
  } else if (tokens[index] && DIGIT_WORDS[tokens[index]!] != null) {
    total += DIGIT_WORDS[tokens[index]!]!;
    index += 1;
  } else if (tokens[index] && isNumericToken(tokens[index]!)) {
    const numericValue = parseNumericChunk(tokens[index]!);
    if (numericValue == null) return null;
    total += numericValue;
    index += 1;
  }

  return index === tokens.length ? total : null;
};

export const parseWordAmount = (normalized: string): number | null => {
  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && token !== "dan");
  if (!tokens.length) return null;

  const largeUnits: Array<[string, number]> = [
    ["triliun", 1_000_000_000_000],
    ["miliar", 1_000_000_000],
    ["milyar", 1_000_000_000],
    ["juta", 1_000_000],
    ["ribu", 1_000]
  ];

  let remainingTokens = [...tokens];
  let total = 0;

  for (const [unit, multiplier] of largeUnits) {
    const unitIndex = remainingTokens.indexOf(unit);
    if (unitIndex === -1) continue;

    const chunk = remainingTokens.slice(0, unitIndex);
    const chunkValue = parseUnderThousandTokens(chunk);
    if (chunkValue == null || chunkValue <= 0) return null;

    total += chunkValue * multiplier;
    remainingTokens = remainingTokens.slice(unitIndex + 1);
  }

  const tailValue = parseUnderThousandTokens(remainingTokens);
  if (tailValue == null) return null;

  total += tailValue;
  return total > 0 ? Math.round(total) : null;
};
