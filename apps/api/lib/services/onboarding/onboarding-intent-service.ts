import { parsePositiveAmount } from "@/lib/services/transactions/amount-parser";
import {
  isFuzzyPhraseMatch,
  isFuzzyTokenMatch,
  levenshteinDistance
} from "@/lib/services/shared/fuzzy-match";

export type FlexibleChoiceOption = {
  value: string;
  label: string;
  aliases?: string[];
};

const MULTI_SELECT_ALL_REGEX = /\b(?:semua|semuanya|seluruhnya|all)\b/i;
const MULTI_SELECT_EXCLUSION_REGEX = /\b(?:kecuali|selain)\b/i;

const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");
const MULTI_SELECT_SEPARATOR_REGEX = /,|\/|&|\+|\bdan\b|\bsama\b|\bserta\b|\bsambil\b|\bbareng\b/gi;
const INDEX_RANGE_REGEX =
  /^(?:pilihan\s*)?(\d+)(?:\s*(?:[\-–—]|sampai|sampe|sd|s\/d|to)\s*(\d+))?$/i;

export const normalizeLooseText = (value: string) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[\(\)\[\]\{\},.!?;:"'`~@#$%^*_+=|\\<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const stripChoicePrefix = (value: string) =>
  value.replace(/^\s*(?:pilihan\s*)?\d+\s*(?:[.):]|-(?!\s*\d))\s*/i, "").trim();

const unique = <T>(items: T[]) => Array.from(new Set(items));

const buildTextVariants = (raw: string) => {
  const base = normalizeLooseText(raw);
  return unique([base, stripChoicePrefix(base)].filter(Boolean));
};

const extractLeadingIndex = (raw: string) => {
  const match = normalizeLooseText(raw).match(
    /^(?:pilihan\s*)?(\d+)\b(?!\s*(?:[\-–—]|sampai|sampe|sd|s\/d|to)\s*\d)/i
  );
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

type TextChunk = {
  text: string;
  position: number;
};

const splitMultiSelectChunks = (raw: string): TextChunk[] => {
  if (!raw.trim()) return [];

  const chunks: TextChunk[] = [];
  let cursor = 0;
  let separatorMatch: RegExpExecArray | null;

  MULTI_SELECT_SEPARATOR_REGEX.lastIndex = 0;

  const pushChunk = (segmentStart: number, segmentEnd: number) => {
    const segment = raw.slice(segmentStart, segmentEnd);
    const trimmed = segment.trim();
    if (!trimmed) return;

    const leadingWhitespace = segment.length - segment.trimStart().length;
    chunks.push({
      text: trimmed,
      position: segmentStart + leadingWhitespace
    });
  };

  while ((separatorMatch = MULTI_SELECT_SEPARATOR_REGEX.exec(raw)) !== null) {
    pushChunk(cursor, separatorMatch.index);
    cursor = separatorMatch.index + separatorMatch[0].length;
  }

  pushChunk(cursor, raw.length);
  return chunks;
};

const parseIndexedSelectionChunk = (chunk: string, maxIndex: number): number[] | null => {
  const normalized = normalizeLooseText(chunk);
  const match = normalized.match(INDEX_RANGE_REGEX);
  if (!match) return null;

  const start = Number(match[1]);
  if (!Number.isInteger(start) || start < 1 || start > maxIndex) return [];

  const end = match[2] ? Number(match[2]) : null;
  if (end === null) return [start];
  if (!Number.isInteger(end) || end < 1 || end > maxIndex) return [];

  const step = start <= end ? 1 : -1;
  const values: number[] = [];

  for (let current = start; step > 0 ? current <= end : current >= end; current += step) {
    values.push(current);
  }

  return values;
};

const buildIndexedRange = (maxIndex: number) =>
  Array.from({ length: Math.max(0, maxIndex) }, (_, index) => index + 1);

export const parseMultiChoiceInput = (raw: string, maxOption: number): number[] | null => {
  if (!raw.trim() || maxOption < 1) return null;

  const normalized = normalizeLooseText(raw);
  if (!normalized) return null;

  if (MULTI_SELECT_ALL_REGEX.test(normalized)) {
    const exclusions =
      normalized.split(MULTI_SELECT_EXCLUSION_REGEX).at(1)?.trim() ?? "";
    const excludedSelections = new Set<number>();

    if (exclusions) {
      const exclusionChunks = splitMultiSelectChunks(exclusions);
      for (const chunk of exclusionChunks) {
        const parsed = parseIndexedSelectionChunk(chunk.text, maxOption);
        if (parsed === null) continue;
        parsed.forEach((selection) => excludedSelections.add(selection));
      }
    }

    return buildIndexedRange(maxOption).filter((selection) => !excludedSelections.has(selection));
  }

  const chunks = splitMultiSelectChunks(raw);
  if (!chunks.length) return null;

  const selections: number[] = [];
  for (const chunk of chunks) {
    const parsed = parseIndexedSelectionChunk(chunk.text, maxOption);
    if (parsed === null) return null;
    selections.push(...parsed);
  }

  return unique(selections);
};

const buildPatterns = (option: FlexibleChoiceOption) =>
  unique([option.label, option.value, ...(option.aliases ?? [])].map(normalizeLooseText).filter(Boolean));

const tokenize = (value: string) =>
  normalizeLooseText(value)
    .split(" ")
    .filter(Boolean);

const containsWholePhrase = (variant: string, phrase: string) =>
  variant === phrase ||
  variant.startsWith(`${phrase} `) ||
  variant.endsWith(` ${phrase}`) ||
  variant.includes(` ${phrase} `);

type ScoredMatch = {
  value: string;
  score: number;
  position: number;
};

const hasFuzzyPatternWindow = (variant: string, pattern: string) => {
  const variantTokens = tokenize(variant);
  const patternTokens = tokenize(pattern);
  if (!variantTokens.length || !patternTokens.length || variantTokens.length < patternTokens.length) {
    return false;
  }

  if (variantTokens.length === patternTokens.length) {
    return isFuzzyPhraseMatch(variant, pattern);
  }

  for (let index = 0; index <= variantTokens.length - patternTokens.length; index += 1) {
    const window = variantTokens.slice(index, index + patternTokens.length).join(" ");
    if (isFuzzyPhraseMatch(window, pattern)) return true;
  }

  return false;
};

const scoreFuzzyPattern = (variant: string, pattern: string) => {
  if (!variant || !pattern) return null;

  const fuzzyPhrase = isFuzzyPhraseMatch(variant, pattern) || hasFuzzyPatternWindow(variant, pattern);
  if (fuzzyPhrase) {
    const distance = levenshteinDistance(variant, pattern, 3);
    return {
      score: 430 + Math.max(pattern.length - distance, 0),
      position: 999
    };
  }

  if (variant.includes(" ") || pattern.includes(" ")) return null;
  if (!isFuzzyTokenMatch(variant, pattern)) return null;

  const distance = levenshteinDistance(variant, pattern, 3);
  return {
    score: 390 + Math.max(pattern.length - distance, 0),
    position: 999
  };
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

    if (variant.length >= 3 && pattern.length >= 3) {
      const fuzzyScore = scoreFuzzyPattern(variant, pattern);
      if (fuzzyScore) {
        const fuzzyMatch = {
          value: option.value,
          score: fuzzyScore.score,
          position: fuzzyScore.position
        };
        if (
          !best ||
          fuzzyMatch.score > best.score ||
          (fuzzyMatch.score === best.score && fuzzyMatch.position < best.position)
        ) {
          best = fuzzyMatch;
        }
      }
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
  const normalized = normalizeLooseText(raw);
  const rawChunks = splitMultiSelectChunks(raw);
  const explicitMultiChoiceSelections = parseMultiChoiceInput(raw, options.length);
  const isPureIndexedSelection =
    rawChunks.length > 0 &&
    rawChunks.every((chunk) => parseIndexedSelectionChunk(chunk.text, options.length) !== null);

  if (
    explicitMultiChoiceSelections?.length &&
    (MULTI_SELECT_ALL_REGEX.test(normalized) || isPureIndexedSelection)
  ) {
    return explicitMultiChoiceSelections
      .map((selection) => options[selection - 1]?.value ?? null)
      .filter((value): value is string => Boolean(value));
  }

  const values = new Map<string, number>();
  const chunks = rawChunks;

  for (const chunk of chunks) {
    const indexedSelections = parseIndexedSelectionChunk(chunk.text, options.length);
    if (indexedSelections !== null) {
      indexedSelections.forEach((selection, index) => {
        const matched = options[selection - 1]?.value;
        if (matched && !values.has(matched)) {
          values.set(matched, chunk.position + index / 1000);
        }
      });
      continue;
    }

    const matched = matchSingleSelectIntent(chunk.text, options);
    if (matched && !values.has(matched)) {
      values.set(matched, chunk.position);
    }
  }

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
  const matches = raw.match(/(?:rp\.?\s*)?\d[\d.,]*(?:\s*[a-z]{1,8})?/gi) ?? [];
  return unique(matches.map((item) => item.trim()).filter(Boolean));
};

export const extractMoneyFromFreeText = (raw: string) => {
  for (const candidate of extractCandidateMoneyTokens(raw)) {
    const parsed = parsePositiveAmount(candidate);
    if (parsed !== null) return parsed;
  }

  return parsePositiveAmount(raw);
};

export const extractMoneyRangeFromFreeText = (raw: string) => {
  const rangeMatch = raw.match(
    /((?:rp\.?\s*)?\d[\d.,]*(?:\s*[a-z]{1,8})?)\s*(?:-|–|sampai|sampe|sd|s\/d|to)\s*((?:rp\.?\s*)?\d[\d.,]*(?:\s*[a-z]{1,8})?)/i
  );
  if (!rangeMatch) return null;

  const lowerRaw = rangeMatch[1].trim();
  const upperRaw = rangeMatch[2].trim();
  const inferUnitSuffix = (value: string) => value.match(/([a-z]{1,8})$/i)?.[1] ?? null;

  let lowerBound = parsePositiveAmount(lowerRaw);
  let upperBound = parsePositiveAmount(upperRaw);

  if (lowerBound !== null && upperBound !== null) {
    const lowerHasUnit = /[a-z]/i.test(lowerRaw);
    const upperHasUnit = /[a-z]/i.test(upperRaw);

    if (!lowerHasUnit && upperHasUnit) {
      const inferredUnit = inferUnitSuffix(upperRaw);
      if (inferredUnit) {
        lowerBound = parsePositiveAmount(`${lowerRaw} ${inferredUnit}`);
      }
    }

    if (lowerHasUnit && !upperHasUnit) {
      const inferredUnit = inferUnitSuffix(lowerRaw);
      if (inferredUnit) {
        upperBound = parsePositiveAmount(`${upperRaw} ${inferredUnit}`);
      }
    }
  }

  if (lowerBound === null || upperBound === null) return null;

  const low = Math.min(lowerBound, upperBound);
  const high = Math.max(lowerBound, upperBound);
  return {
    low,
    high,
    midpoint: Math.round((low + high) / 2)
  };
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

export const extractDecimalRangeFromFreeText = (raw: string) => {
  const rangeMatch = raw.match(
    /(\d+(?:[.,]\d+)?)(?:\s*[a-z]{1,10})?\s*(?:-|–|sampai|sampe|sd|s\/d|to)\s*(\d+(?:[.,]\d+)?)(?:\s*[a-z]{1,10})?/i
  );
  if (!rangeMatch) return null;

  const low = Number(rangeMatch[1].replace(",", "."));
  const high = Number(rangeMatch[2].replace(",", "."));
  if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high <= 0) return null;

  const normalizedLow = Math.min(low, high);
  const normalizedHigh = Math.max(low, high);

  return {
    low: normalizedLow,
    high: normalizedHigh,
    midpoint: (normalizedLow + normalizedHigh) / 2
  };
};

export const parseFlexibleBoolean = (raw: unknown) => {
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return null;

  const variants = buildTextVariants(raw);
  const positivePhrases = [
    "iya",
    "iyaa",
    "iya ada",
    "ya",
    "yaa",
    "yes",
    "y",
    "ada",
    "adaa",
    "adaaah",
    "ad",
    "punya",
    "punya kok",
    "ada dong",
    "masih ada",
    "ada lagi",
    "betul",
    "benar",
    "bener"
  ];
  const negativePhrases = [
    "tidak",
    "tdk",
    "ga",
    "g",
    "gada",
    "g ada",
    "gak",
    "gk",
    "ngga",
    "nggak",
    "engga",
    "enggak",
    "ga ada",
    "gaadaa",
    "gak ada",
    "ngga ada",
    "nggak ada",
    "tidak ada",
    "udah ga ada",
    "udah gak ada",
    "sudah ga ada",
    "sudah gak ada",
    "enggak ada lagi",
    "nggak ada lagi",
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
    "tidak mau",
    "udah semua",
    "sudah semua",
    "ya udah semua",
    "ya sudah semua"
  ];

  if (variants.some((variant) => negativePhrases.some((phrase) => containsWholePhrase(variant, phrase)))) {
    return false;
  }

  if (
    variants.some((variant) =>
      negativePhrases.some(
        (phrase) =>
          isFuzzyPhraseMatch(variant, phrase) ||
          (!variant.includes(" ") && !phrase.includes(" ") && isFuzzyTokenMatch(variant, phrase))
      )
    )
  ) {
    return false;
  }

  if (variants.some((variant) => positivePhrases.some((phrase) => containsWholePhrase(variant, phrase)))) {
    return true;
  }

  if (
    variants.some((variant) =>
      positivePhrases.some(
        (phrase) =>
          isFuzzyPhraseMatch(variant, phrase) ||
          (!variant.includes(" ") && !phrase.includes(" ") && isFuzzyTokenMatch(variant, phrase))
      )
    )
  ) {
    return true;
  }

  return null;
};
