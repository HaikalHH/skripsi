import { FinancialGoalStatus, FinancialGoalType } from "@prisma/client";
import { getFinancialGoalModel, getMonthlySavingCapacity } from "./data-access";
import { getGoalContributionProgress } from "./contribution-progress";
import { isSupportedFinancialGoalType } from "./constants";
import { buildGoalItem } from "./status-builders";
import { buildGoalRecommendationPlan, resolveGoalTrackingStatus } from "./recommendations";
import type { GoalRecommendationItem, GoalStatusItem } from "./types";
import { pickPrimaryGoal, toNumber } from "./utils";

export const getFinancialGoalStatuses = async (userId: string) => {
  const financialGoalModel = getFinancialGoalModel();
  if (!financialGoalModel) return [];

  const [goals, monthlySavingCapacity, contributionProgress] = await Promise.all([
    financialGoalModel.findMany({
      where: {
        userId,
        status: {
          in: [
            FinancialGoalStatus.ACTIVE,
            FinancialGoalStatus.PENDING_CALCULATION,
            FinancialGoalStatus.COMPLETED
          ]
        }
      },
      orderBy: [{ priorityOrder: "asc" }, { createdAt: "asc" }]
    }),
    getMonthlySavingCapacity(userId),
    getGoalContributionProgress(userId)
  ]);

  const eligibleGoals = goals.filter(
    (goal: any) =>
      isSupportedFinancialGoalType(goal.goalType as FinancialGoalType) &&
      toNumber(goal.targetAmount ?? 0) > 0
  );
  if (!eligibleGoals.length) return [];

  const primary = pickPrimaryGoal(eligibleGoals);

  const rawItems = eligibleGoals.map((goal: any) => {
    const targetAmount = toNumber(goal.targetAmount);
    const contributionProgressValue = contributionProgress.totalByGoal.get(goal.id) ?? 0;
    const currentProgress = contributionProgressValue;
    const monthlyContributionPace = contributionProgress.monthlyPaceByGoal.get(goal.id) ?? null;
    const remainingAmount = Math.max(0, targetAmount - currentProgress);
    const projectionPace =
      monthlyContributionPace && monthlyContributionPace > 0
        ? monthlyContributionPace
        : monthlySavingCapacity;
    const estimatedMonthsToGoal =
      goal.estimatedMonthsToGoal !== null
        ? toNumber(goal.estimatedMonthsToGoal)
        : projectionPace && projectionPace > 0
          ? Number((remainingAmount / projectionPace).toFixed(2))
          : null;

    return buildGoalItem({
      goalId: goal.id,
      goalName: goal.goalName,
      goalType: goal.goalType as FinancialGoalType,
      priorityOrder: goal.priorityOrder,
      targetAmount,
      currentProgress,
      estimatedMonthsToGoal,
      monthlyContributionPace,
      recentContributionTotal: contributionProgress.recentTotalByGoal.get(goal.id) ?? 0,
      lastContributionAt: contributionProgress.lastContributionAtByGoal.get(goal.id) ?? null,
      contributionActiveMonths: contributionProgress.activeMonthsByGoal.get(goal.id) ?? 0,
      contributionMonthStreak: contributionProgress.monthStreakByGoal.get(goal.id) ?? 0,
      status: goal.status,
      isPrimary: primary?.id === goal.id,
      progressSource: "GOAL_CONTRIBUTIONS"
    });
  });

  const recommendationPlan = buildGoalRecommendationPlan(rawItems, monthlySavingCapacity);
  const recommendationByGoalId = new Map(
    recommendationPlan.map((item: GoalRecommendationItem) => [item.goalId ?? item.goalName, item])
  );

  return rawItems.map((item: GoalStatusItem) => {
    const recommendation =
      recommendationByGoalId.get(item.goalId ?? item.goalName) ?? null;
    return {
      ...item,
      recommendedMonthlyContribution: recommendation?.recommendedMonthlyContribution ?? null,
      recommendedAllocationShare: recommendation?.sharePercent ?? null,
      trackingStatus: resolveGoalTrackingStatus({
        ...item,
        recommendedMonthlyContribution: recommendation?.recommendedMonthlyContribution ?? null,
        recommendedAllocationShare: recommendation?.sharePercent ?? null
      })
    };
  });
};
