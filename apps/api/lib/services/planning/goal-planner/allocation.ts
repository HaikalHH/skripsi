import type { GoalPlanCandidate } from "./types";
import { roundToTwoDecimals } from "./utils";

export const buildEqualSplitAllocation = (
  monthlySavingCapacity: number,
  goals: GoalPlanCandidate[]
) => {
  if (!goals.length || monthlySavingCapacity <= 0) return goals;
  const totalWeight = goals.reduce((sum, goal) => sum + goal.priorityScore, 0) || goals.length;
  return goals.map((goal) => {
    const allocation = Math.round((monthlySavingCapacity * goal.priorityScore) / totalWeight);
    return {
      ...goal,
      recommendedAllocation: allocation,
      projectedEtaMonths: allocation > 0 ? roundToTwoDecimals(goal.remainingAmount / allocation) : null
    };
  });
};

export const buildRatioAllocation = (
  monthlySavingCapacity: number,
  goals: GoalPlanCandidate[],
  splitRatio: { primary: number; secondary: number }
) => {
  if (!goals.length || monthlySavingCapacity <= 0) return goals;
  const secondaryGoal = goals[1] ?? null;
  const totalRatio = splitRatio.primary + splitRatio.secondary;
  const primaryAllocation = Math.round((monthlySavingCapacity * splitRatio.primary) / totalRatio);
  const secondaryAllocation = secondaryGoal ? Math.max(0, monthlySavingCapacity - primaryAllocation) : 0;

  return goals.map((goal, index) => {
    const allocation =
      index === 0 ? primaryAllocation : index === 1 ? secondaryAllocation : 0;
    return {
      ...goal,
      recommendedAllocation: allocation,
      projectedEtaMonths: allocation > 0 ? roundToTwoDecimals(goal.remainingAmount / allocation) : null
    };
  });
};

export const buildFocusedAllocation = (
  monthlySavingCapacity: number,
  goals: GoalPlanCandidate[],
  focusGoal: GoalPlanCandidate | null
) => {
  if (!goals.length || monthlySavingCapacity <= 0 || !focusGoal) return goals;

  if (goals.length === 1) {
    return goals.map((goal) => ({
      ...goal,
      recommendedAllocation: monthlySavingCapacity,
      projectedEtaMonths:
        monthlySavingCapacity > 0 ? roundToTwoDecimals(goal.remainingAmount / monthlySavingCapacity) : null
    }));
  }

  const focusAllocation = Math.round(monthlySavingCapacity * 0.7);
  const remainingAllocation = Math.max(0, monthlySavingCapacity - focusAllocation);
  const otherGoals = goals.filter((goal) => goal.goalName !== focusGoal.goalName);
  const otherWeight = otherGoals.reduce((sum, goal) => sum + goal.priorityScore, 0) || otherGoals.length;

  return goals.map((goal) => {
    const allocation =
      goal.goalName === focusGoal.goalName
        ? focusAllocation
        : Math.round((remainingAllocation * goal.priorityScore) / otherWeight);
    return {
      ...goal,
      recommendedAllocation: allocation,
      projectedEtaMonths: allocation > 0 ? roundToTwoDecimals(goal.remainingAmount / allocation) : null
    };
  });
};
