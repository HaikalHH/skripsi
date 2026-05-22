import { FinancialGoalStatus } from "@prisma/client";
import { GOAL_PRIORITY_BASELINE } from "./constants";
import type { GoalRecommendationItem, GoalStatusItem } from "./types";

const buildGoalPriorityWeight = (goal: GoalStatusItem) => {
  const typeWeight = goal.goalType ? GOAL_PRIORITY_BASELINE[goal.goalType] ?? 50 : 50;
  const remainingWeight = goal.remainingAmount > 0 ? Math.max(0, 20 - goal.remainingAmount / 50_000_000) : 25;
  const etaWeight =
    goal.estimatedMonthsToGoal != null
      ? Math.max(0, 18 - Math.min(goal.estimatedMonthsToGoal, 36) / 2)
      : 6;
  const progressWeight = goal.progressPercent >= 70 ? 10 : goal.progressPercent >= 40 ? 6 : 2;
  return Number((typeWeight + remainingWeight + etaWeight + progressWeight).toFixed(2));
};

const compareGoalPriority = (left: GoalStatusItem, right: GoalStatusItem) => {
  const leftHasOrder = left.priorityOrder != null;
  const rightHasOrder = right.priorityOrder != null;

  if (leftHasOrder || rightHasOrder) {
    if (leftHasOrder && rightHasOrder && left.priorityOrder !== right.priorityOrder) {
      return (left.priorityOrder ?? 0) - (right.priorityOrder ?? 0);
    }
    if (leftHasOrder !== rightHasOrder) return leftHasOrder ? -1 : 1;
  }

  if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;

  const typeDiff =
    (right.goalType ? GOAL_PRIORITY_BASELINE[right.goalType] ?? 50 : 50) -
    (left.goalType ? GOAL_PRIORITY_BASELINE[left.goalType] ?? 50 : 50);
  if (typeDiff !== 0) return typeDiff;

  return buildGoalPriorityWeight(right) - buildGoalPriorityWeight(left);
};

export const buildGoalRecommendationPlan = (
  goals: GoalStatusItem[],
  monthlySavingCapacity: number
): GoalRecommendationItem[] => {
  const eligibleGoals = goals.filter(
    (goal) => goal.targetAmount > 0 && goal.remainingAmount > 0 && goal.status !== FinancialGoalStatus.COMPLETED
  );
  if (!eligibleGoals.length || monthlySavingCapacity <= 0) return [];

  const prioritizedGoals = [...eligibleGoals].sort(compareGoalPriority);
  let allocatedSoFar = 0;
  return prioritizedGoals.flatMap((goal) => {
    const remainingCapacity = Math.max(0, monthlySavingCapacity - allocatedSoFar);
    if (remainingCapacity <= 0) return [];

    const recommendedMonthlyContribution = Math.min(
      Math.max(0, Math.round(goal.remainingAmount)),
      Math.round(remainingCapacity)
    );
    if (recommendedMonthlyContribution <= 0) return [];

    allocatedSoFar += recommendedMonthlyContribution;
    const sharePercent = monthlySavingCapacity > 0 ? (recommendedMonthlyContribution / monthlySavingCapacity) * 100 : 0;
    return [{
      goalId: goal.goalId,
      goalName: goal.goalName,
      goalType: goal.goalType,
      recommendedMonthlyContribution,
      sharePercent: Number(sharePercent.toFixed(1))
    }];
  });
};

export const resolveGoalTrackingStatus = (goal: GoalStatusItem) => {
  if (goal.progressSource === "NET_SAVINGS_PROXY") return "WATCH" as const;
  const hasContributionActivity =
    goal.currentProgress > 0 ||
    goal.recentContributionTotal > 0 ||
    goal.contributionMonthStreak > 0 ||
    goal.contributionActiveMonths > 0;
  if (!hasContributionActivity) return "WATCH" as const;
  if (goal.progressPercent >= 100) return "ON_TRACK" as const;

  const recommendedMonthlyContribution = goal.recommendedMonthlyContribution ?? 0;
  const monthlyContributionPace = goal.monthlyContributionPace ?? 0;
  const paceRatio =
    recommendedMonthlyContribution > 0
      ? monthlyContributionPace / recommendedMonthlyContribution
      : 0;

  if (goal.contributionMonthStreak >= 3 || paceRatio >= 0.9) {
    return "ON_TRACK" as const;
  }
  if (
    goal.recentContributionTotal > 0 ||
    goal.contributionMonthStreak >= 1 ||
    paceRatio >= 0.45 ||
    goal.contributionActiveMonths >= 2
  ) {
    return "WATCH" as const;
  }
  return "OFF_TRACK" as const;
};
