import { parsePositiveAmount } from "../amount";

export const extractSavingAmount = (text: string) => {
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
