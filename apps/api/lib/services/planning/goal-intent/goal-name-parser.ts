import { FinancialGoalType } from "@prisma/client";
import { titleCaseWords } from "./text-utils";

export const buildDefaultGoalName = (goalType: FinancialGoalType | null) => {
  if (goalType === FinancialGoalType.EMERGENCY_FUND) return "Dana Darurat";
  if (goalType === FinancialGoalType.HOUSE) return "Beli Rumah";
  if (goalType === FinancialGoalType.VEHICLE) return "Beli Kendaraan";
  if (goalType === FinancialGoalType.VACATION) return "Liburan";
  return "Target Tabungan";
};

export const extractVacationName = (rawText: string) => {
  const match = rawText.match(/\bliburan\s+(.+?)(?=\s+\d|\s*$)/i);
  if (!match) return null;

  const cleaned = match[1]
    .replace(/\b(target|buat|ke|untuk)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Liburan";
  return `Liburan ${titleCaseWords(cleaned)}`;
};

export const extractCustomTargetName = (rawText: string) => {
  const explicit = rawText.match(
    /\b(?:target|goal)\s+(.+?)(?=\s+\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?\b)/i
  );
  if (!explicit) return null;

  const cleaned = explicit[1]
    .replace(/\b(mau|ingin|pengen|nabung|tabungan|buat|untuk)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return titleCaseWords(cleaned);
};

export const extractContextualGoalName = (rawText: string) => {
  const contextual = rawText.match(
    /\b(?:buat|untuk)\s+(.+?)(?=\s+\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?\b|$)/i
  );
  if (!contextual) return null;

  const cleaned = contextual[1]
    .replace(/\b(goal utama|target tabungan|tabungan pribadi|tabungan|saving|nabung|menabung|tabung)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return titleCaseWords(cleaned);
};
