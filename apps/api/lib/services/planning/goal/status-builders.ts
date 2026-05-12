import { FinancialGoalStatus, FinancialGoalType } from "@prisma/client";
import type {
  GoalProgressSource,
  GoalRecommendationItem,
  GoalStatusItem,
  GoalStatusSummary,
  GoalTrackingStatus
} from "./types";
import { clampProgressPercent } from "./utils";

export const buildGoalStatus = (params: {
  goalName: string | null;
  goalType: FinancialGoalType | null;
  targetAmount: number;
  currentProgress: number;
  estimatedMonthsToGoal?: number | null;
  monthlyContributionPace?: number | null;
  totalGoals?: number;
  goals?: GoalStatusItem[];
  monthlySavingCapacity?: number | null;
  recommendedPlan?: GoalRecommendationItem[];
  goalNotFoundQuery?: string | null;
  progressSource?: GoalProgressSource;
  contributionActiveMonths?: number;
  contributionMonthStreak?: number;
  trackingStatus?: GoalTrackingStatus;
}): GoalStatusSummary => {
  const target = Math.max(0, params.targetAmount);
  const progress = Math.max(0, params.currentProgress);

  return {
    goalName: params.goalName ?? null,
    goalType: params.goalType ?? null,
    targetAmount: target,
    currentProgress: progress,
    remainingAmount: Math.max(0, target - progress),
    progressPercent: clampProgressPercent(target, progress),
    estimatedMonthsToGoal:
      params.estimatedMonthsToGoal != null && Number.isFinite(params.estimatedMonthsToGoal)
        ? Math.max(0, params.estimatedMonthsToGoal)
        : null,
    monthlyContributionPace:
      params.monthlyContributionPace != null && Number.isFinite(params.monthlyContributionPace)
        ? Math.max(0, params.monthlyContributionPace)
        : null,
    totalGoals: params.totalGoals ?? params.goals?.length ?? 0,
    goals: params.goals ?? [],
    monthlySavingCapacity:
      params.monthlySavingCapacity != null && Number.isFinite(params.monthlySavingCapacity)
        ? Math.max(0, params.monthlySavingCapacity)
        : null,
    recommendedPlan: params.recommendedPlan ?? [],
    goalNotFoundQuery: params.goalNotFoundQuery ?? null,
    progressSource: params.progressSource ?? "GOAL_CONTRIBUTIONS",
    contributionActiveMonths: params.contributionActiveMonths ?? 0,
    contributionMonthStreak: params.contributionMonthStreak ?? 0,
    trackingStatus: params.trackingStatus ?? "WATCH"
  };
};

export const buildGoalItem = (params: {
  goalId?: string | null;
  goalName: string;
  goalType: FinancialGoalType | null;
  targetAmount: number;
  currentProgress: number;
  estimatedMonthsToGoal: number | null;
  monthlyContributionPace: number | null;
  recommendedMonthlyContribution?: number | null;
  recommendedAllocationShare?: number | null;
  recentContributionTotal?: number;
  lastContributionAt?: Date | null;
  status: FinancialGoalStatus | "LEGACY";
  isPrimary: boolean;
  progressSource: GoalProgressSource;
  contributionActiveMonths?: number;
  contributionMonthStreak?: number;
  trackingStatus?: GoalTrackingStatus;
  priorityOrder?: number | null;
}): GoalStatusItem => ({
  goalId: params.goalId ?? null,
  goalName: params.goalName,
  goalType: params.goalType,
  priorityOrder:
    params.priorityOrder != null && Number.isFinite(params.priorityOrder)
      ? Math.max(0, params.priorityOrder)
      : null,
  targetAmount: params.targetAmount,
  currentProgress: Math.max(0, params.currentProgress),
  remainingAmount: Math.max(0, params.targetAmount - params.currentProgress),
  progressPercent: clampProgressPercent(params.targetAmount, params.currentProgress),
  estimatedMonthsToGoal:
    params.estimatedMonthsToGoal != null && Number.isFinite(params.estimatedMonthsToGoal)
      ? Math.max(0, params.estimatedMonthsToGoal)
      : null,
  monthlyContributionPace:
    params.monthlyContributionPace != null && Number.isFinite(params.monthlyContributionPace)
      ? Math.max(0, params.monthlyContributionPace)
      : null,
  recommendedMonthlyContribution:
    params.recommendedMonthlyContribution != null && Number.isFinite(params.recommendedMonthlyContribution)
      ? Math.max(0, params.recommendedMonthlyContribution)
      : null,
  recommendedAllocationShare:
    params.recommendedAllocationShare != null && Number.isFinite(params.recommendedAllocationShare)
      ? Math.max(0, Math.min(100, params.recommendedAllocationShare))
      : null,
  recentContributionTotal: Math.max(0, params.recentContributionTotal ?? 0),
  lastContributionAt: params.lastContributionAt ?? null,
  contributionActiveMonths: Math.max(0, params.contributionActiveMonths ?? 0),
  contributionMonthStreak: Math.max(0, params.contributionMonthStreak ?? 0),
  trackingStatus: params.trackingStatus ?? "WATCH",
  status: params.status,
  isPrimary: params.isPrimary,
  progressSource: params.progressSource
});
