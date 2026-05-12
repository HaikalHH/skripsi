export type GoalStatus = {
  goalName?: string | null;
  totalGoals?: number;
  goalNotFoundQuery?: string | null;
  targetAmount: number;
  currentProgress: number;
  remainingAmount: number;
  progressPercent: number;
  estimatedMonthsToGoal?: number | null;
  monthlyContributionPace?: number | null;
  progressSource?: "GOAL_CONTRIBUTIONS" | "NET_SAVINGS_PROXY";
};
