import { getGoalContributionModel } from "./data-access";
import { toNumber } from "./utils";

const GOAL_PACE_WINDOW_DAYS = 90;
const GOAL_RECENT_WINDOW_DAYS = 30;

export type GoalContributionProgress = {
  hasAnyContributions: boolean;
  totalByGoal: Map<string, number>;
  monthlyPaceByGoal: Map<string, number>;
  recentTotalByGoal: Map<string, number>;
  lastContributionAtByGoal: Map<string, Date>;
  activeMonthsByGoal: Map<string, number>;
  monthStreakByGoal: Map<string, number>;
};

const buildEmptyContributionProgress = (): GoalContributionProgress => ({
  hasAnyContributions: false,
  totalByGoal: new Map<string, number>(),
  monthlyPaceByGoal: new Map<string, number>(),
  recentTotalByGoal: new Map<string, number>(),
  lastContributionAtByGoal: new Map<string, Date>(),
  activeMonthsByGoal: new Map<string, number>(),
  monthStreakByGoal: new Map<string, number>()
});

export const getGoalContributionProgress = async (
  userId: string
): Promise<GoalContributionProgress> => {
  const goalContributionModel = getGoalContributionModel();
  if (!goalContributionModel) {
    return buildEmptyContributionProgress();
  }

  const contributions = await goalContributionModel.findMany({
    where: { userId },
    select: {
      goalId: true,
      amount: true,
      occurredAt: true
    }
  });

  const totalByGoal = new Map<string, number>();
  const monthlyPaceByGoal = new Map<string, number>();
  const recentTotalByGoal = new Map<string, number>();
  const lastContributionAtByGoal = new Map<string, Date>();
  const monthKeysByGoal = new Map<string, Set<string>>();
  const windowStart = new Date();
  windowStart.setUTCDate(windowStart.getUTCDate() - GOAL_PACE_WINDOW_DAYS);
  const recentWindowStart = new Date();
  recentWindowStart.setUTCDate(recentWindowStart.getUTCDate() - GOAL_RECENT_WINDOW_DAYS);

  for (const contribution of contributions) {
    const amount = Math.max(0, toNumber(contribution.amount));
    if (amount <= 0) continue;

    totalByGoal.set(contribution.goalId, (totalByGoal.get(contribution.goalId) ?? 0) + amount);

    if (contribution.occurredAt >= windowStart) {
      monthlyPaceByGoal.set(
        contribution.goalId,
        (monthlyPaceByGoal.get(contribution.goalId) ?? 0) + amount
      );
    }
    if (contribution.occurredAt >= recentWindowStart) {
      recentTotalByGoal.set(
        contribution.goalId,
        (recentTotalByGoal.get(contribution.goalId) ?? 0) + amount
      );
    }
    const latestContribution = lastContributionAtByGoal.get(contribution.goalId);
    if (!latestContribution || contribution.occurredAt > latestContribution) {
      lastContributionAtByGoal.set(contribution.goalId, contribution.occurredAt);
    }
    const monthKey = `${contribution.occurredAt.getUTCFullYear()}-${String(
      contribution.occurredAt.getUTCMonth() + 1
    ).padStart(2, "0")}`;
    const goalMonthSet = monthKeysByGoal.get(contribution.goalId) ?? new Set<string>();
    goalMonthSet.add(monthKey);
    monthKeysByGoal.set(contribution.goalId, goalMonthSet);
  }

  for (const [goalId, rollingAmount] of monthlyPaceByGoal.entries()) {
    monthlyPaceByGoal.set(goalId, (rollingAmount / GOAL_PACE_WINDOW_DAYS) * 30);
  }

  const activeMonthsByGoal = new Map<string, number>();
  const monthStreakByGoal = new Map<string, number>();
  const currentMonthIndex = new Date().getUTCFullYear() * 12 + new Date().getUTCMonth();
  for (const [goalId, monthKeys] of monthKeysByGoal.entries()) {
    activeMonthsByGoal.set(goalId, monthKeys.size);
    let streak = 0;
    for (let offset = 0; offset < 6; offset += 1) {
      const monthIndex = currentMonthIndex - offset;
      const year = Math.floor(monthIndex / 12);
      const month = monthIndex % 12;
      const key = `${year}-${String(month + 1).padStart(2, "0")}`;
      if (monthKeys.has(key)) {
        streak += 1;
        continue;
      }
      if (offset === 0) {
        break;
      }
      if (streak > 0) {
        break;
      }
    }
    monthStreakByGoal.set(goalId, streak);
  }

  return {
    hasAnyContributions: contributions.length > 0,
    totalByGoal,
    monthlyPaceByGoal,
    recentTotalByGoal,
    lastContributionAtByGoal,
    activeMonthsByGoal,
    monthStreakByGoal
  };
};
