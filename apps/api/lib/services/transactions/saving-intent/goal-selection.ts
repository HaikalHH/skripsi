import { buildGoalIntentDetails } from "@/lib/services/planning/goal-intent";

export const resolveSavingGoalSelection = (rawText: string) => {
  const goalIntent = buildGoalIntentDetails(rawText);
  if (!goalIntent.goalType && !goalIntent.goalName && !goalIntent.goalQuery) {
    return undefined;
  }

  return {
    goalType: goalIntent.goalType,
    goalName: goalIntent.goalName,
    goalQuery: goalIntent.goalQuery ?? goalIntent.goalName
  };
};
