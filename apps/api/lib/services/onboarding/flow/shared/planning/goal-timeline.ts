import { FinancialGoalType, OnboardingQuestionKey, type OnboardingSession } from "@prisma/client";
import type {
  OnboardingPlanningAnalysis,
  PlanningGoalSummary,
  TargetEvaluation,
  TargetUserDecision
} from "@/lib/services/onboarding/flow/shared/calculation/onboarding-calculation-service";
import {
  getGoalTargetAnswerFromStoredValue,
  isStoredGoalTargetAnswer,
  normalizeText,
  parseMonthYearInput,
  type MonthYearTargetAnswer,
  type StoredGoalTargetAnswer
} from "@/lib/services/onboarding/flow/shared/parser/onboarding-parser-service";

const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta"
});

export const getMonthYearLabelFromNow = (monthsFromNow: number) => {
  const now = new Date();
  const totalMonths = now.getUTCFullYear() * 12 + now.getUTCMonth() + Math.max(1, monthsFromNow);
  const year = Math.floor(totalMonths / 12);
  const monthIndex = totalMonths % 12;
  return MONTH_YEAR_FORMATTER.format(new Date(Date.UTC(year, monthIndex, 1, 12)));
};

export type GoalTargetConfirmationSummary = {
  goalType: FinancialGoalType | null;
  goalName: string;
  targetAmount: number | null;
  targetAnswer: MonthYearTargetAnswer;
  deadlineMissedBeforeStart: boolean;
  requiredMonthly: number | null;
  monthlySurplus: number;
  gap: number | null;
  realisticTargetLabel: string | null;
  suggestedTarget: MonthYearTargetAnswer | null;
  basis:
    | "FULL_SURPLUS"
    | "SEQUENTIAL_AFTER_PREVIOUS"
    | "PARALLEL_PRIORITY"
    | "PARALLEL_RESIDUAL"
    | null;
  startLabel: string | null;
  previousGoalNames: string[];
  planningAnalysis: OnboardingPlanningAnalysis | null;
  targetEvaluation: TargetEvaluation | null;
  requestedParallelPreview: RequestedTimelinePreview | null;
};

export type GoalTargetPendingDecision =
  | { kind: "confirm_original" }
  | { kind: "confirm_ai_suggestion"; target: MonthYearTargetAnswer }
  | { kind: "request_custom_date" }
  | { kind: "confirm_custom_date"; target: MonthYearTargetAnswer }
  | { kind: "restart_amount" }
  | { kind: "unknown" };

export type RequestedTimelinePreview = {
  startLabel: string;
  endLabel: string;
  parallelEndLabel: string;
  allocation: number;
  availableMonthly: number;
  gap: number;
  totalParallelAllocation: number;
  note: string;
};

export type TimelineMonthReference = {
  month: number;
  year: number;
  monthsFromNow: number;
  label: string;
};

export type GoalTimelineCommitment = {
  goalName: string;
  startRef: TimelineMonthReference;
  endRef: TimelineMonthReference;
  allocation: number;
  gap: number;
  storedTargetAnswer: StoredGoalTargetAnswer | null;
};

export const buildTimelineMonthReference = (
  month: number | null | undefined,
  year: number | null | undefined
): TimelineMonthReference | null => {
  if (!month || !year || month < 1 || month > 12) return null;

  const now = new Date();
  const currentIndex = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const targetIndex = year * 12 + (month - 1);

  return {
    month,
    year,
    monthsFromNow: targetIndex - currentIndex,
    label: MONTH_YEAR_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1, 12)))
  };
};

export const buildTimelineMonthReferenceFromOffset = (monthsFromNow: number | null) => {
  if (monthsFromNow === null || !Number.isFinite(monthsFromNow) || monthsFromNow <= 0) return null;

  const now = new Date();
  const totalMonths =
    now.getUTCFullYear() * 12 + now.getUTCMonth() + Math.max(1, Math.ceil(monthsFromNow));
  const year = Math.floor(totalMonths / 12);
  const monthIndex = totalMonths % 12;

  return {
    month: monthIndex + 1,
    year,
    monthsFromNow: Math.max(1, Math.ceil(monthsFromNow)),
    label: MONTH_YEAR_FORMATTER.format(new Date(Date.UTC(year, monthIndex, 1, 12)))
  } satisfies TimelineMonthReference;
};

export const compareTimelineMonthReferences = (
  left: TimelineMonthReference,
  right: TimelineMonthReference
) => (left.year === right.year ? left.month - right.month : left.year - right.year);

export const countTimelineMonthsInclusive = (
  startRef: TimelineMonthReference,
  endRef: TimelineMonthReference
) =>
  Math.max(
    1,
    endRef.year * 12 + (endRef.month - 1) - (startRef.year * 12 + (startRef.month - 1)) + 1
  );

export const getStoredCompletedGoalTargetAnswers = (sessions: OnboardingSession[]) =>
  sessions
    .filter(
      (session) =>
        session.questionKey === OnboardingQuestionKey.GOAL_TARGET_DATE && session.isCompleted === true
    )
    .map((session) => getStoredGoalTargetSessionAnswer(session.normalizedAnswerJson, "original"))
    .filter((item): item is StoredGoalTargetAnswer => Boolean(item));

export const findStoredGoalTargetAnswer = (
  goal: PlanningGoalSummary,
  storedTargetAnswers: StoredGoalTargetAnswer[]
) =>
  goal.goalType === FinancialGoalType.EMERGENCY_FUND
    ? null
    : storedTargetAnswers.find((item) => {
        if (item.goalType && item.goalType !== goal.goalType) return false;
        if (
          goal.goalType === FinancialGoalType.CUSTOM &&
          item.name &&
          normalizeText(item.name) !== normalizeText(goal.goalName)
        ) {
          return false;
        }
        return true;
      }) ?? null;

const getGoalBaseTimelineStartReference = (goal: PlanningGoalSummary) =>
  buildTimelineMonthReference(goal.startMonth, goal.startYear) ??
  buildTimelineMonthReferenceFromOffset(goal.startOffsetMonths > 0 ? goal.startOffsetMonths + 1 : 1);

const getGoalBaseTimelineEndReference = (goal: PlanningGoalSummary) => {
  const targetRef = buildTimelineMonthReference(goal.targetMonth, goal.targetYear);
  const realisticRef = buildTimelineMonthReference(
    goal.realisticTargetMonth,
    goal.realisticTargetYear
  );

  if (goal.deadlineMissedBeforeStart) {
    return realisticRef ?? targetRef;
  }

  if (goal.feasible === false && realisticRef) {
    return realisticRef;
  }

  return targetRef ?? realisticRef;
};

const getGoalBaseTimelineAllocation = (goal: PlanningGoalSummary) => {
  if (goal.requiredMonthlyAllocation !== null && (goal.gapMonthly ?? 0) <= 0) {
    return goal.requiredMonthlyAllocation;
  }

  if (goal.availableMonthlyAllocation > 0) {
    return goal.availableMonthlyAllocation;
  }

  return goal.requiredMonthlyAllocation;
};

export const buildGoalTimelineCommitments = (params: {
  roadmapGoals: PlanningGoalSummary[];
  storedTargetAnswers: StoredGoalTargetAnswer[];
}) => {
  const commitments: Array<GoalTimelineCommitment | null> = [];

  for (const goal of params.roadmapGoals) {
    const storedTargetAnswer = findStoredGoalTargetAnswer(goal, params.storedTargetAnswers);
    const baseStartRef = getGoalBaseTimelineStartReference(goal);
    const baseEndRef = getGoalBaseTimelineEndReference(goal);
    const baseAllocation = getGoalBaseTimelineAllocation(goal);

    if (!baseStartRef || !baseEndRef || baseAllocation === null || baseAllocation <= 0) {
      commitments.push(null);
      continue;
    }

    let startRef = baseStartRef;
    let endRef = baseEndRef;
    let allocation = baseAllocation;
    let gap = goal.gapMonthly ?? 0;

    if (storedTargetAnswer?.userDecision === "original") {
      endRef =
        buildTimelineMonthReference(
          storedTargetAnswer.desiredDate.month,
          storedTargetAnswer.desiredDate.year
        ) ?? endRef;
      allocation = storedTargetAnswer.requiredMonthlyForDesiredDate ?? allocation;
      gap = storedTargetAnswer.gapMonthly ?? gap;

      if (
        storedTargetAnswer.status === "needs_parallel" ||
        storedTargetAnswer.status === "impossible_sequential"
      ) {
        const overlappingPreviousCommitments = commitments.filter(
          (item): item is GoalTimelineCommitment => {
            if (!item) return false;
            return (
              compareTimelineMonthReferences(item.startRef, endRef) <= 0 &&
              compareTimelineMonthReferences(item.endRef, endRef) >= 0
            );
          }
        );
        const previousCommitment =
          overlappingPreviousCommitments[0] ??
          [...commitments].reverse().find((item): item is GoalTimelineCommitment => Boolean(item));
        startRef = previousCommitment?.startRef ?? startRef;
      }
    } else if (storedTargetAnswer?.userDecision === "realistic" && storedTargetAnswer.realisticDate) {
      endRef =
        buildTimelineMonthReference(
          storedTargetAnswer.realisticDate.month,
          storedTargetAnswer.realisticDate.year
        ) ?? endRef;
      allocation = storedTargetAnswer.allocatedMonthly ?? allocation;
      gap = storedTargetAnswer.gapMonthly ?? gap;
    }

    commitments.push({
      goalName: goal.goalName,
      startRef,
      endRef,
      allocation,
      gap,
      storedTargetAnswer
    });
  }

  return commitments;
};

export const getOverlappingTimelineCommitments = (
  commitments: Array<GoalTimelineCommitment | null>
) => {
  const resolvedCommitments = commitments.filter(
    (item): item is GoalTimelineCommitment => Boolean(item)
  );

  if (!resolvedCommitments.length) return [];

  const chain = [resolvedCommitments[resolvedCommitments.length - 1]];
  let earliestStartRef = chain[0].startRef;

  for (let index = resolvedCommitments.length - 2; index >= 0; index -= 1) {
    const commitment = resolvedCommitments[index];
    if (compareTimelineMonthReferences(commitment.endRef, earliestStartRef) < 0) {
      break;
    }

    chain.unshift(commitment);
    if (compareTimelineMonthReferences(commitment.startRef, earliestStartRef) < 0) {
      earliestStartRef = commitment.startRef;
    }
  }

  return chain;
};

export const applyStoredGoalTargetDecisionToEvaluation = (params: {
  evaluation: TargetEvaluation;
  storedTargetAnswer: StoredGoalTargetAnswer | null;
  commitment: GoalTimelineCommitment | null;
}) => {
  const { evaluation, storedTargetAnswer, commitment } = params;
  if (!storedTargetAnswer || !commitment) return evaluation;

  if (storedTargetAnswer.userDecision === "original") {
    return {
      ...evaluation,
      desiredDate:
        buildTimelineMonthReference(
          storedTargetAnswer.desiredDate.month,
          storedTargetAnswer.desiredDate.year
        ) ?? evaluation.desiredDate,
      realisticStartDate: commitment.startRef,
      realisticEndDate:
        storedTargetAnswer.realisticDate
          ? buildTimelineMonthReference(
              storedTargetAnswer.realisticDate.month,
              storedTargetAnswer.realisticDate.year
            ) ?? evaluation.realisticEndDate
          : evaluation.realisticEndDate,
      requiredMonthlyForDesiredDate:
        storedTargetAnswer.requiredMonthlyForDesiredDate ?? evaluation.requiredMonthlyForDesiredDate,
      allocatedMonthly: storedTargetAnswer.allocatedMonthly ?? evaluation.allocatedMonthly,
      gapMonthly: storedTargetAnswer.gapMonthly ?? evaluation.gapMonthly,
      status: storedTargetAnswer.status,
      userDecision: "original",
      basis:
        storedTargetAnswer.status === "needs_parallel" ||
        storedTargetAnswer.status === "impossible_sequential"
          ? "PARALLEL_RESIDUAL"
          : evaluation.basis
    } satisfies TargetEvaluation;
  }

  if (storedTargetAnswer.userDecision === "realistic") {
    return {
      ...evaluation,
      desiredDate:
        buildTimelineMonthReference(
          storedTargetAnswer.desiredDate.month,
          storedTargetAnswer.desiredDate.year
        ) ?? evaluation.desiredDate,
      realisticEndDate:
        storedTargetAnswer.realisticDate
          ? buildTimelineMonthReference(
              storedTargetAnswer.realisticDate.month,
              storedTargetAnswer.realisticDate.year
            ) ?? evaluation.realisticEndDate
          : evaluation.realisticEndDate,
      allocatedMonthly: storedTargetAnswer.allocatedMonthly ?? evaluation.allocatedMonthly,
      gapMonthly: storedTargetAnswer.gapMonthly ?? evaluation.gapMonthly,
      status: storedTargetAnswer.status,
      userDecision: "realistic"
    } satisfies TargetEvaluation;
  }

  return evaluation;
};

export const getStoredGoalTargetSessionAnswer = (
  value: unknown,
  fallbackUserDecision: TargetUserDecision = "pending"
): StoredGoalTargetAnswer | null => {
  if (isStoredGoalTargetAnswer(value)) return value;
  const target = getGoalTargetAnswerFromStoredValue(value);
  if (!target) return null;
  return {
    goalType: null,
    name: null,
    amount: null,
    target,
    desiredDate: target,
    realisticDate: null,
    realisticStartDate: null,
    realisticEndDate: null,
    requiredMonthlyForDesiredDate: null,
    allocatedMonthly: null,
    gapMonthly: null,
    status: "feasible",
    userDecision: fallbackUserDecision
  };
};

export const buildStoredGoalTargetSessionAnswer = (params: {
  summary: GoalTargetConfirmationSummary;
  target: MonthYearTargetAnswer;
  userDecision: TargetUserDecision;
}): StoredGoalTargetAnswer => {
  const evaluation = params.summary.targetEvaluation;
  return {
    goalType: params.summary.goalType,
    name: params.summary.goalName,
    amount: params.summary.targetAmount,
    target: params.target,
    desiredDate: params.summary.targetAnswer,
    realisticDate:
      evaluation?.realisticEndDate
        ? parseMonthYearInput(evaluation.realisticEndDate.label) ?? null
        : params.summary.suggestedTarget,
    realisticStartDate:
      evaluation?.realisticStartDate
        ? parseMonthYearInput(evaluation.realisticStartDate.label) ?? null
        : null,
    realisticEndDate:
      evaluation?.realisticEndDate
        ? parseMonthYearInput(evaluation.realisticEndDate.label) ?? null
        : params.summary.suggestedTarget,
    requiredMonthlyForDesiredDate: evaluation?.requiredMonthlyForDesiredDate ?? params.summary.requiredMonthly,
    allocatedMonthly: evaluation?.allocatedMonthly ?? params.summary.monthlySurplus,
    gapMonthly: evaluation?.gapMonthly ?? params.summary.gap,
    status:
      evaluation?.status ??
      (params.summary.deadlineMissedBeforeStart
        ? "impossible_sequential"
        : (params.summary.gap ?? 0) > 0
          ? "aggressive"
          : "feasible"),
    userDecision: params.userDecision
  };
};

export const buildRequestedTimelinePreview = (params: {
  summary: GoalTargetConfirmationSummary;
  roadmapGoals: PlanningGoalSummary[];
  currentGoalIndex: number;
  storedTargetAnswers: StoredGoalTargetAnswer[];
}): RequestedTimelinePreview | null => {
  const { summary, roadmapGoals, currentGoalIndex, storedTargetAnswers } = params;
  const currentGoal = roadmapGoals[currentGoalIndex];
  if (!currentGoal || currentGoal.targetAmount === null) return null;

  const targetEndRef = buildTimelineMonthReference(
    summary.targetAnswer.month,
    summary.targetAnswer.year
  );
  const previousCommitments = buildGoalTimelineCommitments({
    roadmapGoals: roadmapGoals.slice(0, currentGoalIndex),
    storedTargetAnswers
  });
  const timelineCommitments = getOverlappingTimelineCommitments(previousCommitments);
  const directOverlapCommitments = previousCommitments.filter(
    (item): item is GoalTimelineCommitment => {
      if (!item || !targetEndRef) return false;
      return (
        compareTimelineMonthReferences(item.startRef, targetEndRef) <= 0 &&
        compareTimelineMonthReferences(item.endRef, targetEndRef) >= 0
      );
    }
  );
  const overlappingCommitments =
    targetEndRef &&
    timelineCommitments[0] &&
    compareTimelineMonthReferences(targetEndRef, timelineCommitments[0].startRef) < 0
      ? directOverlapCommitments
      : timelineCommitments;
  const previewStartRef = overlappingCommitments[0]?.startRef ?? null;

  if (!targetEndRef || !previewStartRef) return null;
  if (compareTimelineMonthReferences(targetEndRef, previewStartRef) < 0) return null;
  const latestBlockingEndRef = overlappingCommitments.reduce<TimelineMonthReference | null>(
    (latest, commitment) =>
      !latest || compareTimelineMonthReferences(commitment.endRef, latest) > 0
        ? commitment.endRef
        : latest,
    null
  );
  const parallelEndRef =
    latestBlockingEndRef && compareTimelineMonthReferences(latestBlockingEndRef, targetEndRef) < 0
      ? latestBlockingEndRef
      : targetEndRef;

  const previewMonthsUntilTarget = countTimelineMonthsInclusive(previewStartRef, targetEndRef);
  const previewRequiredMonthly = Math.ceil(
    Math.max(0, currentGoal.targetAmount - currentGoal.currentSavedAmount) / previewMonthsUntilTarget
  );
  const blockingMonthlyAllocation = overlappingCommitments.reduce(
    (sum, commitment) => sum + Math.max(0, commitment.allocation),
    0
  );
  const previewResidualMonthly = summary.monthlySurplus - blockingMonthlyAllocation;
  const previewAvailableMonthly = Math.max(0, previewResidualMonthly);
  const previewGap = Math.max(0, previewRequiredMonthly - previewResidualMonthly);
  const totalParallelAllocation = blockingMonthlyAllocation + previewRequiredMonthly;

  return {
    startLabel: previewStartRef.label,
    endLabel: summary.targetAnswer.label,
    parallelEndLabel: parallelEndRef.label,
    allocation: previewRequiredMonthly,
    availableMonthly: previewAvailableMonthly,
    gap: previewGap,
    totalParallelAllocation,
    note:
      previewGap > 0
        ? "Perlu penyesuaian, kalau deadline ini mau dipertahankan targetnya perlu jalan paralel dengan target lain."
        : "Kalau deadline ini mau dipertahankan, targetnya perlu jalan paralel dengan target lain."
  };
};

export const shouldUseRequestedTimelinePreview = (params: {
  goal: PlanningGoalSummary;
  preview: RequestedTimelinePreview | null;
  currentGoalIndex: number;
}) => {
  const { goal, preview, currentGoalIndex } = params;
  if (!preview || currentGoalIndex <= 0) return false;
  if (goal.basis === "PARALLEL_PRIORITY" || goal.basis === "PARALLEL_RESIDUAL") return false;
  if (goal.deadlineMissedBeforeStart) return true;
  if ((goal.gapMonthly ?? 0) <= 0 || goal.startOffsetMonths <= 0) return false;

  const currentRequiredMonthly = goal.requiredMonthlyAllocation ?? Number.POSITIVE_INFINITY;
  const currentGap = goal.gapMonthly ?? Number.POSITIVE_INFINITY;

  return preview.allocation < currentRequiredMonthly || preview.gap < currentGap;
};

