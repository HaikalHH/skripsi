import { FinancialGoalStatus, FinancialGoalType } from "@prisma/client";
import { getFinancialGoalModel, getSavingsGoalModel } from "./data-access";
import { getGoalContributionProgress } from "./contribution-progress";
import { isSupportedFinancialGoalType } from "./constants";
import type { GoalStatusItem } from "./types";
import { toNumber } from "./utils";

export const syncLegacySavingsGoal = async (userId: string, primaryGoal: GoalStatusItem | null) => {
  const savingsGoalModel = getSavingsGoalModel();
  if (!savingsGoalModel || !primaryGoal || primaryGoal.targetAmount <= 0) return;

  await savingsGoalModel.upsert({
    where: { userId },
    update: {
      targetAmount: primaryGoal.targetAmount,
      currentProgress: primaryGoal.currentProgress
    },
    create: {
      userId,
      targetAmount: primaryGoal.targetAmount,
      currentProgress: primaryGoal.currentProgress
    }
  });
};

export const syncFinancialGoalEstimates = async (userId: string, monthlySavingCapacity: number) => {
  const financialGoalModel = getFinancialGoalModel();
  if (!financialGoalModel) return;

  const [goals, contributionProgress] = await Promise.all([
    financialGoalModel.findMany({
      where: {
        userId,
        status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] }
      }
    }),
    getGoalContributionProgress(userId)
  ]);

  await Promise.all(
    goals
      .filter((goal: any) => isSupportedFinancialGoalType(goal.goalType as FinancialGoalType))
      .map((goal: any) => {
        const targetAmount = toNumber(goal.targetAmount ?? 0);
        const goalCurrentProgress = contributionProgress.hasAnyContributions
          ? contributionProgress.totalByGoal.get(goal.id) ?? 0
          : 0;
        const remainingAmount = contributionProgress.hasAnyContributions
          ? Math.max(0, targetAmount - goalCurrentProgress)
          : targetAmount;
        const goalMonthlyPace =
          contributionProgress.monthlyPaceByGoal.get(goal.id) ??
          (contributionProgress.hasAnyContributions ? null : monthlySavingCapacity);
        const estimatedMonthsToGoal =
          remainingAmount > 0 && goalMonthlyPace && goalMonthlyPace > 0
            ? Number((remainingAmount / goalMonthlyPace).toFixed(2))
            : null;

        return financialGoalModel.update({
          where: { id: goal.id },
          data: {
            estimatedMonthsToGoal
          }
        });
      })
  );
};
