import { FinancialGoalType } from "@prisma/client";
import type { GoalStatusSummary } from "@/lib/services/planning/goal";

export type GoalPlannerMode =
  | "FOCUS"
  | "SPLIT"
  | "PRIORITY"
  | "FOCUS_DURATION"
  | "SPLIT_RATIO"
  | "EXPENSE_GROWTH";

export type GoalPlannerInput = {
  userId: string;
  mode: GoalPlannerMode;
  goalQuery?: string | null;
  goalType?: FinancialGoalType | null;
  focusMonths?: number | null;
  splitRatio?: { primary: number; secondary: number } | null;
  annualExpenseGrowthRate?: number | null;
};

export type GoalPlanCandidate = GoalStatusSummary["goals"][number] & {
  priorityScore: number;
  recommendedAllocation: number;
  projectedEtaMonths: number | null;
};
