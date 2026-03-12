import { parsePositiveAmount } from "@/lib/services/transactions/amount-parser";

export type FlexibleChoiceOption = {
  value: string;
  label: string;
  aliases?: string[];
};

const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");

export const normalizeLooseText = (value: string) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[\(\)\[\]\{\},.!?;:"'`~@#$%^*_+=|\\<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const stripChoicePrefix = (value: string) =>
  value.replace(/^\s*(?:pilihan\s*)?\d+\s*[.)\-:]*\s*/i, "").trim();

const unique = <T>(items: T[]) => Array.from(new Set(items));

const buildTextVariants = (raw: string) => {
  const base = normalizeLooseText(raw);
  return unique([base, stripChoicePrefix(base)].filter(Boolean));
};

const extractLeadingIndex = (raw: string) => {
  const match = normalizeLooseText(raw).match(/^(?:pilihan\s*)?(\d+)\b/);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const buildPatterns = (option: FlexibleChoiceOption) =>
  unique([option.label, option.value, ...(option.aliases ?? [])].map(normalizeLooseText).filter(Boolean));

type ScoredMatch = {
  value: string;
  score: number;
  position: number;
};

const scoreOptionAgainstVariant = (variant: string, option: FlexibleChoiceOption): ScoredMatch | null => {
  const patterns = buildPatterns(option);
  let best: ScoredMatch | null = null;

  for (const pattern of patterns) {
    if (!pattern) continue;

    if (variant === pattern) {
      const exactMatch = { value: option.value, score: 1000 + pattern.length, position: 0 };
      if (!best || exactMatch.score > best.score) best = exactMatch;
      continue;
    }

    const position = variant.indexOf(pattern);
    if (position >= 0) {
      const containsMatch = {
        value: option.value,
        score: 600 + Math.min(pattern.length, 100) - Math.min(position, 100),
        position
      };
      if (!best || containsMatch.score > best.score || (containsMatch.score === best.score && containsMatch.position < best.position)) {
        best = containsMatch;
      }
      continue;
    }

    if (pattern.includes(variant) && variant.length >= 4) {
      const partialMatch = {
        value: option.value,
        score: 250 + variant.length,
        position: 999
      };
      if (!best || partialMatch.score > best.score) best = partialMatch;
    }
  }

  return best;
};

const collectOptionMatches = (raw: string, options: FlexibleChoiceOption[]) => {
  const variants = buildTextVariants(raw);
  const matches: ScoredMatch[] = [];

  for (const variant of variants) {
    for (const option of options) {
      const scored = scoreOptionAgainstVariant(variant, option);
      if (scored) matches.push(scored);
    }
  }

  return matches;
};

export const matchSingleSelectIntent = (raw: string, options: FlexibleChoiceOption[]) => {
  const byIndex = extractLeadingIndex(raw);
  if (byIndex && byIndex >= 1 && byIndex <= options.length) {
    return options[byIndex - 1]?.value ?? null;
  }

  const matches = collectOptionMatches(raw, options).sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.position - right.position;
  });

  return matches[0]?.value ?? null;
};

export const matchMultiSelectIntent = (raw: string, options: FlexibleChoiceOption[]) => {
  const values = new Map<string, number>();
  const chunks = raw
    .split(/,|\/|&|\+|\bdan\b|\bserta\b|\bsambil\b/gi)
    .map((item) => item.trim())
    .filter(Boolean);

  for (const [index, chunk] of chunks.entries()) {
    const matched = matchSingleSelectIntent(chunk, options);
    if (matched && !values.has(matched)) {
      values.set(matched, index);
    }
  }

  const normalized = normalizeLooseText(raw);
  for (const option of options) {
    const positions = buildPatterns(option)
      .map((pattern) => normalized.indexOf(pattern))
      .filter((position) => position >= 0);
    if (!positions.length) continue;

    const currentPosition = Math.min(...positions);
    const previous = values.get(option.value);
    if (previous === undefined || currentPosition < previous) {
      values.set(option.value, currentPosition);
    }
  }

  return Array.from(values.entries())
    .sort((left, right) => left[1] - right[1])
    .map(([value]) => value);
};

const extractCandidateMoneyTokens = (raw: string) => {
  const matches = raw.match(/(?:rp\.?\s*)?\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?/gi) ?? [];
  return unique(matches.map((item) => item.trim()).filter(Boolean));
};

export const extractMoneyFromFreeText = (raw: string) => {
  for (const candidate of extractCandidateMoneyTokens(raw)) {
    const parsed = parsePositiveAmount(candidate);
    if (parsed !== null) return parsed;
  }

  return parsePositiveAmount(raw);
};

export const extractIntegerFromFreeText = (
  raw: string,
  options?: { min?: number; max?: number }
) => {
  const matches = raw.match(/\d{1,3}/g) ?? [];
  for (const match of matches) {
    const parsed = Number(match);
    if (!Number.isInteger(parsed)) continue;
    if (options?.min != null && parsed < options.min) continue;
    if (options?.max != null && parsed > options.max) continue;
    return parsed;
  }
  return null;
};

export const extractDecimalFromFreeText = (raw: string) => {
  const match = raw.match(/\d+(?:[.,]\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0].replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

export const parseFlexibleBoolean = (raw: unknown) => {
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return null;

  const variants = buildTextVariants(raw);
  const positivePhrases = [
    "iya",
    "iya ada",
    "ya",
    "yes",
    "y",
    "ada",
    "punya",
    "punya kok",
    "ada dong",
    "masih ada",
    "ada lagi",
    "betul",
    "benar",
    "bener",
    "lanjut",
    "mau"
  ];
  const negativePhrases = [
    "tidak",
    "ga",
    "gak",
    "ngga",
    "nggak",
    "engga",
    "enggak",
    "ga ada",
    "gak ada",
    "ngga ada",
    "nggak ada",
    "tidak ada",
    "belum",
    "belum ada",
    "none",
    "no",
    "udah cukup",
    "cukup",
    "selesai",
    "stop",
    "ga dulu",
    "gak dulu",
    "tidak dulu",
    "ga mau",
    "gak mau",
    "tidak mau"
  ];

  if (variants.some((variant) => negativePhrases.some((phrase) => variant === phrase || variant.includes(phrase)))) {
    return false;
  }

  if (variants.some((variant) => positivePhrases.some((phrase) => variant === phrase || variant.includes(phrase)))) {
    return true;
  }

  return null;
};
