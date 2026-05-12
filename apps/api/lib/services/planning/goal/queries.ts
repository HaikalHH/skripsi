import { FinancialGoalStatus, FinancialGoalType } from "@prisma/client";
import { getFinancialGoalModel } from "./data-access";
import { isSupportedFinancialGoalType } from "./constants";
import { matchesGoalSelection } from "./selection";
import type { GoalSelection } from "./types";
import { normalizeGoalToken, pickPrimaryGoal } from "./utils";

export const findExistingGoalForSet = async (params: {
  userId: string;
  goalType: FinancialGoalType | null;
  goalName: string | null;
}) => {
  const financialGoalModel = getFinancialGoalModel();
  if (!financialGoalModel) return null;
  const normalizedGoalType = isSupportedFinancialGoalType(params.goalType) ? params.goalType : null;

  if (normalizedGoalType && normalizedGoalType !== FinancialGoalType.CUSTOM) {
    return financialGoalModel.findFirst({
      where: {
        userId: params.userId,
        goalType: normalizedGoalType,
        status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  if (!params.goalName) return null;
  const queryToken = normalizeGoalToken(params.goalName);
  const goals = await financialGoalModel.findMany({
    where: {
      userId: params.userId,
      goalType: FinancialGoalType.CUSTOM,
      status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] }
    },
    orderBy: { createdAt: "desc" }
  });

  return (
    goals.find((goal: any) => normalizeGoalToken(goal.goalName) === queryToken) ??
    goals.find((goal: any) => normalizeGoalToken(goal.goalName).includes(queryToken)) ??
    null
  );
};

export const findGoalForSelection = async (params: {
  userId: string;
  selection?: GoalSelection;
}) => {
  const financialGoalModel = getFinancialGoalModel();
  if (!financialGoalModel) return null;

  const goals = await financialGoalModel.findMany({
    where: {
      userId: params.userId,
      status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] }
    },
    orderBy: { createdAt: "asc" }
  });

  if (!goals.length) return null;

  const filteredGoals = goals.filter(
    (goal: any) =>
      isSupportedFinancialGoalType(goal.goalType as FinancialGoalType) &&
      matchesGoalSelection(
        {
          goalName: goal.goalName,
          goalType: goal.goalType as FinancialGoalType
        },
        params.selection
      )
  );

  if (filteredGoals.length === 1) return filteredGoals[0];
  if (filteredGoals.length > 1) {
    return pickPrimaryGoal(filteredGoals) ?? filteredGoals[0];
  }

  return null;
};

export const hasAnyActiveFinancialGoal = async (userId: string) => {
  const financialGoalModel = getFinancialGoalModel();
  if (!financialGoalModel) return false;

  const goals = await financialGoalModel.findMany({
    where: {
      userId,
      status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] }
    },
    orderBy: { createdAt: "asc" }
  });

  return goals.some((goal: any) =>
    isSupportedFinancialGoalType(goal.goalType as FinancialGoalType)
  );
};
