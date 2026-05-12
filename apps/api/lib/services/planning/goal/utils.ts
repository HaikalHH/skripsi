import { FinancialGoalType } from "@prisma/client";
import { PRIMARY_GOAL_ORDER } from "./constants";

export const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

export const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");
export const normalizeGoalToken = (value: string) => normalizeText(value).toLowerCase();

export const clampProgressPercent = (targetAmount: number, currentProgress: number) => {
  if (targetAmount <= 0) return 0;
  const value = (currentProgress / targetAmount) * 100;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

export const pickPrimaryGoal = <T extends { goalType: FinancialGoalType | null; id?: string }>(
  goals: T[]
) => {
  for (const goalType of PRIMARY_GOAL_ORDER) {
    const match = goals.find((goal) => goal.goalType === goalType);
    if (match) return match;
  }

  return goals[0] ?? null;
};

export const defaultGoalNameByType = (goalType: FinancialGoalType | null) => {
  if (goalType === FinancialGoalType.EMERGENCY_FUND) return "Dana Darurat";
  if (goalType === FinancialGoalType.HOUSE) return "Beli Rumah";
  if (goalType === FinancialGoalType.VEHICLE) return "Beli Kendaraan";
  if (goalType === FinancialGoalType.VACATION) return "Liburan";
  return "Target Tabungan";
};
