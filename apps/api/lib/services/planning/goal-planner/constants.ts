import { FinancialGoalType } from "@prisma/client";

export const PRIORITY_BASELINE: Partial<Record<FinancialGoalType, number>> = {
  EMERGENCY_FUND: 100,
  HOUSE: 85,
  VEHICLE: 72,
  VACATION: 60,
  CUSTOM: 65
};

export const DEFAULT_FINANCIAL_GOAL_PRIORITY_ORDER = 999;
