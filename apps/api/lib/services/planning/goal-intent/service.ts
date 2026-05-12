import { FinancialGoalType } from "@prisma/client";
import { detectGoalTypeFromText } from "./goal-type-detector";
import {
  buildDefaultGoalName,
  extractContextualGoalName,
  extractCustomTargetName,
  extractVacationName
} from "./goal-name-parser";
import type { GoalIntentDetails } from "./types";

export const buildGoalIntentDetails = (rawText: string): GoalIntentDetails => {
  const goalType = detectGoalTypeFromText(rawText);

  if (goalType === FinancialGoalType.VACATION) {
    return {
      goalType,
      goalName: extractVacationName(rawText) ?? buildDefaultGoalName(goalType),
      goalQuery: extractVacationName(rawText) ?? buildDefaultGoalName(goalType)
    };
  }

  if (goalType) {
    const goalName = buildDefaultGoalName(goalType);
    return {
      goalType,
      goalName,
      goalQuery: goalName
    };
  }

  const customName = extractCustomTargetName(rawText);
  if (customName) {
    return {
      goalType: FinancialGoalType.CUSTOM,
      goalName: customName,
      goalQuery: customName
    };
  }

  const contextualGoalName = extractContextualGoalName(rawText);
  if (contextualGoalName) {
    return {
      goalType: FinancialGoalType.CUSTOM,
      goalName: contextualGoalName,
      goalQuery: contextualGoalName
    };
  }

  return {
    goalType: null,
    goalName: null,
    goalQuery: null
  };
};
