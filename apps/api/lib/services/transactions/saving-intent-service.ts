import { buildGoalIntentDetails } from "@/lib/services/planning/goal-intent-service";
import { parsePositiveAmount } from "@/lib/services/transactions/amount-parser";

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

const SAVING_KEYWORD_PATTERN =
  /\b(?:nabung|menabung|setor\s+tabungan|simpan|saving)\b|\btabung\b(?=\s+(?:ke|buat|untuk|rp|\d|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|seratus|sejuta))/i;
const SAVING_PLANNING_PATTERN =
  /\b(?:target|goal|status|progress|progres)\b/i;
const SAVING_TARGET_INTENT_PATTERN =
  /\b(?:mau|ingin|pengen)\s+(?:nabung|menabung|tabung)\b/i;
const SAVING_PROJECTION_PATTERN =
  /\b(?:kalau|jika)\b.*\b(?:nabung|menabung|tabung|saving)\b.*\b(?:jadi berapa|hasilnya berapa|berapa nanti|berapa lama|kapan tercapai)\b/i;

const extractSavingAmount = (text: string) => {
  const directMatch = text.match(/(\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?)/i);
  if (directMatch) {
    return parsePositiveAmount(directMatch[1]);
  }

  const wordMatch = text.match(
    /\b(?:satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|belas|puluh|ratus|ribu|juta|miliar|milyar|triliun)\b(?:[\sa-z]+)?/i
  );
  if (!wordMatch) return null;

  return parsePositiveAmount(wordMatch[0]);
};

export const hasSavingKeyword = (rawText: string) => SAVING_KEYWORD_PATTERN.test(rawText);

export const isLikelySavingTransactionText = (rawText: string) => {
  const text = normalizeText(rawText);
  if (!text || text.includes("?")) return false;
  if (!hasSavingKeyword(text)) return false;
  if (SAVING_PROJECTION_PATTERN.test(text)) return false;
  if (SAVING_TARGET_INTENT_PATTERN.test(text)) return false;
  if (SAVING_PLANNING_PATTERN.test(text)) return false;
  return Boolean(extractSavingAmount(text));
};

export const resolveSavingGoalSelection = (rawText: string) => {
  const goalIntent = buildGoalIntentDetails(rawText);
  if (!goalIntent.goalType && !goalIntent.goalName && !goalIntent.goalQuery) {
    return undefined;
  }

  return {
    goalType: goalIntent.goalType,
    goalName: goalIntent.goalName,
    goalQuery: goalIntent.goalQuery ?? goalIntent.goalName
  };
};
