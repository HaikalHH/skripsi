const LARGE_UNIT_MULTIPLIERS: Record<string, number> = {
  rb: 1_000,
  ribu: 1_000,
  k: 1_000,
  jt: 1_000_000,
  juta: 1_000_000,
  miliar: 1_000_000_000,
  milyar: 1_000_000_000,
  triliun: 1_000_000_000_000
};

const DIGIT_WORDS: Record<string, number> = {
  nol: 0,
  satu: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
  enam: 6,
  tujuh: 7,
  delapan: 8,
  sembilan: 9
};

const normalizeAmountInput = (raw: string) =>
  raw
    .trim()
    .toLowerCase()
    .replace(/^rp\.?\s*/i, "")
    .replace(/\bidr\b/g, " ")
    .replace(/\brupiah\b/g, " ")
    .replace(/\s*(?:\/\s*bulan|per\s*bulan|\/\s*bln|per\s*bln)\s*$/i, "")
    .replace(/[-/]/g, " ")
    .replace(/\bratur\b/g, "ratus")
    .replace(/\bsejuta\b/g, "satu juta")
    .replace(/\bseribu\b/g, "satu ribu")
    .replace(/\bseratus\b/g, "satu ratus")
    .replace(/\bsepuluh\b/g, "satu puluh")
    .replace(/\bsebelas\b/g, "satu belas")
    .replace(/\s+/g, " ")
    .trim();

const parseLocalizedNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const hasComma = trimmed.includes(",");
  const dotCount = (trimmed.match(/\./g) ?? []).length;

  let normalized = trimmed;
  if (hasComma && dotCount > 0) {
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = trimmed.replace(",", ".");
  } else if (dotCount > 1) {
    normalized = trimmed.replace(/\./g, "");
  } else if (dotCount === 1) {
    const [left, right = ""] = trimmed.split(".");
    if (right.length === 3) {
      normalized = `${left}${right}`;
    }
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const isNumericToken = (token: string) => /^[\d.,]+$/.test(token);

const parseNumericChunk = (token: string) => parseLocalizedNumber(token);

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

const parseMixedUnitAmount = (normalized: string): number | null => {
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

const parseWordAmount = (normalized: string): number | null => {
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

export const parsePositiveAmount = (raw: string): number | null => {
  const normalized = normalizeAmountInput(raw);
  if (!normalized) return null;

  const singleUnitMatch = normalized.match(/^([\d.,]+)\s*(jt|juta|rb|ribu|k|miliar|milyar|triliun)$/i);
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
