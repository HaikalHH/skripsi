import { FinancialGoalStatus, FinancialGoalType } from "@prisma/client";

export type GoalProgressSource = "GOAL_CONTRIBUTIONS" | "NET_SAVINGS_PROXY";
export type GoalTrackingStatus = "ON_TRACK" | "WATCH" | "OFF_TRACK";

export type GoalStatusItem = {
  goalId: string | null;
  goalName: string;
  goalType: FinancialGoalType | null;
  priorityOrder: number | null;
  targetAmount: number;
  currentProgress: number;
  remainingAmount: number;
  progressPercent: number;
  estimatedMonthsToGoal: number | null;
  monthlyContributionPace: number | null;
  recommendedMonthlyContribution: number | null;
  recommendedAllocationShare: number | null;
  recentContributionTotal: number;
  lastContributionAt: Date | null;
  contributionActiveMonths: number;
  contributionMonthStreak: number;
  trackingStatus: GoalTrackingStatus;
  status: FinancialGoalStatus | "LEGACY";
  isPrimary: boolean;
  progressSource: GoalProgressSource;
};

export type GoalRecommendationItem = {
  goalId: string | null;
  goalName: string;
  goalType: FinancialGoalType | null;
  recommendedMonthlyContribution: number;
  sharePercent: number;
};

export type GoalStatusSummary = {
  goalName: string | null;
  goalType: FinancialGoalType | null;
  targetAmount: number;
  currentProgress: number;
  remainingAmount: number;
  progressPercent: number;
  estimatedMonthsToGoal: number | null;
  monthlyContributionPace: number | null;
  totalGoals: number;
  goals: GoalStatusItem[];
  monthlySavingCapacity: number | null;
  recommendedPlan: GoalRecommendationItem[];
  goalNotFoundQuery?: string | null;
  progressSource: GoalProgressSource;
  contributionActiveMonths: number;
  contributionMonthStreak: number;
  trackingStatus: GoalTrackingStatus;
};

export type GoalSelection = {
  goalName?: string | null;
  goalType?: FinancialGoalType | null;
  goalQuery?: string | null;
  targetMonth?: number | null;
  targetYear?: number | null;
};
