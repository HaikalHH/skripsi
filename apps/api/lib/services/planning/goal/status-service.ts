import { getMonthlySavingCapacity } from "./data-access";
import { getFinancialGoalStatuses } from "./financial-goal-statuses";
import { getLegacyGoalStatus } from "./legacy-status";
import { summarizeGoalStatuses } from "./summary";
import { syncFinancialGoalEstimates, syncLegacySavingsGoal } from "./sync";
import type { GoalSelection } from "./types";

export const refreshSavingsGoalProgress = async (userId: string) => {
  const goalItems = await getFinancialGoalStatuses(userId);
  if (goalItems.length) {
    const monthlySavingCapacity = await getMonthlySavingCapacity(userId);
    await syncFinancialGoalEstimates(userId, monthlySavingCapacity);
    const summary = summarizeGoalStatuses(goalItems, undefined, monthlySavingCapacity);
    const primary = summary.goals.find((goal) => goal.isPrimary) ?? summary.goals[0] ?? null;
    await syncLegacySavingsGoal(userId, primary);
    return summary;
  }

  return getLegacyGoalStatus(userId);
};

export const getSavingsGoalStatus = async (userId: string, selection?: GoalSelection) => {
  const goalItems = await getFinancialGoalStatuses(userId);
  if (goalItems.length) {
    const monthlySavingCapacity = await getMonthlySavingCapacity(userId);
    const summary = summarizeGoalStatuses(goalItems, selection, monthlySavingCapacity);
    const primary = summary.goals.find((goal) => goal.isPrimary) ?? summary.goals[0] ?? null;
    await syncLegacySavingsGoal(userId, primary);
    return summary;
  }

  return getLegacyGoalStatus(userId);
};
