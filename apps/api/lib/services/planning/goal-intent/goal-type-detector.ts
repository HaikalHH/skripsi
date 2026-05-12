import { FinancialGoalType } from "@prisma/client";

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
