import {
  FinancialGoalType,
  GoalExecutionMode,
  OnboardingQuestionKey,
  OnboardingStep,
  type OnboardingSession
} from "@prisma/client";
import {
  GOAL_NONE_VALUE,
  GOAL_OPTIONS
} from "@/lib/services/onboarding/flow/shared/questions/answer-options";
import type {
  GoalExpenseStrategyValue,
  GoalSelectionValue
} from "@/lib/services/onboarding/flow/shared/questions/question-types";
import {
  getSessionNormalizedValue,
  latestSessionForQuestion,
  type SessionAnswerValue
} from "@/lib/services/onboarding/flow/shared/answers/common-input";
import { parseGoalSelection } from "@/lib/services/onboarding/flow/shared/answers/choice-parsers";
import {
  getGoalTargetAnswerFromStoredValue,
  type MonthYearTargetAnswer
} from "@/lib/services/onboarding/flow/shared/answers/goal-target-date-parser";
import { normalizeLooseText } from "@/lib/services/onboarding/flow/shared/intent/onboarding-intent-service";
import {
  getConfirmedSessions,
  normalizeStoredValues
} from "@/lib/services/onboarding/flow/helpers/session-values";

export type PendingGoalDetail = {
  step: OnboardingStep;
  goalType: FinancialGoalType;
};

export type GoalPrioritySelection = {
  goalType: FinancialGoalType;
  goalName: string;
};

export type GoalRecommendationSelection = GoalPrioritySelection & {
  targetMonth: number | null;
  targetYear: number | null;
  monthsFromNow: number | null;
};

export type StoredGoalPriorityOrderAnswer = {
  priorityOrder: GoalRecommendationSelection[];
  executionMode: GoalExecutionMode | null;
  priorityGoalType: FinancialGoalType | null;
};

export const isStoredGoalPriorityOrderAnswer = (
  value: unknown
): value is StoredGoalPriorityOrderAnswer => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.priorityOrder) &&
    candidate.priorityOrder.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).goalType === "string" &&
        typeof (item as Record<string, unknown>).goalName === "string"
    ) &&
    (candidate.executionMode === null || typeof candidate.executionMode === "string") &&
    (candidate.priorityGoalType === null || typeof candidate.priorityGoalType === "string")
  );
};

export type GoalPlanRecommendation = {
  executionMode: GoalExecutionMode | null;
  priorityGoalType: FinancialGoalType | null;
  orderedGoals: GoalPrioritySelection[];
  orderedGoalDetails: GoalRecommendationSelection[];
};

const ACTIVE_GOAL_SELECTION_VALUES = new Set(GOAL_OPTIONS.map((option) => option.value));

const isActiveGoalSelectionValue = (value: unknown): value is FinancialGoalType =>
  typeof value === "string" && ACTIVE_GOAL_SELECTION_VALUES.has(value);

const goalNameFromType = (goalType: FinancialGoalType) => {
  switch (goalType) {
    case FinancialGoalType.EMERGENCY_FUND:
      return "Dana Darurat";
    case FinancialGoalType.HOUSE:
      return "Beli Rumah";
    case FinancialGoalType.VEHICLE:
      return "Beli Kendaraan";
    case FinancialGoalType.VACATION:
      return "Liburan";
    case FinancialGoalType.CUSTOM:
      return "Custom Target";
    default:
      return "Target Keuangan";
  }
};

const goalNeedsTargetAmount = (goalType: FinancialGoalType) =>
  goalType === FinancialGoalType.HOUSE ||
  goalType === FinancialGoalType.VEHICLE ||
  goalType === FinancialGoalType.VACATION ||
  goalType === FinancialGoalType.CUSTOM;

const goalNeedsTargetDate = goalNeedsTargetAmount;

export const getSelectedGoalTypes = (sessions: OnboardingSession[]) =>
  getConfirmedSessions(sessions)
    .filter((item) => item.questionKey === OnboardingQuestionKey.GOAL_SELECTION)
    .flatMap((item) =>
      normalizeStoredValues(
        getSessionNormalizedValue<GoalSelectionValue | GoalSelectionValue[]>(item)
      )
    )
    .filter((value): value is FinancialGoalType => isActiveGoalSelectionValue(value));

export const getLatestCustomGoalName = (sessions: OnboardingSession[]) =>
  getSessionNormalizedValue<string>(
    latestSessionForQuestion(
      getConfirmedSessions(sessions),
      OnboardingQuestionKey.GOAL_CUSTOM_NAME
    )
  );

export const parseGoalPriorityFocus = (
  raw: unknown,
  sessions: OnboardingSession[]
): FinancialGoalType | null => {
  const parsedSelection = parseGoalSelection(raw);
  if (parsedSelection && parsedSelection !== GOAL_NONE_VALUE) {
    return parsedSelection;
  }

  if (typeof raw !== "string") return null;

  const normalized = normalizeLooseText(raw).replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const selectedGoals = getSelectedGoalTypes(sessions);
  if (selectedGoals.includes(FinancialGoalType.CUSTOM)) {
    const customName = getLatestCustomGoalName(sessions);
    if (customName) {
      const normalizedCustomName = normalizeLooseText(customName).replace(/\s+/g, " ").trim();
      if (
        normalized === normalizedCustomName ||
        normalized.includes(normalizedCustomName) ||
        normalizedCustomName.includes(normalized)
      ) {
        return FinancialGoalType.CUSTOM;
      }
    }
  }

  return null;
};

export const getPendingGoalDetail = (sessions: OnboardingSession[]): PendingGoalDetail | null => {
  const confirmedSessions = getConfirmedSessions(sessions);
  const selectedGoals = getSelectedGoalTypes(confirmedSessions);

  let remainingCustomNames = confirmedSessions.filter(
    (item) => item.questionKey === OnboardingQuestionKey.GOAL_CUSTOM_NAME
  ).length;
  let remainingTargetAmounts = confirmedSessions.filter(
    (item) => item.questionKey === OnboardingQuestionKey.GOAL_TARGET_AMOUNT
  ).length;
  let remainingTargetDates = confirmedSessions.filter(
    (item) => item.questionKey === OnboardingQuestionKey.GOAL_TARGET_DATE
  ).length;

  for (const goalType of selectedGoals) {
    if (goalType === FinancialGoalType.CUSTOM) {
      if (remainingCustomNames <= 0) {
        return { step: OnboardingStep.ASK_GOAL_CUSTOM_NAME, goalType };
      }
      remainingCustomNames -= 1;
    }

    if (goalNeedsTargetAmount(goalType)) {
      if (remainingTargetAmounts <= 0) {
        return { step: OnboardingStep.ASK_GOAL_TARGET_AMOUNT, goalType };
      }
      remainingTargetAmounts -= 1;
    }

    if (goalNeedsTargetDate(goalType)) {
      if (remainingTargetDates <= 0) {
        return { step: OnboardingStep.ASK_GOAL_TARGET_DATE, goalType };
      }
      remainingTargetDates -= 1;
    }
  }

  return null;
};

export const getCurrentGoalType = (sessions: OnboardingSession[]) => {
  const pendingDetail = getPendingGoalDetail(sessions);
  if (pendingDetail) return pendingDetail.goalType;

  const latestSelection = latestSessionForQuestion(
    getConfirmedSessions(sessions),
    OnboardingQuestionKey.GOAL_SELECTION
  );
  const values = normalizeStoredValues(
    getSessionNormalizedValue<GoalSelectionValue | GoalSelectionValue[]>(latestSelection)
  ).filter((item): item is FinancialGoalType => Boolean(item) && item !== GOAL_NONE_VALUE);
  return values.at(-1) ?? null;
};

export const getGoalExpenseStrategy = (sessions: OnboardingSession[]) =>
  getSessionNormalizedValue<GoalExpenseStrategyValue>(
    latestSessionForQuestion(
      getConfirmedSessions(sessions),
      OnboardingQuestionKey.GOAL_EXPENSE_STRATEGY
    )
  );

const buildGoalRecommendationSelections = (
  sessions: OnboardingSession[]
): GoalRecommendationSelection[] => {
  const confirmedSessions = getConfirmedSessions(sessions);
  const selectedGoalTypes = getSelectedGoalTypes(confirmedSessions);
  const customNames = confirmedSessions
    .filter((item) => item.questionKey === OnboardingQuestionKey.GOAL_CUSTOM_NAME)
    .map((item) => getSessionNormalizedValue<string>(item))
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  const targetDates = confirmedSessions
    .filter((item) => item.questionKey === OnboardingQuestionKey.GOAL_TARGET_DATE)
    .map((item) =>
      getGoalTargetAnswerFromStoredValue(getSessionNormalizedValue<SessionAnswerValue>(item))
    )
    .filter((item): item is MonthYearTargetAnswer => {
      if (!item) return false;
      return (
        typeof item.month === "number" &&
        typeof item.year === "number" &&
        typeof item.monthsFromNow === "number"
      );
    });

  let customIndex = 0;
  let targetDateIndex = 0;

  const selections = selectedGoalTypes
    .filter((value): value is FinancialGoalType => Boolean(value))
    .map((goalType) => {
      const targetDate = goalNeedsTargetDate(goalType) ? targetDates[targetDateIndex] ?? null : null;
      if (goalNeedsTargetDate(goalType)) {
        targetDateIndex += 1;
      }

      if (goalType === FinancialGoalType.CUSTOM) {
        const goalName = customNames[customIndex] ?? goalNameFromType(goalType);
        customIndex += 1;
        return {
          goalType,
          goalName,
          targetMonth: targetDate?.month ?? null,
          targetYear: targetDate?.year ?? null,
          monthsFromNow: targetDate?.monthsFromNow ?? null
        };
      }

      return {
        goalType,
        goalName: goalNameFromType(goalType),
        targetMonth: targetDate?.month ?? null,
        targetYear: targetDate?.year ?? null,
        monthsFromNow: targetDate?.monthsFromNow ?? null
      };
    });

  return selections
    .map((goal, index) => ({
      goal,
      index
    }))
    .sort((left, right) => {
      const getPriorityBucket = (goal: GoalRecommendationSelection) => {
        if (goal.goalType === FinancialGoalType.EMERGENCY_FUND) return 0;
        return goal.monthsFromNow !== null ? 1 : 2;
      };

      const leftBucket = getPriorityBucket(left.goal);
      const rightBucket = getPriorityBucket(right.goal);
      if (leftBucket !== rightBucket) {
        return leftBucket - rightBucket;
      }

      if (
        left.goal.monthsFromNow !== null &&
        right.goal.monthsFromNow !== null &&
        left.goal.monthsFromNow !== right.goal.monthsFromNow
      ) {
        return left.goal.monthsFromNow - right.goal.monthsFromNow;
      }

      return left.index - right.index;
    })
    .map(({ goal }) => goal);
};

export const getGoalPlanRecommendation = (
  sessions: OnboardingSession[]
): GoalPlanRecommendation => {
  const confirmedSessions = getConfirmedSessions(sessions);
  const explicitExecutionMode = getSessionNormalizedValue<GoalExecutionMode>(
    latestSessionForQuestion(confirmedSessions, OnboardingQuestionKey.GOAL_ALLOCATION_MODE)
  );
  const recommendedGoals = buildGoalRecommendationSelections(sessions);

  if (!recommendedGoals.length) {
    return {
      executionMode: null,
      priorityGoalType: null,
      orderedGoals: [],
      orderedGoalDetails: []
    };
  }

  const orderedGoalDetails = [...recommendedGoals];

  return {
    executionMode:
      orderedGoalDetails.length > 1
        ? explicitExecutionMode ?? GoalExecutionMode.SEQUENTIAL
        : null,
    priorityGoalType: orderedGoalDetails[0]?.goalType ?? null,
    orderedGoals: orderedGoalDetails.map(({ goalType, goalName }) => ({
      goalType,
      goalName
    })),
    orderedGoalDetails
  };
};

export const hasExpenseDependentGoalSelection = (sessions: OnboardingSession[]) =>
  getSelectedGoalTypes(sessions).some(
    (goalType) => goalType === FinancialGoalType.EMERGENCY_FUND
  );
