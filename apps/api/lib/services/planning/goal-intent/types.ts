import { FinancialGoalType } from "@prisma/client";

export type GoalIntentDetails = {
  goalType: FinancialGoalType | null;
  goalName: string | null;
  goalQuery: string | null;
};
