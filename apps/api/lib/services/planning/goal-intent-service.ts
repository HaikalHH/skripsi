import { FinancialGoalType } from "@prisma/client";

export type GoalIntentDetails = {
  goalType: FinancialGoalType | null;
  goalName: string | null;
  goalQuery: string | null;
};

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

const titleCaseWords = (value: string) =>
  normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export const detectGoalTypeFromText = (rawText: string): FinancialGoalType | null => {
  const text = rawText.toLowerCase();

  if (/\b(dana darurat|emergency fund|tabungan darurat)\b/i.test(text)) {
    return FinancialGoalType.EMERGENCY_FUND;
  }
  if (/\b(rumah|dp rumah|beli rumah|properti rumah|property)\b/i.test(text)) {
    return FinancialGoalType.HOUSE;
  }
  if (/\b(kendaraan|mobil|motor|beli mobil|beli motor)\b/i.test(text)) {
    return FinancialGoalType.VEHICLE;
  }
  if (/\b(liburan|travel|jalan jalan|holiday)\b/i.test(text)) {
    return FinancialGoalType.VACATION;
  }

  return null;
};

const buildDefaultGoalName = (goalType: FinancialGoalType | null) => {
  if (goalType === FinancialGoalType.EMERGENCY_FUND) return "Dana Darurat";
  if (goalType === FinancialGoalType.HOUSE) return "Beli Rumah";
  if (goalType === FinancialGoalType.VEHICLE) return "Beli Kendaraan";
  if (goalType === FinancialGoalType.VACATION) return "Liburan";
  return "Target Tabungan";
};

const extractVacationName = (rawText: string) => {
  const match = rawText.match(/\bliburan\s+(.+?)(?=\s+\d|\s*$)/i);
  if (!match) return null;

  const cleaned = match[1]
    .replace(/\b(target|buat|ke|untuk)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Liburan";
  return `Liburan ${titleCaseWords(cleaned)}`;
};

const extractCustomTargetName = (rawText: string) => {
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

const extractContextualGoalName = (rawText: string) => {
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

export const buildGoalIntentDetails = (rawText: string): GoalIntentDetails => {
  const goalType = detectGoalTypeFromText(rawText);

  if (goalType === FinancialGoalType.VACATION) {
    return {
      goalType,
      goalName: extractVacationName(rawText) ?? buildDefaultGoalName(goalType),
      goalQuery: extractVacationName(rawText) ?? buildDefaultGoalName(goalType)
    };
  }

  if (goalType) {
    const goalName = buildDefaultGoalName(goalType);
    return {
      goalType,
      goalName,
      goalQuery: goalName
    };
  }

  const customName = extractCustomTargetName(rawText);
  if (customName) {
    return {
      goalType: FinancialGoalType.CUSTOM,
      goalName: customName,
      goalQuery: customName
    };
  }

  const contextualGoalName = extractContextualGoalName(rawText);
  if (contextualGoalName) {
    return {
      goalType: FinancialGoalType.CUSTOM,
      goalName: contextualGoalName,
      goalQuery: contextualGoalName
    };
  }

  return {
    goalType: null,
    goalName: null,
    goalQuery: null
  };
};
