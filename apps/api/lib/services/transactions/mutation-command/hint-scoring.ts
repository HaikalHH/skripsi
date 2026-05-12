import { parsePositiveAmount } from "../amount";
import { normalizeSpaces } from "../helpers/text";
import { formatShortTransactionDate } from "./labels";
import type { TransactionRow } from "./types";

const GENERIC_HINT_WORDS = new Set([
  "transaksi",
  "yang",
  "doang",
  "aja",
  "saja",
  "itu",
  "ini",
  "tadi",
  "barusan",
  "terakhir",
  "baru",
  "saja",
  "dong",
  "ya",
  "nih"
]);

const extractHintAmount = (hint: string | null) => {
  if (!hint) return null;
  const match = hint.match(/(?:rp\.?\s*)?(\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?)/i);
  if (!match) return null;
  return parsePositiveAmount(match[1]);
};

const extractHintTokens = (hint: string | null) => {
  if (!hint) return [];
  return normalizeSpaces(hint)
    .toLowerCase()
    .replace(/[|/(),.-]+/g, " ")
    .split(/\s+/)
    .filter((token) => (token.length >= 2 || /^\d+$/.test(token)) && !GENERIC_HINT_WORDS.has(token));
};

const buildSearchText = (row: { category: string; merchant?: string | null; rawText?: string | null }) =>
  normalizeSpaces([row.category, row.merchant ?? "", row.rawText ?? ""].filter(Boolean).join(" ")).toLowerCase();

export const scoreTransactionCandidate = (row: TransactionRow, hint: string | null) => {
  if (!hint) return 100;

  const normalizedHint = normalizeSpaces(hint).toLowerCase();
  const merchant = (row.merchant ?? "").toLowerCase();
  const category = row.category.toLowerCase();
  const rawText = (row.rawText ?? "").toLowerCase();
  const searchText = buildSearchText(row);
  const shortDate = formatShortTransactionDate(row.occurredAt).toLowerCase();
  const amount = Number(row.amount);

  let score = 0;

  if (merchant && merchant === normalizedHint) score += 120;
  if (category === normalizedHint) score += 95;
  if (rawText && rawText === normalizedHint) score += 90;
  if (searchText.includes(normalizedHint)) score += 70;
  if (shortDate.includes(normalizedHint)) score += 50;
  if (
    normalizedHint.includes(shortDate) ||
    shortDate
      .split(/\s+/)
      .filter(Boolean)
      .every((part) => normalizedHint.includes(part))
  ) {
    score += 95;
  }

  const hintAmount = extractHintAmount(hint);
  if (hintAmount && hintAmount === amount) {
    score += 85;
  }

  const tokens = extractHintTokens(hint);
  for (const token of tokens) {
    if (merchant.includes(token)) score += 25;
    else if (category.includes(token)) score += 20;
    else if (rawText.includes(token)) score += 18;
    else if (shortDate.includes(token)) score += 18;
  }

  return score;
};
