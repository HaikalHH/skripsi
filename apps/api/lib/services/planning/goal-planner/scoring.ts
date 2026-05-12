import { FinancialGoalType } from "@prisma/client";
import type { GoalStatusSummary } from "@/lib/services/planning/goal";
import { DEFAULT_FINANCIAL_GOAL_PRIORITY_ORDER, PRIORITY_BASELINE } from "./constants";
import type { GoalPlanCandidate } from "./types";

export const buildGoalPriorityScore = (goal: GoalStatusSummary["goals"][number]) => {
  const userPriorityBoost =
    typeof goal.priorityOrder === "number" &&
    Number.isFinite(goal.priorityOrder) &&
    goal.priorityOrder < DEFAULT_FINANCIAL_GOAL_PRIORITY_ORDER
      ? Math.max(0, 42 - goal.priorityOrder * 8)
      : 0;
  const typeScore = goal.goalType ? PRIORITY_BASELINE[goal.goalType] ?? 50 : 50;
  const remainingWeight = goal.remainingAmount > 0 ? Math.max(0, 20 - goal.remainingAmount / 50_000_000) : 25;
  const etaWeight =
    goal.estimatedMonthsToGoal != null
      ? Math.max(0, 18 - Math.min(goal.estimatedMonthsToGoal, 36) / 2)
      : 6;
  const progressWeight = goal.progressPercent >= 70 ? 10 : goal.progressPercent >= 40 ? 6 : 2;

  return Number((userPriorityBoost + typeScore + remainingWeight + etaWeight + progressWeight).toFixed(2));
};

export const buildPriorityReason = (goal: GoalPlanCandidate) => {
  if (goal.goalType === FinancialGoalType.EMERGENCY_FUND) {
    return "buffer dasar penting sebelum ngegas target lain";
  }
  if (goal.estimatedMonthsToGoal != null && goal.estimatedMonthsToGoal <= 12) {
    return "target ini paling cepat terasa kalau dikejar sekarang";
  }
  if (goal.progressPercent >= 60) {
    return "progress-nya sudah lumayan, jadi paling dekat buat dituntaskan";
  }
  if (goal.goalType === FinancialGoalType.HOUSE) {
    return "butuh nominal besar, jadi lebih aman mulai dicicil konsisten dari sekarang";
  }
  return "target ini cukup realistis untuk dikejar sambil menjaga cashflow";
};
