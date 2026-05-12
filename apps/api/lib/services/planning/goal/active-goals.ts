import { FinancialGoalStatus, FinancialGoalType } from "@prisma/client";
import { getFinancialGoalModel } from "./data-access";
import { isSupportedFinancialGoalType } from "./constants";
import { toNumber } from "./utils";

export const getActiveGoalNames = async (userId: string): Promise<string[]> => {
  const financialGoalModel = getFinancialGoalModel();
  if (!financialGoalModel) return [];

  const goals = await financialGoalModel.findMany({
    where: {
      userId,
      status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] }
    },
    orderBy: [{ priorityOrder: "asc" }, { createdAt: "asc" }],
    select: { goalName: true, goalType: true, targetAmount: true }
  });

  return goals
    .filter(
      (goal: any) =>
        isSupportedFinancialGoalType(goal.goalType as FinancialGoalType) &&
        toNumber(goal.targetAmount ?? 0) > 0
    )
    .map((goal: any) => goal.goalName as string);
};
