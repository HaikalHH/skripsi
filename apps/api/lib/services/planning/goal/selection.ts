import { FinancialGoalType } from "@prisma/client";
import type { GoalSelection } from "./types";
import { defaultGoalNameByType, normalizeGoalToken } from "./utils";

export const matchesGoalSelection = (
  goal: { goalName: string; goalType: FinancialGoalType | null },
  selection?: GoalSelection
) => {
  if (!selection?.goalQuery && !selection?.goalName && !selection?.goalType) return true;
  if (selection.goalType && goal.goalType === selection.goalType) return true;

  const candidateTokens = [
    goal.goalName,
    defaultGoalNameByType(goal.goalType)
  ]
    .filter(Boolean)
    .map(normalizeGoalToken);

  const queryTokens = [selection.goalQuery, selection.goalName]
    .filter(Boolean)
    .map((value) => normalizeGoalToken(value as string));

  return queryTokens.some((queryToken) =>
    candidateTokens.some(
      (candidateToken) => candidateToken.includes(queryToken) || queryToken.includes(candidateToken)
    )
  );
};
