import { buildGoalStatus } from "./status-builders";
import { matchesGoalSelection } from "./selection";
import type { GoalSelection, GoalStatusItem, GoalStatusSummary } from "./types";
import { pickPrimaryGoal } from "./utils";

export const summarizeGoalStatuses = (
  goalItems: GoalStatusItem[],
  selection?: GoalSelection,
  monthlySavingCapacity?: number | null
): GoalStatusSummary => {
  const filteredGoals = goalItems.filter((goal) => matchesGoalSelection(goal, selection));
  const selectedGoals = filteredGoals.length ? filteredGoals : goalItems;
  const primary = pickPrimaryGoal(
    selectedGoals.map((goal) => ({
      ...goal,
      goalType: goal.goalType
    }))
  );
  const selectedPrimary =
    selectedGoals.find((goal) => goal.goalName === primary?.goalName && goal.goalType === primary?.goalType) ??
    selectedGoals[0];

  return buildGoalStatus({
    goalName: selectedPrimary?.goalName ?? null,
    goalType: selectedPrimary?.goalType ?? null,
    targetAmount: selectedPrimary?.targetAmount ?? 0,
    currentProgress: selectedPrimary?.currentProgress ?? 0,
    estimatedMonthsToGoal: selectedPrimary?.estimatedMonthsToGoal ?? null,
    monthlyContributionPace: selectedPrimary?.monthlyContributionPace ?? null,
    totalGoals: selectedGoals.length,
    monthlySavingCapacity: monthlySavingCapacity ?? null,
    goals: selectedGoals,
    recommendedPlan: selectedGoals
      .filter((goal) => (goal.recommendedMonthlyContribution ?? 0) > 0)
      .map((goal) => ({
        goalId: goal.goalId,
        goalName: goal.goalName,
        goalType: goal.goalType,
        recommendedMonthlyContribution: goal.recommendedMonthlyContribution ?? 0,
        sharePercent: goal.recommendedAllocationShare ?? 0
      })),
    goalNotFoundQuery:
      filteredGoals.length === 0 && (selection?.goalQuery || selection?.goalName)
        ? selection.goalQuery ?? selection.goalName ?? null
        : null,
    progressSource: selectedPrimary?.progressSource ?? "GOAL_CONTRIBUTIONS",
    contributionActiveMonths: selectedPrimary?.contributionActiveMonths ?? 0,
    contributionMonthStreak: selectedPrimary?.contributionMonthStreak ?? 0,
    trackingStatus: selectedPrimary?.trackingStatus ?? "WATCH"
  });
};
