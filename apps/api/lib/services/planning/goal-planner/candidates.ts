import { getMonthlySavingCapacity, getSavingsGoalStatus } from "@/lib/services/planning/goal";
import { buildGoalPriorityScore } from "./scoring";
import type { GoalPlannerInput } from "./types";

export const selectGoalCandidates = async (params: GoalPlannerInput) => {
  const allGoalsSummary = await getSavingsGoalStatus(params.userId);
  const activeGoals = allGoalsSummary.goals.filter((goal) => goal.targetAmount > 0 && goal.remainingAmount > 0);

  const monthlySavingCapacity = await getMonthlySavingCapacity(params.userId);

  const candidates = activeGoals.map((goal) => ({
    ...goal,
    priorityScore: buildGoalPriorityScore(goal),
    recommendedAllocation: 0,
    projectedEtaMonths: goal.estimatedMonthsToGoal
  }));

  return {
    summary: allGoalsSummary,
    candidates,
    monthlySavingCapacity
  };
};
