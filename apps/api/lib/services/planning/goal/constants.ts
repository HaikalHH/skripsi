import { FinancialGoalType } from "@prisma/client";

export const SUPPORTED_FINANCIAL_GOAL_TYPES = [
  FinancialGoalType.EMERGENCY_FUND,
  FinancialGoalType.HOUSE,
  FinancialGoalType.VEHICLE,
  FinancialGoalType.VACATION,
  FinancialGoalType.CUSTOM
] as const;

export const isSupportedFinancialGoalType = (
  goalType: FinancialGoalType | null | undefined
): goalType is (typeof SUPPORTED_FINANCIAL_GOAL_TYPES)[number] =>
  goalType != null &&
  SUPPORTED_FINANCIAL_GOAL_TYPES.includes(
    goalType as (typeof SUPPORTED_FINANCIAL_GOAL_TYPES)[number]
  );

export const PRIMARY_GOAL_ORDER: FinancialGoalType[] = [
  FinancialGoalType.EMERGENCY_FUND,
  FinancialGoalType.HOUSE,
  FinancialGoalType.VEHICLE,
  FinancialGoalType.VACATION,
  FinancialGoalType.CUSTOM
];

export const GOAL_PRIORITY_BASELINE: Partial<Record<FinancialGoalType, number>> = {
  EMERGENCY_FUND: 100,
  HOUSE: 85,
  VEHICLE: 72,
  VACATION: 60,
  CUSTOM: 65
};
