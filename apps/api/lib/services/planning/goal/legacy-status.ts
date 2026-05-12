import { calculateRecordedSavingTotal, getMonthlySavingCapacity, getSavingsGoalModel } from "./data-access";
import { buildGoalItem, buildGoalStatus } from "./status-builders";
import type { GoalStatusSummary } from "./types";
import { toNumber } from "./utils";

export const getLegacyGoalStatus = async (userId: string): Promise<GoalStatusSummary> => {
  const savingsGoalModel = getSavingsGoalModel();
  const [monthlySavingCapacity, recordedSavingTotal] = await Promise.all([
    getMonthlySavingCapacity(userId),
    calculateRecordedSavingTotal(userId)
  ]);
  const existingLegacyGoal =
    savingsGoalModel?.findUnique != null
      ? await savingsGoalModel.findUnique({
          where: { userId },
          select: {
            targetAmount: true,
            currentProgress: true
          }
        })
      : null;
  const explicitLegacyProgress = Math.max(
    toNumber(existingLegacyGoal?.currentProgress ?? 0),
    recordedSavingTotal
  );
  const resolvedLegacyProgress = explicitLegacyProgress;

  if (!savingsGoalModel) {
    return buildGoalStatus({
      goalName: null,
      goalType: null,
      targetAmount: 0,
      currentProgress: resolvedLegacyProgress,
      monthlyContributionPace: monthlySavingCapacity,
      monthlySavingCapacity,
      progressSource: "GOAL_CONTRIBUTIONS"
    });
  }

  const goal = await savingsGoalModel.upsert({
    where: { userId },
    update:
      savingsGoalModel.findUnique != null
        ? {
            currentProgress: resolvedLegacyProgress
          }
        : {},
    create: {
      userId,
      targetAmount: 0,
      currentProgress: resolvedLegacyProgress
    }
  });

  const goalItem = buildGoalItem({
    goalId: null,
    goalName: "Target Tabungan",
    goalType: null,
    priorityOrder: null,
    targetAmount: toNumber(goal.targetAmount),
    currentProgress: toNumber(goal.currentProgress),
    estimatedMonthsToGoal: null,
    monthlyContributionPace: monthlySavingCapacity,
    recommendedMonthlyContribution: monthlySavingCapacity > 0 ? monthlySavingCapacity : null,
    recommendedAllocationShare: monthlySavingCapacity > 0 ? 100 : null,
    status: "LEGACY",
    isPrimary: true,
    contributionActiveMonths: 0,
    contributionMonthStreak: 0,
    trackingStatus: "WATCH",
    progressSource: "GOAL_CONTRIBUTIONS"
  });

  return buildGoalStatus({
    goalName: goalItem.goalName,
    goalType: goalItem.goalType,
    targetAmount: goalItem.targetAmount,
    currentProgress: goalItem.currentProgress,
    estimatedMonthsToGoal: goalItem.estimatedMonthsToGoal,
    monthlyContributionPace: goalItem.monthlyContributionPace,
    totalGoals: 1,
    monthlySavingCapacity,
    goals: [goalItem],
    recommendedPlan:
      monthlySavingCapacity > 0
        ? [
            {
              goalId: null,
              goalName: goalItem.goalName,
              goalType: goalItem.goalType,
              recommendedMonthlyContribution: monthlySavingCapacity,
              sharePercent: 100
            }
          ]
        : [],
    progressSource: "GOAL_CONTRIBUTIONS",
    contributionActiveMonths: goalItem.contributionActiveMonths,
    contributionMonthStreak: goalItem.contributionMonthStreak,
    trackingStatus: goalItem.trackingStatus
  });
};
