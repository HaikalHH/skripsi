import {
  AssetType,
  BudgetMode,
  ExpensePlanSource,
  FinancialGoalStatus,
  FinancialGoalType,
  GoalExecutionMode,
  GoalCalculationType,
  IncomeStability,
  OnboardingQuestionKey,
  OnboardingStatus,
  OnboardingStep,
  Prisma,
  RegistrationStatus,
  type OnboardingSession,
  type User
} from "@prisma/client";
import {
  ASSET_NONE_VALUE,
  ASSET_OPTIONS,
  BUDGET_MODE_OPTIONS,
  EMPLOYMENT_OPTIONS,
  GOLD_BRAND_OPTIONS,
  GOLD_KARAT_OPTIONS,
  GOLD_PLATFORM_OPTIONS,
  GOLD_TYPE_OPTIONS,
  GOAL_ALLOCATION_MODE_OPTIONS,
  GOAL_EXPENSE_STRATEGY_OPTIONS,
  GOAL_NONE_VALUE,
  GOAL_OPTIONS
} from "@/lib/services/onboarding/flow/shared/questions/answer-options";
import {
  formatPromptForChat,
  formatPromptForChatBubbles
} from "@/lib/services/onboarding/flow/shared/questions/chat-format";
import { getPromptForStep } from "@/lib/services/onboarding/flow/get-prompt-for-step";
import { getNextOnboardingStep } from "@/lib/services/onboarding/flow/next-step";
import {
  STEP_ACTIVE_INCOME_ADD_MORE,
  STEP_ACTIVE_INCOME_COUNT,
  STEP_ACTIVE_INCOME_CYCLE_CONFIRM,
  STEP_ACTIVE_INCOME_CYCLE_SELECT,
  getActiveIncomeOnboardingState,
  syncActiveIncomeProfileFromSessions
} from "@/lib/services/onboarding/flow/02-income/service/active-income-state";
import {
  buildGuidedExpenseSummaryItems,
  formatGuidedExpenseSummaryText,
  getAssetTransitionLeadText,
  shouldSeparateNextPromptBubble
} from "@/lib/services/onboarding/flow/03-expenses/service/guided-expense-summary";
import {
  buildAssetValuationNotes,
  buildGoldAssetName,
  formatQuantityValue,
  getGoldBrandLabel,
  getGoldKaratLabel,
  getGoldPlatformLabel,
  getGoldPurityMultiplier,
  getGoldTypeLabel
} from "@/lib/services/onboarding/flow/05-assets/service/asset-formatting";
import { isFinalAssetStep } from "@/lib/services/onboarding/flow/05-assets/service/asset-state";
import type {
  GoldAssetBrandValue,
  GoldAssetKaratValue,
  GoldAssetPlatformValue,
  GoldAssetTypeValue,
  OnboardingPrompt,
  OnboardingPromptContext
} from "@/lib/services/onboarding/flow/shared/questions/question-types";
import {
  buildInitialFinancialProfile,
  buildOnboardingPlanningAnalysis,
  generateFinalTimelineReplyTexts,
  generateShortTargetEvaluationCopy,
  evaluateTargetAgainstCurrentPlan,
  type OnboardingPlanningAnalysis,
  type PlanningGoalSummary,
  type TargetEvaluation,
  type TargetUserDecision,
  calculateTargetFeasibility,
  createOnboardingAsset,
  createOrUpdateFinancialGoal,
  deriveEmploymentSummary,
  generateOnboardingAnalysis,
  parseManualBreakdownTotal,
  replaceExpensePlan,
  setMonthlyExpenseTotal,
  syncFinancialGoalPriorities,
  upsertIncomeProfile,
  type ExpenseBreakdown
} from "@/lib/services/onboarding/flow/shared/calculation/onboarding-calculation-service";
import {
  applyStoredGoalTargetDecisionToEvaluation,
  buildGoalTimelineCommitments,
  buildRequestedTimelinePreview,
  buildStoredGoalTargetSessionAnswer,
  findStoredGoalTargetAnswer,
  getMonthYearLabelFromNow,
  getStoredCompletedGoalTargetAnswers,
  getStoredGoalTargetSessionAnswer,
  shouldUseRequestedTimelinePreview,
  type GoalTargetConfirmationSummary,
  type GoalTargetPendingDecision
} from "@/lib/services/onboarding/flow/shared/planning/goal-timeline";
import {
  getClarificationLeadText,
  isClarificationInsteadOfAnswer,
  isNegativeAnswerConfirmation,
  isOptionExplanationQuestion,
  isPositiveAnswerConfirmation
} from "@/lib/services/onboarding/flow/shared/conversation/clarification";
import {
  getCurrentGoldType,
  getCurrentAssetType,
  getCurrentGoalType,
  getEmploymentTypes,
  type MonthYearTargetAnswer,
  getGoalTargetAnswerFromStoredValue,
  getGuidedOtherExpenseState,
  getGoalExpenseStrategy,
  getGoalPlanRecommendation,
  getLatestAssetName,
  getLatestCustomGoalName,
  getPendingAssetDetail,
  getPendingGoalDetail,
  getSelectedGoalTypes,
  hasExpenseDependentGoalSelection,
  hasMixedNoneAssetSelection,
  isGuidedOtherExpenseAnswer,
  getSessionNormalizedValue,
  isReadyCommand,
  latestSessionForQuestion,
  normalizeText,
  parseAddMoreAnswer,
  parseActiveIncomeAddMoreAnswer,
  parseActiveIncomeCycleSelection,
  parseActiveIncomeFrequency,
  parseAssetQuantityInput,
  parseAssetSelections,
  parseAssetSelectionConflict,
  parseBooleanAnswer,
  parseBudgetMode,
  parseDayOfMonth,
  parseDecimalInputPreservingRange,
  parseAssetFreeText,
  parseGoldAssetBrand,
  parseGoldAssetKarat,
  parseGoldAssetPlatform,
  parseGoldAssetType,
  parseGoalAllocationMode,
  parseGoalExpenseStrategy,
  parseGoalPriorityFocus,
  parseGoalSelections,
  parseGoalSelectionConflict,
  parseGuidedOtherExpenseCategoryName,
  getMoneyAnswerLowerBound,
  getNumericAnswerMidpoint,
  isNumericRangeAnswer,
  isMoneyRangeAnswer,
  isManualExpenseBreakdownTooGeneric,
  parseManualExpenseBreakdownDetails,
  type ManualExpenseBreakdownDetail,
  parseMonthYearInput,
  parseMoneyInput,
  parseMoneyInputPreservingRange,
  looksLikeGoalTargetDateInput,
  parsePhoneInput,
  parsePersonalizationChoice,
  parseStockSymbolInput,
  parseEmploymentTypes,
  isStoredGoalPriorityOrderAnswer,
  isStoredGoalTargetAnswer,
  type StoredGoalPriorityOrderAnswer,
  type StoredGoalTargetAnswer,
  type MoneyRangeAnswer,
  type NumericRangeAnswer,
  type SessionAnswerValue
} from "@/lib/services/onboarding/flow/shared/parser/onboarding-parser-service";
import { env } from "@/lib/env";
import { getMarketQuoteBySymbol } from "@/lib/services/market/quote";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatPercent } from "@/lib/services/shared/money";

type OnboardingResult = {
  handled: boolean;
  replyText: string;
  replyTexts?: string[];
  preserveReplyTextBubbles?: boolean;
  state?: OnboardingState;
};

export type OnboardingState = {
  userId: string;
  onboardingStatus: OnboardingStatus;
  stepKey: OnboardingStep;
  questionKey: OnboardingQuestionKey | null;
  promptText: string | null;
  prompt: OnboardingPrompt | null;
  isCompleted: boolean;
  analysisText?: string | null;
  timelineText?: string | null;
  timelineReplyTexts?: string[] | null;
};

type RuntimeContext = OnboardingPromptContext & {
  user: User;
  sessions: OnboardingSession[];
  activeIncomeMonthly: number | null;
  passiveIncomeMonthly: number | null;
  estimatedMonthlyIncome: number | null;
  monthlyExpenseTotal: number | null;
  potentialMonthlySaving: number | null;
  emergencyFundTargetAmount: number | null;
  activeGoals: Array<{
    goalType: FinancialGoalType;
    goalName: string;
    targetAmount: number | null;
    currentSavedAmount: number;
    targetMonth: number | null;
    targetYear: number | null;
    status: FinancialGoalStatus;
    priorityOrder?: number | null;
  }>;
};

const getOnboardingSessionModel = () => (prisma as { onboardingSession?: any }).onboardingSession;
const getFinancialProfileModel = () => (prisma as { financialProfile?: any }).financialProfile;
const getExpensePlanModel = () => (prisma as { expensePlan?: any }).expensePlan;
const getFinancialGoalModel = () => (prisma as { financialGoal?: any }).financialGoal;
const ACTIVE_ONBOARDING_GOAL_VALUES = new Set(GOAL_OPTIONS.map((option) => option.value));
const isActiveOnboardingGoalType = (value: unknown): value is FinancialGoalType =>
  typeof value === "string" && ACTIVE_ONBOARDING_GOAL_VALUES.has(value);
const ASSET_ONBOARDING_QUESTION_KEYS = new Set<OnboardingQuestionKey>([
  OnboardingQuestionKey.ASSET_SELECTION,
  OnboardingQuestionKey.ASSET_ADD_MORE,
  OnboardingQuestionKey.ASSET_NAME,
  OnboardingQuestionKey.ASSET_ESTIMATED_VALUE,
  OnboardingQuestionKey.ASSET_SAVINGS_NAME,
  OnboardingQuestionKey.ASSET_SAVINGS_BALANCE,
  OnboardingQuestionKey.ASSET_GOLD_TYPE,
  OnboardingQuestionKey.ASSET_GOLD_NAME,
  OnboardingQuestionKey.ASSET_GOLD_BRAND,
  OnboardingQuestionKey.ASSET_GOLD_GRAMS,
  OnboardingQuestionKey.ASSET_GOLD_KARAT,
  OnboardingQuestionKey.ASSET_GOLD_PLATFORM,
  OnboardingQuestionKey.ASSET_STOCK_SYMBOL,
  OnboardingQuestionKey.ASSET_STOCK_LOTS,
  OnboardingQuestionKey.ASSET_PROPERTY_NAME,
  OnboardingQuestionKey.ASSET_PROPERTY_ESTIMATED_VALUE
]);
const getPresentationStep = (step: OnboardingStep) =>
  step === OnboardingStep.ASK_PRIMARY_GOAL ? OnboardingStep.ASK_GOAL_SELECTION : step;
const createState = (params: {
  user: User;
  prompt: OnboardingPrompt | null;
  analysisText?: string | null;
  timelineText?: string | null;
  timelineReplyTexts?: string[] | null;
}): OnboardingState => ({
  userId: params.user.id,
  onboardingStatus: params.user.onboardingStatus,
  stepKey: getPresentationStep(params.user.onboardingStep),
  questionKey: params.prompt?.questionKey ?? null,
  promptText: params.prompt ? formatPromptForChat(params.prompt) : null,
  prompt: params.prompt,
  isCompleted: params.user.onboardingStatus === OnboardingStatus.COMPLETED,
  analysisText: params.analysisText ?? null,
  timelineText: params.timelineText ?? null,
  timelineReplyTexts: params.timelineReplyTexts ?? null
});

const buildValidationReply = (prompt: OnboardingPrompt, message: string): OnboardingResult =>
  buildMessageWithPromptReply(prompt, [message]);

const buildReplyResult = (
  replyTexts: string[],
  state?: OnboardingState,
  options?: {
    preserveReplyTextBubbles?: boolean;
  }
): OnboardingResult => {
  const normalizedReplyTexts = replyTexts.map((item) => item.trim()).filter(Boolean);
  const replyText = normalizedReplyTexts.join("\n\n").trim();
  return {
    handled: true,
    replyText,
    replyTexts: normalizedReplyTexts.length > 1 ? normalizedReplyTexts : undefined,
    preserveReplyTextBubbles:
      options?.preserveReplyTextBubbles === true && normalizedReplyTexts.length > 1
        ? true
        : undefined,
    state
  };
};

const getPromptReplyTexts = (prompt: OnboardingPrompt) => formatPromptForChatBubbles(prompt);

const buildPromptReplyResult = (prompt: OnboardingPrompt, state?: OnboardingState): OnboardingResult => {
  const promptReplyTexts = getPromptReplyTexts(prompt);
  return buildReplyResult(promptReplyTexts, state, {
    preserveReplyTextBubbles: promptReplyTexts.length > 1
  });
};

const buildMessageWithPromptReply = (
  prompt: OnboardingPrompt,
  messageTexts: string[],
  state?: OnboardingState
): OnboardingResult => {
  const promptReplyTexts = getPromptReplyTexts(prompt);
  return buildReplyResult([...messageTexts, ...promptReplyTexts], state, {
    preserveReplyTextBubbles: promptReplyTexts.length > 1
  });
};

const isManualExpenseHelpRequest = (rawAnswer: unknown) => {
  if (typeof rawAnswer !== "string") return false;
  const normalized = normalizeText(rawAnswer).toLowerCase();
  return (
    normalized.includes("tolong bantu susun") ||
    normalized.includes("bantu susun") ||
    normalized.includes("belum punya") ||
    normalized.includes("belum ada rincian") ||
    normalized.includes("bantu hitung") ||
    normalized.includes("bantu rapihin")
  );
};

const buildManualExpenseTooGenericReply = (
  prompt: OnboardingPrompt,
  rawAnswer: string
) => {
  const total = parseMoneyInput(rawAnswer);
  return buildMessageWithPromptReply(prompt, [
    [
      total
        ? `Jawaban ini baru kebaca sebagai total pengeluaran sekitar ${formatMoney(total)}/bulan.`
        : "Jawaban ini belum cukup kebaca sebagai rincian pengeluaran bulanan.",
      "Saya masih perlu pembagian per kategori supaya budget dan targetnya lebih akurat.",
      "",
      "Coba tulis kategori + nominalnya, misalnya:",
      "Makan 1,5jt, transport 500rb, tagihan 700rb",
      "",
      "Kalau Boss belum punya rinciannya, balas:",
      "`Saya belum punya, tolong bantu susun`"
    ].join("\n")
  ]);
};

const buildManualExpenseAddMorePromptReply = (
  prompt: OnboardingPrompt,
  context: RuntimeContext
) =>
  buildReplyResult(
    [
      "Siap Boss, kirim kategori pengeluaran tambahan dan nominalnya ya. Contoh: `Keluarga: 500rb` atau `Cicilan motor: 1,2jt`."
    ],
    createState({ user: context.user, prompt })
  );

const isTimelineRequest = (value: string) => {
  const normalized = normalizeText(value).toLowerCase();
  return (
    normalized.includes("lihat timeline") ||
    normalized.includes("minta timeline") ||
    normalized.includes("coba timeline") ||
    normalized.includes("timeline dong")
  );
};

const findOptionLabel = (options: Array<{ value: string; label: string }>, value: string) =>
  options.find((item) => item.value === value)?.label ?? value;

const joinNaturalLabels = (labels: string[]) => {
  if (!labels.length) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} dan ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, dan ${labels.at(-1)}`;
};

const getCurrentTargetMonthYearExamples = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jakarta"
  }).formatToParts(new Date());

  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "1970");
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const numeric = `${String(nextMonth).padStart(2, "0")}/${nextYear}`;
  const long = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta"
  }).format(new Date(Date.UTC(nextYear, nextMonth - 1, 1, 12)));

  return { numeric, long };
};

const ONBOARDING_ASSET_ERROR_PREFIX = "ONBOARDING_ASSET_VALIDATION:";
const ONBOARDING_STEP_REDIRECT_PREFIX = "ONBOARDING_STEP_REDIRECT:";

type OnboardingStepRedirect = {
  step: OnboardingStep;
  message: string;
};

const buildOnboardingAssetError = (message: string) =>
  new Error(`${ONBOARDING_ASSET_ERROR_PREFIX}${message}`);

const getOnboardingAssetErrorMessage = (error: unknown) => {
  if (!(error instanceof Error)) return null;
  if (!error.message.startsWith(ONBOARDING_ASSET_ERROR_PREFIX)) return null;
  return error.message.slice(ONBOARDING_ASSET_ERROR_PREFIX.length);
};

const getOnboardingStepRedirect = (error: unknown): OnboardingStepRedirect | null => {
  if (!(error instanceof Error)) return null;
  if (!error.message.startsWith(ONBOARDING_STEP_REDIRECT_PREFIX)) return null;

  try {
    const parsed = JSON.parse(
      error.message.slice(ONBOARDING_STEP_REDIRECT_PREFIX.length)
    ) as OnboardingStepRedirect;
    return parsed?.step && typeof parsed.message === "string" ? parsed : null;
  } catch {
    return null;
  }
};

const getLatestAnswerValue = <T>(context: RuntimeContext, questionKey: OnboardingQuestionKey) =>
  getSessionNormalizedValue<T>(latestSessionForQuestion(context.sessions, questionKey));

const formatMoneyRange = (value: MoneyRangeAnswer) =>
  `${formatMoney(value.low)} sampai ${formatMoney(value.high)}`;

const formatNumericRange = (value: NumericRangeAnswer) =>
  `${formatQuantityValue(value.low)} sampai ${formatQuantityValue(value.high)}`;

const getNumericAnswerValue = (value: number | NumericRangeAnswer | null | undefined) =>
  value == null ? null : getNumericAnswerMidpoint(value);

const buildNumericRangeNote = (
  key: string,
  value: number | NumericRangeAnswer | null | undefined
): Record<string, unknown> =>
  isNumericRangeAnswer(value)
    ? {
        [key]: {
          low: value.low,
          high: value.high
        }
      }
    : {};

const describePassiveIncomeAnswer = (value: SessionAnswerValue) =>
  isMoneyRangeAnswer(value)
    ? `income pasifnya di kisaran ${formatMoneyRange(value)} per bulan`
    : `income pasifnya sekitar ${formatMoney(value as number)} per bulan`;

const describeGuidedOtherExpenseAnswer = (value: SessionAnswerValue) => {
  if (typeof value === "number") {
    return value === 0
      ? "untuk sekarang belum ada pengeluaran lain di luar yang tadi"
      : `pengeluaran lainnya sekitar ${formatMoney(value)} per bulan`;
  }

  if (!isGuidedOtherExpenseAnswer(value)) {
    return "pengeluaran lain di luar kategori utama";
  }

  switch (value.kind) {
    case "presence":
      return value.hasOtherExpense
        ? "masih ada pengeluaran lain di luar yang tadi"
        : "untuk sekarang belum ada pengeluaran lain di luar yang tadi";
    case "category_name":
      return `kategori pengeluaran lainnya "${value.label}"`;
    case "category_amount":
      return `pengeluaran ${value.label} sekitar ${formatMoney(value.amount)} per bulan`;
    case "add_more":
      return value.addMore
        ? "masih ada pengeluaran lain yang mau ditambah"
        : "untuk sekarang pengeluaran lain tambahannya sudah cukup";
  }
};

const buildClarificationReply = (prompt: OnboardingPrompt, rawAnswer: unknown): OnboardingResult =>
  buildMessageWithPromptReply(prompt, [getClarificationLeadText(rawAnswer, prompt)]);

const getPendingConfirmationSession = (
  sessions: OnboardingSession[],
  stepKey: OnboardingStep,
  questionKey: OnboardingQuestionKey
) => {
  const matches = sessions.filter(
    (item) => item.stepKey === stepKey && item.questionKey === questionKey
  );
  const latestMatch = matches.at(-1) ?? null;
  return latestMatch?.isCompleted === false ? latestMatch : null;
};

const invalidatePendingConfirmation = async (sessionId: string) => {
  const onboardingSessionModel = getOnboardingSessionModel();
  if (onboardingSessionModel?.deleteMany) {
    await onboardingSessionModel.deleteMany({
      where: { id: sessionId, isCompleted: false }
    });
    return;
  }
  if (!onboardingSessionModel?.delete) return;
  await onboardingSessionModel.delete({
    where: { id: sessionId }
  });
};

const deleteLatestConfirmedSessionForQuestion = async (
  userId: string,
  questionKey: OnboardingQuestionKey
) => {
  const onboardingSessionModel = getOnboardingSessionModel();
  if (!onboardingSessionModel?.findMany) return;

  const latestSession = (await onboardingSessionModel.findMany({
    where: {
      userId,
      questionKey,
      isCompleted: true
    },
    orderBy: { createdAt: "desc" },
    take: 1
  }))?.[0] as OnboardingSession | undefined;

  if (!latestSession) return;

  if (onboardingSessionModel.deleteMany) {
    await onboardingSessionModel.deleteMany({
      where: {
        id: latestSession.id,
        isCompleted: true
      }
    });
    return;
  }

  if (onboardingSessionModel.delete) {
    await onboardingSessionModel.delete({
      where: { id: latestSession.id }
    });
  }
};

const resolvePrompt = (context: RuntimeContext) => getPromptForStep(context.user.onboardingStep, context);

const buildGoalTargetConfirmationSummary = (
  context: RuntimeContext,
  targetAnswer: MonthYearTargetAnswer
): GoalTargetConfirmationSummary => {
  const goalType = context.currentGoalType;
  const goalName = goalType ? getGoalDisplayNameForContext(context, goalType) : "Target ini";
  const targetAmount = getLatestAnswerValue<number>(context, OnboardingQuestionKey.GOAL_TARGET_AMOUNT);
  const fallbackFeasibility =
    targetAmount && targetAmount > 0 && context.potentialMonthlySaving !== null
      ? calculateTargetFeasibility({
          targetAmount,
          currentSavedAmount: 0,
          targetDate: {
            month: targetAnswer.month,
            year: targetAnswer.year
          },
          monthlySurplus: context.potentialMonthlySaving
        })
      : null;

  const currentGoalName = goalType
    ? goalNameByType(goalType, getLatestCustomGoalName(context.sessions))
    : goalName;

  const activeGoals = context.activeGoals.length
    ? context.activeGoals.map((goal) => {
        const isCurrentGoal =
          goalType === FinancialGoalType.CUSTOM
            ? goal.goalType === FinancialGoalType.CUSTOM &&
              normalizeText(goal.goalName) === normalizeText(currentGoalName)
            : goal.goalType === goalType;

        if (!isCurrentGoal) {
          return {
            goalType: goal.goalType,
            goalName: goal.goalName,
            targetAmount: goal.targetAmount,
            currentSavedAmount: goal.currentSavedAmount,
            targetMonth: goal.targetMonth,
            targetYear: goal.targetYear,
            status: goal.status
          };
        }

        return {
          goalType: goal.goalType,
          goalName: currentGoalName,
          targetAmount: targetAmount ?? goal.targetAmount,
          currentSavedAmount: goal.currentSavedAmount,
          targetMonth: targetAnswer.month,
          targetYear: targetAnswer.year,
          status: goal.status
        };
      })
    : [];

  const planningAnalysis =
    targetAmount && targetAmount > 0 && context.potentialMonthlySaving !== null && activeGoals.length
      ? buildOnboardingPlanningAnalysis({
          incomeStability: context.user.incomeStability,
          monthlyIncomeTotal: context.monthlyIncomeTotal,
          monthlyExpenseTotal: context.monthlyExpenseTotal,
          goalExecutionMode:
            context.user.goalExecutionMode ??
            (activeGoals.length > 1 ? GoalExecutionMode.SEQUENTIAL : null),
          priorityGoalType: context.user.priorityGoalType ?? null,
          goals: activeGoals,
          assets: []
        })
      : null;

  const currentSummary =
    planningAnalysis?.goalSummaries.find((goal) =>
      goalType === FinancialGoalType.CUSTOM
        ? goal.goalType === FinancialGoalType.CUSTOM &&
          normalizeText(goal.goalName) === normalizeText(currentGoalName)
        : goal.goalType === goalType
    ) ?? null;

  const currentSummaryIndex =
    currentSummary && planningAnalysis
      ? planningAnalysis.goalSummaries.findIndex((goal) => goal.goalName === currentSummary.goalName)
      : -1;
  const previousGoalNames =
    currentSummaryIndex > 0 && planningAnalysis
      ? planningAnalysis.goalSummaries
          .slice(0, currentSummaryIndex)
          .map((goal) => goal.goalName)
          .filter(Boolean)
      : [];
  const storedTargetAnswers = getStoredCompletedGoalTargetAnswers(context.sessions);
  const targetEvaluation = currentSummary
    ? (() => {
        const roadmapGoals =
          planningAnalysis?.goalSummaries.filter((goal) => goal.targetAmount !== null) ?? [];
        const roadmapCurrentGoalIndex = roadmapGoals.findIndex(
          (goal) => goal.goalName === currentSummary.goalName && goal.targetDateLabel === targetAnswer.label
        );
        const requestedParallelPreview = buildRequestedTimelinePreview({
          summary: {
            goalType: goalType ?? null,
            goalName,
            targetAmount: targetAmount ?? null,
            targetAnswer,
            deadlineMissedBeforeStart: currentSummary.deadlineMissedBeforeStart ?? false,
            requiredMonthly:
              currentSummary.requiredMonthlyAllocation ?? fallbackFeasibility?.requiredMonthly ?? null,
            monthlySurplus:
              currentSummary.availableMonthlyAllocation ??
              fallbackFeasibility?.monthlySurplus ??
              Math.max(0, context.potentialMonthlySaving ?? 0),
            gap: currentSummary.gapMonthly ?? fallbackFeasibility?.gap ?? null,
            realisticTargetLabel:
              currentSummary.realisticTargetLabel ?? fallbackFeasibility?.realisticTargetLabel ?? null,
            suggestedTarget: parseMonthYearInput(
              currentSummary.realisticTargetLabel ?? fallbackFeasibility?.realisticTargetLabel ?? ""
            ),
            basis: currentSummary.basis ?? null,
            startLabel: currentSummary.startLabel ?? null,
            previousGoalNames,
            planningAnalysis,
            targetEvaluation: null,
            requestedParallelPreview: null
          },
          roadmapGoals,
          currentGoalIndex: roadmapCurrentGoalIndex,
          storedTargetAnswers
        });

        const shouldUseParallelPreview = shouldUseRequestedTimelinePreview({
          goal: currentSummary,
          preview: requestedParallelPreview,
          currentGoalIndex: roadmapCurrentGoalIndex
        });

        const baseEvaluation = evaluateTargetAgainstCurrentPlan({
          goal: currentSummary,
          userDecision: "pending"
        });

        return shouldUseParallelPreview && requestedParallelPreview
          ? ({
              ...baseEvaluation,
              requiredMonthlyForDesiredDate: requestedParallelPreview.allocation,
              allocatedMonthly: requestedParallelPreview.availableMonthly,
              gapMonthly: requestedParallelPreview.gap,
              status: "needs_parallel",
              basis: "PARALLEL_RESIDUAL",
              note: "Perlu jalan paralel atau tambah setoran kalau deadline ini mau dipertahankan."
            } satisfies TargetEvaluation)
          : baseEvaluation;
      })()
    : null;
  const roadmapGoals =
    planningAnalysis?.goalSummaries.filter((goal) => goal.targetAmount !== null) ?? [];
  const roadmapCurrentGoalIndex =
    currentSummary && roadmapGoals.length
      ? roadmapGoals.findIndex(
          (goal) => goal.goalName === currentSummary.goalName && goal.targetDateLabel === targetAnswer.label
        )
      : -1;
  const requestedParallelPreview =
    currentSummary && roadmapCurrentGoalIndex >= 0
      ? (() => {
          const preview = buildRequestedTimelinePreview({
            summary: {
              goalType: goalType ?? null,
              goalName,
              targetAmount: targetAmount ?? null,
              targetAnswer,
              deadlineMissedBeforeStart: currentSummary.deadlineMissedBeforeStart ?? false,
              requiredMonthly:
                currentSummary.requiredMonthlyAllocation ?? fallbackFeasibility?.requiredMonthly ?? null,
              monthlySurplus:
                currentSummary.availableMonthlyAllocation ??
                fallbackFeasibility?.monthlySurplus ??
                Math.max(0, context.potentialMonthlySaving ?? 0),
              gap: currentSummary.gapMonthly ?? fallbackFeasibility?.gap ?? null,
              realisticTargetLabel:
                currentSummary.realisticTargetLabel ?? fallbackFeasibility?.realisticTargetLabel ?? null,
              suggestedTarget: parseMonthYearInput(
                currentSummary.realisticTargetLabel ?? fallbackFeasibility?.realisticTargetLabel ?? ""
              ),
              basis: currentSummary.basis ?? null,
              startLabel: currentSummary.startLabel ?? null,
              previousGoalNames,
              planningAnalysis,
              targetEvaluation,
            requestedParallelPreview: null
          },
          roadmapGoals,
          currentGoalIndex: roadmapCurrentGoalIndex,
          storedTargetAnswers
        });

          return shouldUseRequestedTimelinePreview({
            goal: currentSummary,
            preview,
            currentGoalIndex: roadmapCurrentGoalIndex
          })
            ? preview
            : null;
        })()
      : null;

  return {
    goalType: goalType ?? null,
    goalName,
    targetAmount: targetAmount ?? null,
    targetAnswer,
    deadlineMissedBeforeStart: currentSummary?.deadlineMissedBeforeStart ?? false,
    requiredMonthly:
      requestedParallelPreview !== null
        ? requestedParallelPreview.allocation
        : currentSummary !== null
          ? currentSummary.requiredMonthlyAllocation
        : fallbackFeasibility?.requiredMonthly ?? null,
    monthlySurplus:
      currentSummary?.availableMonthlyAllocation ??
      fallbackFeasibility?.monthlySurplus ??
      Math.max(0, context.potentialMonthlySaving ?? 0),
    gap:
      requestedParallelPreview !== null
        ? requestedParallelPreview.gap
        : currentSummary !== null
          ? currentSummary.gapMonthly
          : fallbackFeasibility?.gap ?? null,
    realisticTargetLabel:
      currentSummary?.realisticTargetLabel ?? fallbackFeasibility?.realisticTargetLabel ?? null,
    suggestedTarget: parseMonthYearInput(
      currentSummary?.realisticTargetLabel ?? fallbackFeasibility?.realisticTargetLabel ?? ""
    ),
    basis: requestedParallelPreview !== null ? "PARALLEL_RESIDUAL" : currentSummary?.basis ?? null,
    startLabel: requestedParallelPreview?.startLabel ?? currentSummary?.startLabel ?? null,
    previousGoalNames,
    planningAnalysis,
    targetEvaluation,
    requestedParallelPreview
  };
};

const isAggressiveGoalTargetConfirmation = (context: RuntimeContext, targetAnswer: MonthYearTargetAnswer) => {
  const summary = buildGoalTargetConfirmationSummary(context, targetAnswer);
  return summary.deadlineMissedBeforeStart || (summary.gap ?? 0) > 0;
};

const parseGoalTargetPendingDecision = (
  context: RuntimeContext,
  pendingConfirmation: OnboardingSession,
  rawAnswer: unknown
): GoalTargetPendingDecision => {
  const pendingTargetAnswer =
    getStoredGoalTargetSessionAnswer(pendingConfirmation.normalizedAnswerJson)?.target ??
    (pendingConfirmation.normalizedAnswerJson as MonthYearTargetAnswer);
  const summary = buildGoalTargetConfirmationSummary(context, pendingTargetAnswer);
  const text = typeof rawAnswer === "string" ? normalizeText(rawAnswer).toLowerCase() : "";
  const compactText = text.replace(/\s+/g, "");
  const parsedMonthYear = parseMonthYearInput(rawAnswer);

  if (parsedMonthYear) {
    return { kind: "confirm_custom_date", target: parsedMonthYear };
  }

  if (
    text === "1" ||
    text === "tetap" ||
    text === "tetep" ||
    text === "lanjut" ||
    text.includes("tetap ") ||
    text.includes("tetep ") ||
    text.includes("tetap itu") ||
    text.includes("tetep itu") ||
    text === "pakai target ini" ||
    text === "pakai target itu" ||
    text === "pakai yang ini" ||
    text === "pakai target awal" ||
    text === "pake target ini" ||
    text === "pake target itu" ||
    text === "pake yang ini" ||
    text === "pake target awal" ||
    text.includes("lanjut dengan target") ||
    compactText === "ituaja" ||
    compactText === "itusaja" ||
    compactText === "itudoang" ||
    compactText === "tetapituaja" ||
    compactText === "tetepituaja" ||
    isPositiveAnswerConfirmation(rawAnswer)
  ) {
    return { kind: "confirm_original" };
  }

  if (
    summary.suggestedTarget &&
    (text === "2" ||
      text.includes("pakai saran") ||
      text.includes("pake saran") ||
      text.includes("ikut saran") ||
      text === "saran" ||
      text.includes("saran anda") ||
      text.includes("realistis aja") ||
      text.includes("realisitis aja") ||
      text.includes("relistis aja") ||
      text.includes("yang realistis aja") ||
      text.includes("yang realisitis aja") ||
      text.includes("yang lebih realistis") ||
      text.includes("lebih realistis aja") ||
      text.includes("yang realistis") ||
      text.includes("realisitis") ||
      text.includes("relistis") ||
      text.includes("boleh realistis") ||
      text.includes("boleh yang realistis") ||
      text.includes("saran ai") ||
      text.includes("saran kamu") ||
      text.includes("saranmu") ||
      compactText === "sarananda" ||
      compactText === "saranaja" ||
      compactText === "pakesaranandaaja")
  ) {
    return { kind: "confirm_ai_suggestion", target: summary.suggestedTarget };
  }

  if (text === "2") {
    return { kind: "confirm_original" };
  }

  if (
    text === "4" ||
    text.includes("ganti bulan") ||
    text.includes("ganti tahun") ||
    text.includes("ubah tanggal") ||
    text.includes("ubah deadline") ||
    text.includes("ubah target") ||
    text.includes("bulan tahun lain")
  ) {
    return { kind: "request_custom_date" };
  }

  if (
    text === "3" ||
    text.includes("ubah nominal") ||
    text.includes("ganti nominal") ||
    text.includes("nominalnya salah") ||
    isNegativeAnswerConfirmation(rawAnswer)
  ) {
    return { kind: "restart_amount" };
  }

  return { kind: "unknown" };
};

const resolveOutgoingPrompt = async (context: RuntimeContext) => {
  return resolvePrompt(context);
};

const formatOutgoingPromptForChatBubbles = async (context: RuntimeContext) =>
  formatPromptForChatBubbles(await resolveOutgoingPrompt(context));

const toNumberOrNull = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object" && "toString" in value) {
    const parsed = Number((value as { toString: () => string }).toString());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const buildRuntimeContext = async (userId: string, existingUser?: User): Promise<RuntimeContext> => {
  const user = existingUser ?? (await prisma.user.findUnique({ where: { id: userId } }));
  if (!user) throw new Error("User not found");

  const onboardingSessionModel = getOnboardingSessionModel();
  const financialProfileModel = getFinancialProfileModel();
  const expensePlanModel = getExpensePlanModel();
  const financialGoalModel = getFinancialGoalModel();

  const [sessions, profile, activePlan, activeGoals] = await Promise.all([
    onboardingSessionModel
      ? onboardingSessionModel.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })
      : Promise.resolve([]),
    financialProfileModel
      ? financialProfileModel.findUnique({ where: { userId } })
      : Promise.resolve(null),
    expensePlanModel
      ? expensePlanModel.findFirst({ where: { userId, isActive: true }, orderBy: { createdAt: "desc" } })
      : Promise.resolve(null),
    financialGoalModel?.findMany
      ? financialGoalModel.findMany({
          where: {
            userId,
            status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] }
          },
          include: { contributions: { select: { amount: true } } },
          orderBy: [{ priorityOrder: "asc" }, { createdAt: "asc" }]
        })
      : Promise.resolve([])
  ]);

  const confirmedSessions = sessions.filter((item: OnboardingSession) => item.isCompleted === true);
  const selectedGoalTypes = getSelectedGoalTypes(confirmedSessions);
  const goalPlanRecommendation = getGoalPlanRecommendation(confirmedSessions);
  const pendingGoalDetail = getPendingGoalDetail(confirmedSessions);
  const pendingAssetDetail = getPendingAssetDetail(confirmedSessions);
  const guidedOtherExpenseState = getGuidedOtherExpenseState(confirmedSessions);
  const activeIncomeState = getActiveIncomeOnboardingState({
    sessions: confirmedSessions,
    salaryDate: user.salaryDate ?? null
  });
  const goalExecutionModeSession = latestSessionForQuestion(
    confirmedSessions,
    OnboardingQuestionKey.GOAL_ALLOCATION_MODE
  );
  const priorityGoalSession = latestSessionForQuestion(
    confirmedSessions,
    OnboardingQuestionKey.GOAL_PRIORITY_FOCUS
  );
  const activeIncomeMonthly = toNumberOrNull(profile?.activeIncomeMonthly);
  const passiveIncomeMonthly = toNumberOrNull(profile?.passiveIncomeMonthly);
  const estimatedMonthlyIncome = toNumberOrNull(profile?.estimatedMonthlyIncome);
  const storedMonthlyIncomeTotal = toNumberOrNull(profile?.monthlyIncomeTotal);
  const planMonthlyExpenseTotal = toNumberOrNull(activePlan?.totalMonthlyExpense);
  const storedMonthlyExpenseTotal = toNumberOrNull(profile?.monthlyExpenseTotal);
  const monthlyIncomeTotal =
    storedMonthlyIncomeTotal ??
    ((activeIncomeMonthly ?? 0) + (passiveIncomeMonthly ?? 0) > 0
      ? (activeIncomeMonthly ?? 0) + (passiveIncomeMonthly ?? 0)
      : estimatedMonthlyIncome);
  const monthlyExpenseTotal = planMonthlyExpenseTotal ?? storedMonthlyExpenseTotal;
  const potentialMonthlySaving =
    toNumberOrNull(profile?.potentialMonthlySaving) ??
    (monthlyIncomeTotal !== null && monthlyExpenseTotal !== null
      ? monthlyIncomeTotal - monthlyExpenseTotal
      : null);
  const storedPriorityOrderAnswer = isStoredGoalPriorityOrderAnswer(
    priorityGoalSession?.normalizedAnswerJson
  )
    ? (priorityGoalSession?.normalizedAnswerJson as StoredGoalPriorityOrderAnswer)
    : null;
  const activeGoalsByStoredPriority = Array.isArray(activeGoals)
    ? [...activeGoals].filter((goal: any) => isActiveOnboardingGoalType(goal.goalType))
    : [];
  if (storedPriorityOrderAnswer?.priorityOrder?.length) {
    const orderLookup = new Map(
      storedPriorityOrderAnswer.priorityOrder.map((goal, index) => [
        `${goal.goalType}:${normalizeText(goal.goalName)}`,
        index
      ])
    );
    activeGoalsByStoredPriority.sort((left: any, right: any) => {
      const leftKey = `${left.goalType}:${normalizeText(left.goalName)}`;
      const rightKey = `${right.goalType}:${normalizeText(right.goalName)}`;
      const leftIndex = orderLookup.get(leftKey);
      const rightIndex = orderLookup.get(rightKey);
      if (leftIndex !== undefined && rightIndex !== undefined) {
        return leftIndex - rightIndex;
      }
      if (leftIndex !== undefined) return -1;
      if (rightIndex !== undefined) return 1;
      const leftPriority = typeof left.priorityOrder === "number" ? left.priorityOrder : Number.MAX_SAFE_INTEGER;
      const rightPriority = typeof right.priorityOrder === "number" ? right.priorityOrder : Number.MAX_SAFE_INTEGER;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return new Date(left.createdAt ?? 0).getTime() - new Date(right.createdAt ?? 0).getTime();
    });
  }
  const resolvedGoalExecutionMode =
    storedPriorityOrderAnswer?.executionMode ??
    goalPlanRecommendation.executionMode ??
    user.goalExecutionMode ??
    null;
  const priorityGoalTypeCandidate =
    storedPriorityOrderAnswer?.priorityGoalType ??
    goalPlanRecommendation.priorityGoalType ??
    null;
  const resolvedPriorityGoalType = isActiveOnboardingGoalType(priorityGoalTypeCandidate)
    ? priorityGoalTypeCandidate
    : null;
  const emergencyFundTargetAmount = toNumberOrNull(profile?.emergencyFundTarget);
  const hasChosenGoalExecutionMode = Boolean(goalExecutionModeSession);
  const hasChosenPriorityGoal =
    Boolean(priorityGoalSession) &&
    !isStoredGoalPriorityOrderAnswer(priorityGoalSession?.normalizedAnswerJson);
  const hasPersonalizationPending = pendingGoalDetail !== null;

  return {
    user,
    sessions,
    activeGoals: activeGoalsByStoredPriority.map((goal: any) => ({
      goalType: goal.goalType,
      goalName: goal.goalName,
      targetAmount: toNumberOrNull(goal.targetAmount),
      currentSavedAmount: Array.isArray(goal.contributions)
        ? goal.contributions.reduce(
            (sum: number, contribution: { amount?: unknown }) =>
              sum + (toNumberOrNull(contribution.amount) ?? 0),
            0
          )
        : 0,
      targetMonth: goal.targetMonth ?? null,
      targetYear: goal.targetYear ?? null,
      status: goal.status,
      priorityOrder: goal.priorityOrder ?? null
    })),
    needsPhoneVerification: !/^62\d{7,15}$/.test(user.waNumber),
    budgetMode: user.budgetMode ?? null,
    employmentTypes: getEmploymentTypes(confirmedSessions),
    activeGoalCount: selectedGoalTypes.length,
    selectedGoalTypes,
    latestCustomGoalName: getLatestCustomGoalName(confirmedSessions),
    goalExecutionMode: resolvedGoalExecutionMode,
    priorityGoalType: resolvedPriorityGoalType,
    hasChosenGoalExecutionMode,
    hasChosenPriorityGoal,
    hasPersonalizationPending,
    pendingGoalStep: pendingGoalDetail?.step ?? null,
    currentGoalType: getCurrentGoalType(confirmedSessions),
    pendingAssetStep: pendingAssetDetail?.step ?? null,
    currentAssetType: getCurrentAssetType(confirmedSessions, user.onboardingStep),
    currentGoldType: getCurrentGoldType(confirmedSessions),
    expenseAvailable: Boolean(activePlan || monthlyExpenseTotal != null),
    hasExpenseDependentGoal: hasExpenseDependentGoalSelection(confirmedSessions),
    goalExpenseStrategy: getGoalExpenseStrategy(confirmedSessions),
    activeIncomeMode: activeIncomeState.activeIncomeMode,
    activeIncomeCount: activeIncomeState.activeIncomeCount,
    activeIncomePaydays: activeIncomeState.activeIncomePaydays,
    activeIncomeAmountCount: activeIncomeState.activeIncomeAmounts.length,
    activeIncomePaydayCount: activeIncomeState.activeIncomePaydays.length,
    activeIncomeLatestPayday: activeIncomeState.activeIncomeLatestPayday,
    activeIncomeCycleStartDay: activeIncomeState.activeIncomeCycleStartDay,
    activeIncomeMonthly,
    passiveIncomeMonthly,
    estimatedMonthlyIncome,
    monthlyIncomeTotal,
    monthlyExpenseTotal,
    potentialMonthlySaving,
    guidedOtherExpenseStage: guidedOtherExpenseState.stage,
    guidedOtherExpensePendingLabel: guidedOtherExpenseState.pendingLabel,
    guidedOtherExpenseItems: buildGuidedExpenseSummaryItems(
      confirmedSessions,
      guidedOtherExpenseState.items
    ),
    emergencyFundTargetAmount
  };
};

const LEGACY_GOAL_DECISION_STEPS = new Set<OnboardingStep>([
  OnboardingStep.ASK_GOAL_ALLOCATION_MODE,
  OnboardingStep.ASK_GOAL_PRIORITY_FOCUS
]);

const ANSWERED_PROGRESS_STEPS = new Set<OnboardingStep>([
  OnboardingStep.ASK_BUDGET_MODE,
  OnboardingStep.ASK_EMPLOYMENT_TYPES,
  OnboardingStep.ASK_HAS_ACTIVE_INCOME,
  OnboardingStep.ASK_HAS_PASSIVE_INCOME,
  OnboardingStep.ASK_PASSIVE_INCOME,
  OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME,
  OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN,
  OnboardingStep.ASK_GUIDED_EXPENSE_FOOD,
  OnboardingStep.ASK_GUIDED_EXPENSE_TRANSPORT,
  OnboardingStep.ASK_GUIDED_EXPENSE_BILLS,
  OnboardingStep.ASK_GUIDED_EXPENSE_ENTERTAINMENT
]);

const getConfirmedSessionAnswer = <T>(
  sessions: OnboardingSession[],
  questionKey: OnboardingQuestionKey
) =>
  getSessionNormalizedValue<T>(
    latestSessionForQuestion(
      sessions.filter((item) => item.isCompleted === true),
      questionKey
    )
  );

const getAnsweredProgressStepValue = (
  context: RuntimeContext,
  step: OnboardingStep
) => {
  switch (step) {
    case OnboardingStep.ASK_BUDGET_MODE:
      return (
        context.budgetMode ??
        getConfirmedSessionAnswer<BudgetMode>(context.sessions, OnboardingQuestionKey.BUDGET_MODE)
      );
    case OnboardingStep.ASK_EMPLOYMENT_TYPES:
      return context.employmentTypes.length
        ? context.employmentTypes
        : getConfirmedSessionAnswer<string[]>(
            context.sessions,
            OnboardingQuestionKey.EMPLOYMENT_TYPES
          );
    case OnboardingStep.ASK_HAS_ACTIVE_INCOME:
      return getConfirmedSessionAnswer<boolean>(
        context.sessions,
        OnboardingQuestionKey.HAS_ACTIVE_INCOME
      );
    case OnboardingStep.ASK_ACTIVE_INCOME:
      return getConfirmedSessionAnswer<number>(
        context.sessions,
        OnboardingQuestionKey.ACTIVE_INCOME_MONTHLY
      );
    case OnboardingStep.ASK_SALARY_DATE:
      return (
        context.user.salaryDate ??
        getConfirmedSessionAnswer<number>(context.sessions, OnboardingQuestionKey.SALARY_DATE)
      );
    case OnboardingStep.ASK_HAS_PASSIVE_INCOME:
      return typeof context.user.hasPassiveIncome === "boolean"
        ? context.user.hasPassiveIncome
        : getConfirmedSessionAnswer<boolean>(
            context.sessions,
            OnboardingQuestionKey.HAS_PASSIVE_INCOME
          );
    case OnboardingStep.ASK_PASSIVE_INCOME:
      return getConfirmedSessionAnswer<number | MoneyRangeAnswer>(
        context.sessions,
        OnboardingQuestionKey.PASSIVE_INCOME_MONTHLY
      );
    case OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME:
      return getConfirmedSessionAnswer<number>(
        context.sessions,
        OnboardingQuestionKey.ESTIMATED_MONTHLY_INCOME
      );
    case OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN:
      return getConfirmedSessionAnswer<ExpenseBreakdown>(
        context.sessions,
        OnboardingQuestionKey.MANUAL_EXPENSE_BREAKDOWN
      );
    case OnboardingStep.ASK_GUIDED_EXPENSE_FOOD:
      return getConfirmedSessionAnswer<number>(
        context.sessions,
        OnboardingQuestionKey.GUIDED_EXPENSE_FOOD
      );
    case OnboardingStep.ASK_GUIDED_EXPENSE_TRANSPORT:
      return getConfirmedSessionAnswer<number>(
        context.sessions,
        OnboardingQuestionKey.GUIDED_EXPENSE_TRANSPORT
      );
    case OnboardingStep.ASK_GUIDED_EXPENSE_BILLS:
      return getConfirmedSessionAnswer<number>(
        context.sessions,
        OnboardingQuestionKey.GUIDED_EXPENSE_BILLS
      );
    case OnboardingStep.ASK_GUIDED_EXPENSE_ENTERTAINMENT:
      return getConfirmedSessionAnswer<number>(
        context.sessions,
        OnboardingQuestionKey.GUIDED_EXPENSE_ENTERTAINMENT
      );
    default:
      return null;
  }
};

const migrateAnsweredProgressStepIfNeeded = async (user: User) => {
  let currentUser = user;

  while (ANSWERED_PROGRESS_STEPS.has(currentUser.onboardingStep)) {
    const context = await buildRuntimeContext(currentUser.id, currentUser);
    const answeredValue = getAnsweredProgressStepValue(
      context,
      currentUser.onboardingStep
    );

    if (
      answeredValue === null ||
      answeredValue === undefined ||
      (Array.isArray(answeredValue) && answeredValue.length === 0)
    ) {
      break;
    }

    const nextStep = getNextOnboardingStep(
      currentUser.onboardingStep,
      context,
      answeredValue
    );

    if (nextStep === currentUser.onboardingStep) {
      break;
    }

    currentUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: { onboardingStep: nextStep }
    });
  }

  return currentUser;
};

const migrateLegacyGoalDecisionStepIfNeeded = async (user: User) => {
  if (user.onboardingStep === OnboardingStep.ASK_PERSONALIZATION_CHOICE) {
    const context = await buildRuntimeContext(user.id, user);
    const nextStep = getNextOnboardingStep(
      OnboardingStep.ASK_PERSONALIZATION_CHOICE,
      context,
      true
    );

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { onboardingStep: nextStep }
    });
    return migrateAnsweredProgressStepIfNeeded(updatedUser);
  }

  if (!LEGACY_GOAL_DECISION_STEPS.has(user.onboardingStep)) {
    return migrateAnsweredProgressStepIfNeeded(user);
  }

  const onboardingSessionModel = getOnboardingSessionModel();
  const sessions = onboardingSessionModel
    ? ((await onboardingSessionModel.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" }
      })) as OnboardingSession[])
    : [];

  await syncAutomaticGoalRecommendation(user.id, sessions);

  const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!updatedUser) {
    return user;
  }

  const updatedContext = await buildRuntimeContext(user.id, updatedUser);
  const nextStep = getNextOnboardingStep(
    updatedUser.onboardingStep,
    updatedContext,
    updatedUser.goalExecutionMode ?? true
  );

  const migratedUser = await prisma.user.update({
    where: { id: user.id },
    data: { onboardingStep: nextStep }
  });
  return migrateAnsweredProgressStepIfNeeded(migratedUser);
};

const buildAssetCreatePayload = async (
  context: RuntimeContext,
  normalizedAnswer: SessionAnswerValue
) => {
  switch (context.user.onboardingStep) {
    case OnboardingStep.ASK_ASSET_SAVINGS_BALANCE: {
      const assetName =
        getLatestAnswerValue<string>(context, OnboardingQuestionKey.ASSET_SAVINGS_NAME) ??
        getLatestAssetName(context.sessions, OnboardingQuestionKey.ASSET_NAME) ??
        "Simpanan";
      const amount = normalizedAnswer as number;
      return {
        assetType: AssetType.SAVINGS,
        assetName,
        quantity: 1,
        unit: "account",
        unitPrice: amount,
        estimatedValue: amount,
        notes: buildAssetValuationNotes("MANUAL_USER", { assetKind: "savings" })
      };
    }
    case OnboardingStep.ASK_ASSET_GOLD_GRAMS:
    case OnboardingStep.ASK_ASSET_GOLD_KARAT:
    case OnboardingStep.ASK_ASSET_GOLD_PLATFORM: {
      const goldType =
        context.currentGoldType ??
        getLatestAnswerValue<GoldAssetTypeValue>(context, OnboardingQuestionKey.ASSET_GOLD_TYPE);
      const grams =
        context.user.onboardingStep === OnboardingStep.ASK_ASSET_GOLD_GRAMS
          ? getNumericAnswerValue(normalizedAnswer as number | NumericRangeAnswer)
          : getNumericAnswerValue(
              getLatestAnswerValue<number | NumericRangeAnswer>(
                context,
                OnboardingQuestionKey.ASSET_GOLD_GRAMS
              )
            );
      const gramsAnswer =
        context.user.onboardingStep === OnboardingStep.ASK_ASSET_GOLD_GRAMS
          ? (normalizedAnswer as number | NumericRangeAnswer)
          : getLatestAnswerValue<number | NumericRangeAnswer>(
              context,
              OnboardingQuestionKey.ASSET_GOLD_GRAMS
            );

      if (!goldType || !grams || grams <= 0) {
        throw buildOnboardingAssetError("Detail emasnya belum lengkap. Jawab lagi pertanyaan emas yang ini ya Boss.");
      }

      let quote;
      try {
        quote = await getMarketQuoteBySymbol("XAU");
      } catch {
        throw buildOnboardingAssetError("Harga emasnya lagi belum bisa saya cek. Coba sebentar lagi ya Boss.");
      }
      let unitPrice = quote.price;

      if (goldType === "JEWELRY") {
        const karat =
          context.user.onboardingStep === OnboardingStep.ASK_ASSET_GOLD_KARAT
            ? (normalizedAnswer as GoldAssetKaratValue)
            : getLatestAnswerValue<GoldAssetKaratValue>(context, OnboardingQuestionKey.ASSET_GOLD_KARAT);

        unitPrice *= getGoldPurityMultiplier(karat);

        return {
          assetType: AssetType.GOLD,
          assetName: `Perhiasan emas ${getGoldKaratLabel(karat)}`,
          symbol: "XAU",
          quantity: grams,
          unit: "gram",
          unitPrice,
          estimatedValue: Math.round(unitPrice * grams),
          notes: buildAssetValuationNotes("MARKET_LIVE", {
            goldType,
            karat: karat ?? null,
            priceSource: quote.source,
            ...buildNumericRangeNote("reportedGramRange", gramsAnswer)
          })
        };
      }

      if (goldType === "DIGITAL") {
        const platform =
          context.user.onboardingStep === OnboardingStep.ASK_ASSET_GOLD_PLATFORM
            ? (normalizedAnswer as GoldAssetPlatformValue)
            : getLatestAnswerValue<GoldAssetPlatformValue>(context, OnboardingQuestionKey.ASSET_GOLD_PLATFORM);

        return {
          assetType: AssetType.GOLD,
          assetName: `Emas digital ${getGoldPlatformLabel(platform)}`,
          symbol: "XAU",
          quantity: grams,
          unit: "gram",
          unitPrice,
          estimatedValue: Math.round(unitPrice * grams),
          notes: buildAssetValuationNotes("MARKET_LIVE", {
            goldType,
            platform: platform ?? null,
            priceSource: quote.source,
            ...buildNumericRangeNote("reportedGramRange", gramsAnswer)
          })
        };
      }

      const brand = getLatestAnswerValue<GoldAssetBrandValue>(context, OnboardingQuestionKey.ASSET_GOLD_BRAND);
      return {
        assetType: AssetType.GOLD,
        assetName: buildGoldAssetName(context),
        symbol: "XAU",
        quantity: grams,
        unit: "gram",
        unitPrice,
        estimatedValue: Math.round(unitPrice * grams),
        notes: buildAssetValuationNotes("MARKET_LIVE", {
          goldType: goldType ?? "BULLION",
          brand: brand ?? null,
          priceSource: quote.source,
          ...buildNumericRangeNote("reportedGramRange", gramsAnswer)
        })
      };
    }
    case OnboardingStep.ASK_ASSET_STOCK_LOTS: {
      const symbol =
        getLatestAnswerValue<string>(context, OnboardingQuestionKey.ASSET_STOCK_SYMBOL) ??
        getLatestAssetName(context.sessions, OnboardingQuestionKey.ASSET_NAME);
      if (!symbol) {
        throw buildOnboardingAssetError("Saya belum nangkep kode sahamnya. Coba kirim lagi kodenya ya Boss.");
      }

      let quote;
      try {
        quote = await getMarketQuoteBySymbol(symbol);
      } catch {
        throw buildOnboardingAssetError("Saham ini belum ketemu. Coba pakai kode seperti `BBRI` atau `BBCA` ya Boss.");
      }
      const lotAnswer = normalizedAnswer as number | NumericRangeAnswer;
      const lotCount = getNumericAnswerValue(lotAnswer);
      if (!lotCount || lotCount <= 0) {
        throw buildOnboardingAssetError("Jumlah lot sahamnya belum lengkap. Jawab lagi pertanyaan yang ini ya Boss.");
      }
      const shareCount = lotCount * 100;

      return {
        assetType: AssetType.STOCK,
        assetName: quote.symbol,
        symbol: quote.symbol,
        quantity: shareCount,
        unit: "share",
        unitPrice: quote.price,
        estimatedValue: Math.round(quote.price * shareCount),
        notes: buildAssetValuationNotes("MARKET_LIVE", {
          lotCount,
          priceSource: quote.source,
          ...buildNumericRangeNote("reportedLotRange", lotAnswer)
        })
      };
    }
    case OnboardingStep.ASK_ASSET_PROPERTY_ESTIMATED_VALUE: {
      const assetName =
        getLatestAnswerValue<string>(context, OnboardingQuestionKey.ASSET_PROPERTY_NAME) ??
        getLatestAssetName(context.sessions, OnboardingQuestionKey.ASSET_NAME) ??
        "Properti";
      const amount = normalizedAnswer as number;
      return {
        assetType: AssetType.PROPERTY,
        assetName,
        quantity: 1,
        unit: "property",
        unitPrice: amount,
        estimatedValue: amount,
        notes: buildAssetValuationNotes("MANUAL_USER", { assetKind: "property" })
      };
    }
    case OnboardingStep.ASK_ASSET_ESTIMATED_VALUE: {
      if (context.currentAssetType === AssetType.SAVINGS) {
        return {
          assetType: AssetType.SAVINGS,
          assetName:
            getLatestAnswerValue<string>(context, OnboardingQuestionKey.ASSET_SAVINGS_NAME) ??
            getLatestAssetName(context.sessions, OnboardingQuestionKey.ASSET_NAME) ??
            "Simpanan",
          quantity: 1,
          unit: "account",
          unitPrice: normalizedAnswer as number,
          estimatedValue: normalizedAnswer as number,
          notes: buildAssetValuationNotes("MANUAL_USER", { assetKind: "savings" })
        };
      }

      if (context.currentAssetType === AssetType.PROPERTY) {
        return {
          assetType: AssetType.PROPERTY,
          assetName:
            getLatestAnswerValue<string>(context, OnboardingQuestionKey.ASSET_PROPERTY_NAME) ??
            getLatestAssetName(context.sessions, OnboardingQuestionKey.ASSET_NAME) ??
            "Properti",
          quantity: 1,
          unit: "property",
          unitPrice: normalizedAnswer as number,
          estimatedValue: normalizedAnswer as number,
          notes: buildAssetValuationNotes("MANUAL_USER", { assetKind: "property" })
        };
      }

      if (context.currentAssetType === AssetType.STOCK) {
        context = {
          ...context,
          user: { ...context.user, onboardingStep: OnboardingStep.ASK_ASSET_STOCK_LOTS }
        };
        return buildAssetCreatePayload(context, normalizedAnswer);
      }

      return null;
    }
    default:
      return null;
  }
};

const resetAssetSessionScopeIfNeeded = async (
  context: RuntimeContext,
  pendingConfirmation?: OnboardingSession | null
) => {
  if (context.user.onboardingStep !== OnboardingStep.ASK_ASSET_SELECTION) return;

  const latestCompletedSession = context.sessions
    .filter((session) => session.isCompleted && session.id !== pendingConfirmation?.id)
    .at(-1);

  if (
    latestCompletedSession?.questionKey === OnboardingQuestionKey.ASSET_ADD_MORE &&
    latestCompletedSession.normalizedAnswerJson === true
  ) {
    return;
  }

  const staleAssetSessions = context.sessions.filter(
    (session) =>
      session.id !== pendingConfirmation?.id &&
      ASSET_ONBOARDING_QUESTION_KEYS.has(session.questionKey)
  );

  if (!staleAssetSessions.length) return;

  const onboardingSessionModel = getOnboardingSessionModel();
  if (!onboardingSessionModel?.deleteMany) return;

  for (const session of staleAssetSessions) {
    await onboardingSessionModel.deleteMany({
      where: { id: session.id }
    });
  }
};

const saveSessionAnswer = async (params: {
  userId: string;
  stepKey: OnboardingStep;
  questionKey: OnboardingQuestionKey;
  rawAnswer: unknown;
  normalizedAnswer: SessionAnswerValue;
  isCompleted?: boolean;
  replaceSessionId?: string | null;
}) => {
  const onboardingSessionModel = getOnboardingSessionModel();
  if (!onboardingSessionModel) return null;

  const sessionData = {
    userId: params.userId,
    stepKey: params.stepKey,
    questionKey: params.questionKey,
    rawAnswerJson: params.rawAnswer as Prisma.InputJsonValue,
    normalizedAnswerJson: params.normalizedAnswer as Prisma.InputJsonValue,
    isCompleted: params.isCompleted ?? true
  };

  if (params.replaceSessionId && onboardingSessionModel.update) {
    return onboardingSessionModel.update({
      where: { id: params.replaceSessionId },
      data: sessionData
    });
  }

  return onboardingSessionModel.create({
    data: sessionData
  });
};

const goalNameByType = (goalType: FinancialGoalType, customName: string | null) => {
  if (goalType === FinancialGoalType.CUSTOM) return customName ?? "Custom Target";
  if (goalType === FinancialGoalType.EMERGENCY_FUND) return "Dana Darurat";
  if (goalType === FinancialGoalType.HOUSE) return "Beli Rumah";
  if (goalType === FinancialGoalType.VEHICLE) return "Beli Kendaraan";
  if (goalType === FinancialGoalType.VACATION) return "Liburan";
  return "Target Keuangan";
};

const PROFILE_RECALCULATION_STEPS: OnboardingStep[] = [
  OnboardingStep.ASK_ACTIVE_INCOME,
  OnboardingStep.ASK_PASSIVE_INCOME,
  OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME,
  OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN,
  OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS,
  OnboardingStep.ASK_PRIMARY_GOAL,
  OnboardingStep.ASK_GOAL_SELECTION,
  OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
  OnboardingStep.ASK_GOAL_EXPENSE_STRATEGY,
  OnboardingStep.ASK_GOAL_EXPENSE_TOTAL,
  OnboardingStep.ASK_ASSET_GOLD_GRAMS,
  OnboardingStep.ASK_ASSET_ESTIMATED_VALUE
];

const needsProfileRecalculation = (step: OnboardingStep) =>
  PROFILE_RECALCULATION_STEPS.includes(step);

const getSelectedExpenseGoalTypes = (sessions: OnboardingSession[]) =>
  Array.from(
    new Set(
      getSelectedGoalTypes(sessions).filter(
        (goalType) => goalType === FinancialGoalType.EMERGENCY_FUND
      )
    )
  );

const buildAutomaticGoalRecommendationText = (sessions: OnboardingSession[]) => {
  const recommendation = getGoalPlanRecommendation(sessions);
  if (recommendation.orderedGoals.length <= 1) return null;

  const leadGoals =
    recommendation.executionMode === "PARALLEL"
      ? recommendation.orderedGoals.slice(0, 2)
      : recommendation.orderedGoals.slice(0, 1);
  const laterGoals = recommendation.orderedGoals.slice(leadGoals.length);
  const laterGoalNames = laterGoals.map((goal) => goal.goalName);

  const lines = ["Biar langkahnya rapi, saya bantu urutin targetnya ya Boss."];

  if (recommendation.executionMode === "PARALLEL" && leadGoals.length >= 2) {
    lines.push(
      `${joinNaturalLabels(leadGoals.map((goal) => goal.goalName))} enaknya jalan bareng dulu karena waktunya berdekatan.`
    );
  } else {
    lines.push(`Saya saranin fokus dulu ke ${leadGoals[0]?.goalName} ya Boss.`);
  }

  if (laterGoalNames.length) {
    lines.push(`Setelah itu baru lanjut ke ${joinNaturalLabels(laterGoalNames)}.`);
  }

  return lines.join("\n");
};

const syncPriorityOrderSession = async (params: {
  userId: string;
  sessions: OnboardingSession[];
  recommendation: ReturnType<typeof getGoalPlanRecommendation>;
}) => {
  const onboardingSessionModel = getOnboardingSessionModel();
  if (!onboardingSessionModel?.create) return;

  const normalizedAnswer: StoredGoalPriorityOrderAnswer = {
    priorityOrder: params.recommendation.orderedGoalDetails,
    executionMode: params.recommendation.executionMode,
    priorityGoalType: params.recommendation.priorityGoalType
  };
  const existingMetadataSession = [...params.sessions]
    .reverse()
    .find(
      (session) =>
        session.questionKey === OnboardingQuestionKey.GOAL_PRIORITY_FOCUS &&
        isStoredGoalPriorityOrderAnswer(session.normalizedAnswerJson)
    );

  const sessionData = {
    userId: params.userId,
    stepKey: OnboardingStep.ASK_GOAL_SELECTION,
    questionKey: OnboardingQuestionKey.GOAL_PRIORITY_FOCUS,
    rawAnswerJson: "AUTO_PRIORITY_ORDER" as Prisma.InputJsonValue,
    normalizedAnswerJson: normalizedAnswer as Prisma.InputJsonValue,
    isCompleted: true
  };

  if (existingMetadataSession?.id && onboardingSessionModel.update) {
    await onboardingSessionModel.update({
      where: { id: existingMetadataSession.id },
      data: sessionData
    });
    return;
  }

  await onboardingSessionModel.create({
    data: sessionData
  });
};

const syncAutomaticGoalRecommendation = async (
  userId: string,
  sessions: OnboardingSession[]
) => {
  const recommendation = getGoalPlanRecommendation(sessions);
  await prisma.user.update({
    where: { id: userId },
    data: {
      goalExecutionMode: recommendation.executionMode,
      priorityGoalType: recommendation.priorityGoalType
    }
  });

  if (recommendation.orderedGoals.length) {
    await syncFinancialGoalPriorities({
      userId,
      goals: recommendation.orderedGoals
    });
  }

  await syncPriorityOrderSession({
    userId,
    sessions,
    recommendation
  });
};

const getGoalRecommendationTextForTransition = async (params: {
  userId: string;
  currentStep: OnboardingStep;
  normalizedAnswer: SessionAnswerValue;
  nextStep: OnboardingStep;
}) => {
  if (
    !(
      (params.currentStep === OnboardingStep.ASK_GOAL_SELECTION &&
        Array.isArray(params.normalizedAnswer)) ||
      (params.currentStep === OnboardingStep.ASK_GOAL_ADD_MORE &&
        params.normalizedAnswer === false)
    ) ||
    params.nextStep !== OnboardingStep.ASK_BUDGET_MODE
  ) {
    return null;
  }

  const onboardingSessionModel = getOnboardingSessionModel();
  if (!onboardingSessionModel) return null;

  const sessions = (await onboardingSessionModel.findMany({
    where: { userId: params.userId },
    orderBy: { createdAt: "asc" }
  })) as OnboardingSession[];

  return buildAutomaticGoalRecommendationText(sessions);
};

const getTransitionLeadTexts = async (params: {
  userId: string;
  currentStep: OnboardingStep;
  normalizedAnswer: SessionAnswerValue;
  nextStep: OnboardingStep;
}) => {
  const texts: string[] = [];
  const recommendationText = await getGoalRecommendationTextForTransition(params);
  if (recommendationText) {
    texts.push(recommendationText);
  }

  if (
    params.currentStep === OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS &&
    params.nextStep === OnboardingStep.ASK_ASSET_SELECTION
  ) {
    const context = await buildRuntimeContext(params.userId);
    const guidedExpenseSummary = formatGuidedExpenseSummaryText(
      context.guidedOtherExpenseItems ?? [],
      {
        monthlyExpenseTotal: context.monthlyExpenseTotal,
        potentialMonthlySaving: context.potentialMonthlySaving
      }
    );
    if (guidedExpenseSummary) {
      texts.push(guidedExpenseSummary);
    }
  }

  if (
    shouldSeparateNextPromptBubble(params.currentStep, params.nextStep)
  ) {
    texts.push(getAssetTransitionLeadText());
  }

  return texts;
};

const describeBudgetModeChoice = (value: string) => {
  switch (value) {
    case BudgetMode.MANUAL_PLAN:
      return "kamu sudah punya gambaran pengeluaran";
    case BudgetMode.GUIDED_PLAN:
      return "kamu mau dibantu susun dulu";
    default:
      return `cara mulai lihat pengeluarannya lewat ${findOptionLabel(
        BUDGET_MODE_OPTIONS,
        value
      ).toLowerCase()}`;
  }
};

const goalNeedsManualTargetAmount = (goalType: FinancialGoalType) =>
  goalType === FinancialGoalType.HOUSE ||
  goalType === FinancialGoalType.VEHICLE ||
  goalType === FinancialGoalType.VACATION ||
  goalType === FinancialGoalType.CUSTOM;

const getGoalDisplayNameForContext = (context: RuntimeContext, goalType: FinancialGoalType) =>
  goalNameByType(goalType, getLatestCustomGoalName(context.sessions));

const getOnboardingGoalTargetAmount = (
  sessions: OnboardingSession[],
  targetGoalType: FinancialGoalType
) => {
  const confirmedSessions = sessions.filter((item) => item.isCompleted === true);
  const targetAmounts = confirmedSessions
    .filter((item) => item.questionKey === OnboardingQuestionKey.GOAL_TARGET_AMOUNT)
    .map((item) => getSessionNormalizedValue<number>(item))
    .filter((item): item is number => typeof item === "number" && Number.isFinite(item) && item > 0);

  let targetAmountIndex = 0;
  for (const goalType of getSelectedGoalTypes(confirmedSessions)) {
    if (!goalNeedsManualTargetAmount(goalType)) continue;
    const amount = targetAmounts[targetAmountIndex] ?? null;
    targetAmountIndex += 1;
    if (goalType === targetGoalType) return amount;
  }

  return null;
};

const describeStoredAnswer = (
  context: RuntimeContext,
  normalizedAnswer: SessionAnswerValue
) => {
  switch (context.user.onboardingStep) {
    case OnboardingStep.WAIT_REGISTER:
      return "kamu siap mulai onboarding";
    case OnboardingStep.VERIFY_PHONE:
      return `nomor WhatsApp aktifnya ${normalizedAnswer as string}`;
    case OnboardingStep.ASK_EMPLOYMENT_TYPES: {
      const labels = (normalizedAnswer as string[]).map((value) =>
        findOptionLabel(EMPLOYMENT_OPTIONS, value)
      );
      return `peran kamu sekarang sebagai ${joinNaturalLabels(labels)}`;
    }
    case OnboardingStep.ASK_HAS_ACTIVE_INCOME:
      return (normalizedAnswer as boolean)
        ? "sekarang ada income aktif rutin"
        : "sekarang belum ada income aktif rutin";
    case STEP_ACTIVE_INCOME_COUNT:
      return normalizedAnswer === "MULTIPLE"
        ? "income aktif rutin masuk lebih dari satu kali gajian"
        : "income aktif rutin masuk satu kali gajian";
    case OnboardingStep.ASK_ACTIVE_INCOME:
      return `income aktifnya sekitar ${formatMoney(normalizedAnswer as number)} per bulan`;
    case OnboardingStep.ASK_SALARY_DATE:
      return `tanggal gajiannya di tanggal ${normalizedAnswer as number}`;
    case STEP_ACTIVE_INCOME_CYCLE_CONFIRM:
      return (normalizedAnswer as boolean)
        ? "tanggal ini dipakai sebagai awal periode report"
        : "tanggal ini belum dipakai sebagai awal periode report";
    case STEP_ACTIVE_INCOME_ADD_MORE:
      return (normalizedAnswer as boolean)
        ? "masih ada income aktif lain yang mau ditambahkan"
        : "income aktifnya sudah selesai ditambahkan";
    case STEP_ACTIVE_INCOME_CYCLE_SELECT:
      return `awal periode report bulanan memakai tanggal ${normalizedAnswer as number}`;
    case OnboardingStep.ASK_HAS_PASSIVE_INCOME:
      return (normalizedAnswer as boolean)
        ? "selain itu ada income pasif juga"
        : "selain itu belum ada income pasif";
    case OnboardingStep.ASK_PASSIVE_INCOME:
      return describePassiveIncomeAnswer(normalizedAnswer);
    case OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME:
      return `estimasi total pemasukan bulanan sekitar ${formatMoney(normalizedAnswer as number)}`;
    case OnboardingStep.ASK_BUDGET_MODE:
      return describeBudgetModeChoice(normalizedAnswer as string);
    case OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN:
      return `gambaran pengeluaran bulanan sekitar ${formatMoney(
        parseManualBreakdownTotal(getManualExpenseDisplayBreakdown(normalizedAnswer)) ?? 0
      )}`;
    case OnboardingStep.ASK_GUIDED_EXPENSE_FOOD:
      return `pengeluaran makan dan minumnya sekitar ${formatMoney(normalizedAnswer as number)} per bulan`;
    case OnboardingStep.ASK_GUIDED_EXPENSE_TRANSPORT:
      return `pengeluaran transportnya sekitar ${formatMoney(normalizedAnswer as number)} per bulan`;
    case OnboardingStep.ASK_GUIDED_EXPENSE_BILLS:
      return `pengeluaran tagihannya sekitar ${formatMoney(normalizedAnswer as number)} per bulan`;
    case OnboardingStep.ASK_GUIDED_EXPENSE_ENTERTAINMENT:
      return `pengeluaran hiburannya sekitar ${formatMoney(normalizedAnswer as number)} per bulan`;
    case OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS:
      return describeGuidedOtherExpenseAnswer(normalizedAnswer);
    case OnboardingStep.ASK_PRIMARY_GOAL:
    case OnboardingStep.ASK_GOAL_SELECTION: {
      const labels = (Array.isArray(normalizedAnswer) ? normalizedAnswer : [normalizedAnswer])
        .filter((item): item is string => Boolean(item))
        .map((value) => findOptionLabel(GOAL_OPTIONS, value));

      if (!labels.length || (labels.length === 1 && labels[0] === findOptionLabel(GOAL_OPTIONS, GOAL_NONE_VALUE))) {
        return "untuk sekarang belum ada target finansial spesifik";
      }

      return `targetnya ${joinNaturalLabels(labels)}`;
    }
    case OnboardingStep.ASK_GOAL_CUSTOM_NAME:
      return `nama target customnya "${normalizedAnswer as string}"`;
    case OnboardingStep.ASK_GOAL_TARGET_AMOUNT:
      return `dana yang mau disiapkan untuk ${context.currentGoalType ? goalNameByType(context.currentGoalType, null).toLowerCase() : "target ini"} sekitar ${formatMoney(normalizedAnswer as number)}`;
    case OnboardingStep.ASK_GOAL_TARGET_DATE:
      return `target waktunya di ${
        getStoredGoalTargetSessionAnswer(normalizedAnswer)?.target.label ??
        (normalizedAnswer as MonthYearTargetAnswer).label
      }`;
    case OnboardingStep.ASK_GOAL_EXPENSE_STRATEGY:
      return `cara lanjutnya ${findOptionLabel(
        GOAL_EXPENSE_STRATEGY_OPTIONS,
        normalizedAnswer as string
      ).toLowerCase()}`;
    case OnboardingStep.ASK_GOAL_EXPENSE_TOTAL:
      return `total pengeluaran bulanan sekitar ${formatMoney(normalizedAnswer as number)}`;
    case OnboardingStep.ASK_GOAL_ALLOCATION_MODE:
      return `cara ngejarnya ${findOptionLabel(
        GOAL_ALLOCATION_MODE_OPTIONS,
        normalizedAnswer as string
      ).toLowerCase()}`;
    case OnboardingStep.ASK_GOAL_PRIORITY_FOCUS:
      return `target prioritasnya ${goalNameByType(normalizedAnswer as FinancialGoalType, getLatestCustomGoalName(context.sessions))}`;
    case OnboardingStep.ASK_GOAL_ADD_MORE:
      return (normalizedAnswer as boolean)
        ? "setelah ini masih ada target lain yang mau dimasukin"
        : "setelah ini belum ada target tambahan";
    case OnboardingStep.ASK_ASSET_SELECTION: {
      const labels = (Array.isArray(normalizedAnswer) ? normalizedAnswer : [normalizedAnswer])
        .filter((item): item is string => Boolean(item))
        .map((value) => findOptionLabel(ASSET_OPTIONS, value));

      if (!labels.length || (labels.length === 1 && labels[0] === findOptionLabel(ASSET_OPTIONS, ASSET_NONE_VALUE))) {
        return "untuk sekarang belum ada aset yang mau dipantau";
      }

      return `aset yang mau dipantau ${joinNaturalLabels(labels)}`;
    }
    case OnboardingStep.ASK_ASSET_SAVINGS_NAME:
      return `tempat simpanannya "${normalizedAnswer as string}"`;
    case OnboardingStep.ASK_ASSET_SAVINGS_BALANCE:
      return `jumlah simpanannya sekitar ${formatMoney(normalizedAnswer as number)}`;
    case OnboardingStep.ASK_ASSET_GOLD_TYPE:
    case OnboardingStep.ASK_ASSET_GOLD_NAME:
      return `jenis emasnya ${findOptionLabel(GOLD_TYPE_OPTIONS, normalizedAnswer as string)}`;
    case OnboardingStep.ASK_ASSET_GOLD_BRAND:
      return `brand emas batangannya ${findOptionLabel(GOLD_BRAND_OPTIONS, normalizedAnswer as string)}`;
    case OnboardingStep.ASK_ASSET_GOLD_GRAMS:
      return context.currentGoldType === "DIGITAL"
        ? isNumericRangeAnswer(normalizedAnswer)
          ? `jumlah emas digitalnya di kisaran ${formatNumericRange(normalizedAnswer)} gram`
          : `jumlah emas digitalnya sekitar ${formatQuantityValue(normalizedAnswer as number)} gram`
        : context.currentGoldType === "JEWELRY"
          ? isNumericRangeAnswer(normalizedAnswer)
            ? `berat perhiasannya di kisaran ${formatNumericRange(normalizedAnswer)} gram`
            : `berat perhiasannya sekitar ${formatQuantityValue(normalizedAnswer as number)} gram`
          : isNumericRangeAnswer(normalizedAnswer)
            ? `berat emas batangannya di kisaran ${formatNumericRange(normalizedAnswer)} gram`
            : `berat emas batangannya sekitar ${formatQuantityValue(normalizedAnswer as number)} gram`;
    case OnboardingStep.ASK_ASSET_GOLD_KARAT:
      return `karat perhiasannya ${findOptionLabel(GOLD_KARAT_OPTIONS, normalizedAnswer as string)}`;
    case OnboardingStep.ASK_ASSET_GOLD_PLATFORM:
      return `platform emas digitalnya ${findOptionLabel(GOLD_PLATFORM_OPTIONS, normalizedAnswer as string)}`;
    case OnboardingStep.ASK_ASSET_STOCK_SYMBOL:
      return `kode sahamnya "${normalizedAnswer as string}"`;
    case OnboardingStep.ASK_ASSET_STOCK_LOTS: {
      const symbol =
        getLatestAnswerValue<string>(context, OnboardingQuestionKey.ASSET_STOCK_SYMBOL) ?? "saham ini";
      return isNumericRangeAnswer(normalizedAnswer)
        ? `jumlah ${symbol} di kisaran ${formatNumericRange(normalizedAnswer)} lot`
        : `jumlah ${symbol} sekitar ${formatQuantityValue(normalizedAnswer as number)} lot`;
    }
    case OnboardingStep.ASK_ASSET_PROPERTY_NAME:
      return `nama propertinya "${normalizedAnswer as string}"`;
    case OnboardingStep.ASK_ASSET_PROPERTY_ESTIMATED_VALUE:
      return `estimasi nilai propertinya sekitar ${formatMoney(normalizedAnswer as number)}`;
    case OnboardingStep.ASK_ASSET_NAME:
      return `nama asetnya "${normalizedAnswer as string}"`;
    case OnboardingStep.ASK_ASSET_ESTIMATED_VALUE:
      if (context.currentAssetType === AssetType.STOCK) {
        const symbol =
          getLatestAnswerValue<string>(context, OnboardingQuestionKey.ASSET_STOCK_SYMBOL) ?? "saham ini";
        return isNumericRangeAnswer(normalizedAnswer)
          ? `jumlah ${symbol} di kisaran ${formatNumericRange(normalizedAnswer)} lot`
          : `jumlah ${symbol} sekitar ${formatQuantityValue(normalizedAnswer as number)} lot`;
      }
      return context.currentAssetType === AssetType.PROPERTY
        ? `estimasi nilai propertinya sekitar ${formatMoney(normalizedAnswer as number)}`
        : context.currentAssetType === AssetType.SAVINGS
          ? `jumlah simpanannya sekitar ${formatMoney(normalizedAnswer as number)}`
          : `estimasi nilai asetnya sekitar ${formatMoney(normalizedAnswer as number)}`;
    case OnboardingStep.ASK_ASSET_ADD_MORE:
      return (normalizedAnswer as boolean)
        ? "setelah ini masih ada aset lain yang mau dipantau"
        : "setelah ini belum ada aset tambahan";
    default:
      return "jawaban ini";
  }
};

const getTargetSimulationEmoji = (goalType: FinancialGoalType | null) => {
  switch (goalType) {
    case FinancialGoalType.HOUSE:
      return "🏠";
    case FinancialGoalType.VEHICLE:
      return "🚗";
    case FinancialGoalType.VACATION:
      return "🏖️";
    default:
      return "🎯";
  }
};

const formatGoalNameList = (goalNames: string[]) => {
  if (!goalNames.length) return "target sebelumnya";
  if (goalNames.length === 1) return goalNames[0];
  if (goalNames.length === 2) return `${goalNames[0]} dan ${goalNames[1]}`;
  return `${goalNames.slice(0, -1).join(", ")}, dan ${goalNames.at(-1)}`;
};

const getEmergencyFundMultiplierForUser = (context: RuntimeContext) =>
  context.user.incomeStability === IncomeStability.STABLE
    ? env.EMERGENCY_FUND_STABLE_MULTIPLIER
    : env.EMERGENCY_FUND_UNSTABLE_MULTIPLIER;

const formatEmergencyFundMultiplier = (multiplier: number) =>
  Number.isInteger(multiplier)
    ? `${multiplier}`
    : multiplier.toFixed(2).replace(/\.?0+$/, "");

const getEmergencyFundDisplayMultiplier = (
  context: RuntimeContext,
  targetAmount: number
) => {
  if (context.monthlyExpenseTotal !== null && context.monthlyExpenseTotal > 0) {
    const inferredMultiplier = targetAmount / context.monthlyExpenseTotal;

    if (Number.isFinite(inferredMultiplier) && inferredMultiplier > 0) {
      return formatEmergencyFundMultiplier(inferredMultiplier);
    }
  }

  return formatEmergencyFundMultiplier(getEmergencyFundMultiplierForUser(context));
};

const formatTargetAmountLine = (
  context: RuntimeContext,
  item: {
    goalType: FinancialGoalType | null;
    targetAmount: number | null;
  }
) => {
  if (item.targetAmount === null) return null;

  if (
    item.goalType === FinancialGoalType.EMERGENCY_FUND &&
    context.monthlyExpenseTotal !== null &&
    context.monthlyExpenseTotal > 0
  ) {
    const multiplier = getEmergencyFundDisplayMultiplier(context, item.targetAmount);
    return `Target ${formatMoney(item.targetAmount)} = ${formatMoney(context.monthlyExpenseTotal)} (pengeluaran bulanan) × ${multiplier}`;
  }

  return `Target: ${formatMoney(item.targetAmount)}`;
};

const compareGoalMonthYear = (
  left: { month: number; year: number } | null,
  right: { month: number; year: number } | null
) => {
  if (!left || !right) return null;
  return left.year === right.year ? left.month - right.month : left.year - right.year;
};

const getCurrentPlanningGoal = (summary: GoalTargetConfirmationSummary) =>
  summary.planningAnalysis?.goalSummaries.find(
    (goal) =>
      goal.goalName === summary.goalName &&
      goal.targetDateLabel === summary.targetAnswer.label
  ) ?? null;

const getAggressiveGoalTimelineContext = (
  context: RuntimeContext,
  summary: GoalTargetConfirmationSummary
) => {
  const roadmapGoals =
    summary.planningAnalysis?.goalSummaries.filter((goal) => goal.targetAmount !== null) ?? [];
  const currentGoalIndex = roadmapGoals.findIndex(
    (goal) =>
      goal.goalName === summary.goalName &&
      goal.targetDateLabel === summary.targetAnswer.label
  );
  const previousGoals = currentGoalIndex > 0 ? roadmapGoals.slice(0, currentGoalIndex) : [];
  const storedTargetAnswers =
    summary.planningAnalysis && previousGoals.length
      ? getStoredCompletedGoalTargetAnswers(context.sessions)
      : [];
  const previousCommitments = buildGoalTimelineCommitments({
    roadmapGoals: previousGoals,
    storedTargetAnswers
  });
  const previousBlocks = previousGoals
    .map((goal, index) => {
      const commitment = previousCommitments[index];
      const startLabel = commitment?.startRef.label ?? goal.startLabel;
      const endLabel = commitment?.endRef.label ?? goal.targetDateLabel ?? goal.realisticTargetLabel;
      const allocation =
        commitment?.allocation ??
        goal.requiredMonthlyAllocation ??
        (goal.availableMonthlyAllocation > 0 ? goal.availableMonthlyAllocation : null);

      if (!startLabel || !endLabel || allocation === null || allocation <= 0) return null;

      return {
        goalName: goal.goalName,
        goalType: goal.goalType,
        targetAmount: goal.targetAmount,
        startLabel,
        endLabel,
        allocation
      };
    })
    .filter(
      (item): item is {
        goalName: string;
        goalType: FinancialGoalType;
        targetAmount: number | null;
        startLabel: string;
        endLabel: string;
        allocation: number;
      } => Boolean(item)
    );

  return { previousBlocks };
};

const buildAggressiveGoalTargetChoiceReplyTexts = (
  context: RuntimeContext,
  summary: GoalTargetConfirmationSummary
) => {
  const { previousBlocks } = getAggressiveGoalTimelineContext(context, summary);
  const currentPlanningGoal = getCurrentPlanningGoal(summary);
  const previousGoalNames =
    previousBlocks.length > 0
      ? previousBlocks.map((item) => item.goalName)
      : summary.previousGoalNames;
  const previousGoalText = formatGoalNameList(previousGoalNames);
  const previousAllocationTotal = previousBlocks.reduce(
    (sum, item) => sum + item.allocation,
    0
  );
  const isSequentialDeadlineSafe =
    currentPlanningGoal !== null
      ? !currentPlanningGoal.deadlineMissedBeforeStart &&
        (currentPlanningGoal.gapMonthly ?? 0) <= 0
      : !summary.deadlineMissedBeforeStart && (summary.gap ?? 0) <= 0;
  const requestedMonthly =
    isSequentialDeadlineSafe
      ? currentPlanningGoal?.requiredMonthlyAllocation ?? summary.requiredMonthly ?? 0
      : summary.requestedParallelPreview?.allocation ?? summary.requiredMonthly ?? 0;
  const fullCapacityMonthly =
    currentPlanningGoal?.availableMonthlyAllocation && currentPlanningGoal.availableMonthlyAllocation > 0
      ? currentPlanningGoal.availableMonthlyAllocation
      : summary.monthlySurplus;
  const totalParallelMonthly =
    summary.requestedParallelPreview?.totalParallelAllocation ??
    requestedMonthly + previousAllocationTotal;
  const parallelEndLabel =
    summary.requestedParallelPreview?.parallelEndLabel ??
    previousBlocks.at(-1)?.endLabel ??
    summary.targetAnswer.label;
  const realisticStartLabel =
    currentPlanningGoal?.startLabel ??
    summary.targetEvaluation?.realisticStartDate?.label ??
    summary.startLabel ??
    (previousBlocks.length > 0 ? `setelah ${previousGoalText} selesai` : null);
  const realisticEndLabel =
    currentPlanningGoal?.realisticTargetLabel ??
    summary.suggestedTarget?.label ??
    summary.targetEvaluation?.realisticEndDate?.label ??
    summary.realisticTargetLabel;
  const finishComparison = compareGoalMonthYear(
    currentPlanningGoal?.realisticTargetMonth && currentPlanningGoal.realisticTargetYear
      ? {
          month: currentPlanningGoal.realisticTargetMonth,
          year: currentPlanningGoal.realisticTargetYear
        }
      : summary.suggestedTarget,
    summary.targetAnswer
  );
  const finishesBeforeRequestedDeadline =
    isSequentialDeadlineSafe && finishComparison !== null && finishComparison < 0;
  const emergencyBlock = previousBlocks.find(
    (item) => item.goalType === FinancialGoalType.EMERGENCY_FUND
  );
  const targetAmountLine = formatTargetAmountLine(context, {
    goalType: summary.goalType,
    targetAmount: summary.targetAmount
  });
  const activeTargetLines = previousBlocks.flatMap((item) =>
    [
      `✅ ${item.goalName}`,
      formatTargetAmountLine(context, item),
      `${item.startLabel} – ${item.endLabel}`,
      `Setoran: ${formatMoney(item.allocation)}/bulan`
    ].filter((line): line is string => typeof line === "string")
  );

  const firstBubble = [
    `🎯 Target Baru: ${summary.goalName}`,
    targetAmountLine,
    `Deadline awal: ${summary.targetAnswer.label}`,
    previousBlocks.length > 0 ? "" : null,
    previousBlocks.length > 0 ? "Saat ini Boss masih punya target aktif:" : null,
    previousBlocks.length > 0 ? "" : null,
    ...activeTargetLines,
    previousBlocks.length > 0 ? "" : null,
    previousBlocks.length > 0
      ? `Karena target berjalan berurutan, surplus bulanan Boss masih diprioritaskan dulu ke ${previousGoalText}.`
      : null
  ].filter((item): item is string => typeof item === "string");

  const secondBubble = isSequentialDeadlineSafe
    ? [
        `${getTargetSimulationEmoji(summary.goalType)} Simulasi ${summary.goalName}`,
        "",
        `Kalau tetap mau selesai ${summary.targetAnswer.label}, Boss perlu setoran:`,
        "",
        `${formatMoney(requestedMonthly)}/bulan`,
        "",
        previousBlocks.length > 0
          ? `Setoran ${summary.goalName} bisa dimulai setelah ${previousGoalText} selesai, jadi tidak perlu ditumpuk sementara.`
          : "Target ini masih masuk dengan cashflow yang kebaca sekarang.",
        emergencyBlock?.targetAmount !== null && emergencyBlock?.targetAmount !== undefined
          ? ""
          : null,
        emergencyBlock?.targetAmount !== null && emergencyBlock?.targetAmount !== undefined
          ? "Dana Darurat yang perlu dikumpulkan dulu:"
          : null,
        emergencyBlock?.targetAmount !== null && emergencyBlock?.targetAmount !== undefined
          ? ""
          : null,
        emergencyBlock?.targetAmount !== null && emergencyBlock?.targetAmount !== undefined
          ? formatMoney(emergencyBlock.targetAmount)
          : null,
        emergencyBlock?.targetAmount !== null && emergencyBlock?.targetAmount !== undefined
          ? `sampai ${emergencyBlock.endLabel}.`
          : null
      ].filter((item): item is string => typeof item === "string")
    : [
        `${getTargetSimulationEmoji(summary.goalType)} Simulasi ${summary.goalName}`,
        "",
        `Kalau tetap mau selesai ${summary.targetAnswer.label}, Boss perlu setoran:`,
        "",
        `${formatMoney(requestedMonthly)}/bulan`,
        "",
        previousBlocks.length > 0
          ? `Tapi karena ${previousGoalText} masih berjalan, total kebutuhan sementara jadi:`
          : "Dengan cashflow saat ini, kebutuhan bulanannya jadi:",
        "",
        `${formatMoney(totalParallelMonthly)}/bulan`,
        parallelEndLabel ? `sampai ${parallelEndLabel}.` : null
      ].filter((item): item is string => typeof item === "string");

  const thirdBubble = isSequentialDeadlineSafe
    ? [
        "📌 Rekomendasi AI",
        "",
        previousBlocks.length > 0
          ? `Deadline ${summary.targetAnswer.label} masih aman. Target ${summary.goalName} tidak perlu dipaksa jalan bareng ${previousGoalText}.`
          : `Deadline ${summary.targetAnswer.label} masih aman untuk target ${summary.goalName}.`,
        "",
        emergencyBlock?.targetAmount !== null && emergencyBlock?.targetAmount !== undefined
          ? `✅ Dana Darurat dulu: ${formatMoney(emergencyBlock.targetAmount)} sampai ${emergencyBlock.endLabel}`
          : null,
        realisticStartLabel ? `✅ Mulai ${summary.goalName}: ${realisticStartLabel}` : null,
        realisticEndLabel
          ? finishesBeforeRequestedDeadline
            ? `✅ Estimasi selesai lebih cepat: ${realisticEndLabel}`
            : `✅ Estimasi selesai: ${realisticEndLabel}`
          : null,
        finishesBeforeRequestedDeadline
          ? `✅ Kalau pakai kemampuan penuh ${formatMoney(fullCapacityMonthly)}/bulan, deadline Boss masih longgar sampai ${summary.targetAnswer.label}`
          : `✅ Deadline Boss tetap: ${summary.targetAnswer.label}`
      ].filter((item): item is string => typeof item === "string")
    : [
        "📌 Rekomendasi AI",
        "",
        previousBlocks.length > 0
          ? `Agar cashflow lebih realistis, target ${summary.goalName} lebih aman dimulai setelah ${previousGoalText} selesai.`
          : `Agar cashflow lebih realistis, target ${summary.goalName} lebih aman pakai versi realistis.`,
        "",
        realisticStartLabel ? `✅ Mulai: ${realisticStartLabel}` : null,
        realisticEndLabel ? `✅ Estimasi selesai: ${realisticEndLabel}` : null,
        "✅ Setoran tetap sesuai kemampuan saat ini"
      ].filter((item): item is string => typeof item === "string");

  const fourthBubble = [
    "Boss mau pilih yang mana?",
    "",
    `1️⃣ Tetap deadline ${summary.targetAnswer.label}`,
    isSequentialDeadlineSafe && realisticEndLabel
      ? finishesBeforeRequestedDeadline
        ? `2️⃣ Pakai target selesai lebih cepat ${realisticEndLabel}`
        : `2️⃣ Pakai ritme aman ${realisticEndLabel}`
      : realisticEndLabel
        ? `2️⃣ Pakai versi realistis ${realisticEndLabel}`
        : "2️⃣ Pakai versi realistis",
    "3️⃣ Ubah nominal target",
    "4️⃣ Ubah deadline target"
  ];

  return [
    firstBubble.join("\n").trim(),
    secondBubble.join("\n").trim(),
    thirdBubble.join("\n").trim(),
    fourthBubble.join("\n").trim()
  ];
};

const buildGoalTargetConfirmationReplyTexts = (
  context: RuntimeContext,
  targetAnswer: MonthYearTargetAnswer
) => {
  const summary = buildGoalTargetConfirmationSummary(context, targetAnswer);
  return buildAggressiveGoalTargetChoiceReplyTexts(context, summary).filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );
};

const EXPENSE_BREAKDOWN_CONFIRMATION_LABELS: Record<keyof ExpenseBreakdown, string> = {
  food: "Makan",
  transport: "Transport",
  bills: "Tagihan",
  entertainment: "Hiburan",
  others: "Lainnya"
};

type ManualExpenseMergeDecision = "merge" | "split";

type ManualExpenseConfirmationAnswer = {
  kind: "manual_expense_breakdown";
  details: ManualExpenseBreakdownDetail[];
  mergeDecisions: Partial<Record<keyof ExpenseBreakdown, ManualExpenseMergeDecision>>;
  mergePromptBucket: keyof ExpenseBreakdown | null;
  reviewReady: boolean;
};

type ManualExpenseMergeCandidate = {
  bucket: keyof ExpenseBreakdown;
  label: string;
  details: ManualExpenseBreakdownDetail[];
  total: number;
  firstIndex: number;
};

const isManualExpenseConfirmationAnswer = (
  value: SessionAnswerValue
): value is ManualExpenseConfirmationAnswer =>
  Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).kind === "manual_expense_breakdown" &&
      Array.isArray((value as Record<string, unknown>).details)
  );

const buildExpenseBreakdownFromDetails = (
  details: ManualExpenseBreakdownDetail[]
): ExpenseBreakdown => {
  const breakdown: ExpenseBreakdown = {
    food: 0,
    transport: 0,
    bills: 0,
    entertainment: 0,
    others: 0
  };

  for (const detail of details) {
    breakdown[detail.bucket] += detail.amount;
  }

  return breakdown;
};

const buildManualExpenseConfirmationAnswer = (
  details: ManualExpenseBreakdownDetail[],
  previous?: ManualExpenseConfirmationAnswer
): ManualExpenseConfirmationAnswer => ({
  kind: "manual_expense_breakdown",
  details,
  mergeDecisions: previous?.mergeDecisions ?? {},
  mergePromptBucket: previous?.mergePromptBucket ?? null,
  reviewReady: previous?.reviewReady ?? false
});

const getManualExpenseDisplayBreakdown = (answer: SessionAnswerValue): ExpenseBreakdown =>
  isManualExpenseConfirmationAnswer(answer)
    ? buildExpenseBreakdownFromDetails(answer.details)
    : (answer as ExpenseBreakdown);

const mergeManualExpenseAnswers = (
  left: ManualExpenseConfirmationAnswer,
  right: ManualExpenseConfirmationAnswer
): ManualExpenseConfirmationAnswer =>
  buildManualExpenseConfirmationAnswer([...left.details, ...right.details]);

const getManualExpenseMergeCandidates = (
  answer: ManualExpenseConfirmationAnswer
): ManualExpenseMergeCandidate[] => {
  const groups = new Map<keyof ExpenseBreakdown, ManualExpenseMergeCandidate>();

  answer.details.forEach((detail, index) => {
    if (detail.bucket === "others") return;
    const existing = groups.get(detail.bucket);
    if (existing) {
      existing.details.push(detail);
      existing.total += detail.amount;
      return;
    }
    groups.set(detail.bucket, {
      bucket: detail.bucket,
      label: EXPENSE_BREAKDOWN_CONFIRMATION_LABELS[detail.bucket],
      details: [detail],
      total: detail.amount,
      firstIndex: index
    });
  });

  return Array.from(groups.values())
    .filter((group) => {
      if (group.details.length <= 1) return false;
      const uniqueLabels = new Set(group.details.map((detail) => normalizeText(detail.label).toLowerCase()));
      return uniqueLabels.size > 1;
    })
    .sort((left, right) => left.firstIndex - right.firstIndex);
};

const getNextManualExpenseMergeCandidate = (
  answer: ManualExpenseConfirmationAnswer
) =>
  getManualExpenseMergeCandidates(answer).find(
    (candidate) => !answer.mergeDecisions[candidate.bucket]
  ) ?? null;

const MANUAL_EXPENSE_BUCKET_EMOJI: Partial<Record<keyof ExpenseBreakdown, string>> = {
  food: "🍽️",
  transport: "⛽",
  bills: "📱",
  entertainment: "🎮",
  others: "📦"
};

const formatManualExpenseMergeLabel = (label: string) =>
  label
    .trim()
    .split(/\s+/)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");

const getManualExpenseCombinedLabel = (candidate: ManualExpenseMergeCandidate) => {
  const labels = Array.from(
    new Set(candidate.details.map((detail) => formatManualExpenseMergeLabel(detail.label)))
  );

  return labels.length >= 2 ? labels.join(" & ") : candidate.label;
};

const buildManualExpenseMergeQuestionText = (candidate: ManualExpenseMergeCandidate) =>
  {
    const combinedLabel = getManualExpenseCombinedLabel(candidate);
    const bucketEmoji = MANUAL_EXPENSE_BUCKET_EMOJI[candidate.bucket];

    return [
      "🧾 *Aku lihat ada beberapa pengeluaran yang mirip, Boss*",
      "",
      "Sepertinya ini masih satu kategori:",
      "",
      `${bucketEmoji ? `${bucketEmoji} ` : ""}${candidate.label}`,
      "",
      ...candidate.details.map(
        (detail) =>
          `• ${formatManualExpenseMergeLabel(detail.label)}: *${formatMoney(detail.amount)}*`
      ),
      "",
      `Total kalau digabung: *${formatMoney(candidate.total)}*`,
      "",
      `Mau aku gabung jadi *${combinedLabel}*, atau tetap dipisah?`,
      "",
      "Balas:",
      "*gabung* untuk digabung",
      "*pisah* untuk tetap dipisah"
    ].join("\n");
  };

const parseManualExpenseMergeDecision = (
  rawAnswer: unknown
): ManualExpenseMergeDecision | null => {
  if (typeof rawAnswer !== "string") return null;
  const normalized = normalizeText(rawAnswer).toLowerCase();
  if (!normalized) return null;

  if (
    [
      "gabung",
      "digabung",
      "gabung aja",
      "gabungin",
      "satuin",
      "satukan",
      "jadi satu",
      "jadiin satu",
      "merge"
    ].some((phrase) => normalized.includes(phrase)) ||
    parseBooleanAnswer(rawAnswer) === true
  ) {
    return "merge";
  }

  if (
    [
      "pisah",
      "dipisah",
      "pisahin",
      "tetap pisah",
      "masing masing",
      "masing-masing",
      "jangan gabung",
      "jangan digabung",
      "separate"
    ].some((phrase) => normalized.includes(phrase)) ||
    parseBooleanAnswer(rawAnswer) === false
  ) {
    return "split";
  }

  return null;
};

const buildFinalManualExpensePlanInput = (answer: SessionAnswerValue) => {
  if (!isManualExpenseConfirmationAnswer(answer)) {
    return {
      breakdown: answer as ExpenseBreakdown,
      customExpenseItems: undefined
    };
  }

  const breakdown = buildExpenseBreakdownFromDetails(answer.details);
  const customExpenseItems: Array<{ label: string; amount: number }> = [];
  const candidates = getManualExpenseMergeCandidates(answer);

  for (const candidate of candidates) {
    if (answer.mergeDecisions[candidate.bucket] !== "split") continue;
    breakdown[candidate.bucket] = Math.max(0, breakdown[candidate.bucket] - candidate.total);
    breakdown.others += candidate.total;
    customExpenseItems.push(
      ...candidate.details.map((detail) => ({
        label: detail.label,
        amount: detail.amount
      }))
    );
  }

  return {
    breakdown,
    customExpenseItems: customExpenseItems.length ? customExpenseItems : undefined
  };
};

const buildManualExpenseAddMoreQuestionText = () =>
  [
    "✅ *Siap, aku catat dulu*",
    "",
    "Ada pengeluaran lain yang mau ditambah?",
    "",
    "Balas *ada* atau *sudah* ya, Boss."
  ].join("\n");

const buildManualExpenseBreakdownLines = (
  breakdown: ExpenseBreakdown,
  customExpenseItems?: Array<{ label: string; amount: number }>
) => {
  const lines: string[] = [];
  for (const key of Object.keys(EXPENSE_BREAKDOWN_CONFIRMATION_LABELS) as Array<
    keyof ExpenseBreakdown
  >) {
    const customTotal =
      key === "others"
        ? (customExpenseItems ?? []).reduce((sum, item) => sum + item.amount, 0)
        : 0;
    const amount = Math.max(0, (breakdown[key] ?? 0) - customTotal);
    if (amount <= 0) continue;
    lines.push(`${EXPENSE_BREAKDOWN_CONFIRMATION_LABELS[key]}: ${formatMoney(amount)}`);
  }

  for (const item of customExpenseItems ?? []) {
    lines.push(`${item.label}: ${formatMoney(item.amount)}`);
  }

  return lines;
};

const MANUAL_EXPENSE_REVIEW_LABELS: Record<keyof ExpenseBreakdown, string> = {
  food: "🍽️ *Makan & Minum*",
  transport: "⛽ *Transport*",
  bills: "📱 *Tagihan*",
  entertainment: "🎮 *Hiburan*",
  others: "📦 *Lainnya*"
};

const buildManualExpenseReviewLines = (
  breakdown: ExpenseBreakdown,
  customExpenseItems?: Array<{ label: string; amount: number }>
) => {
  const lines: string[] = [];
  for (const key of Object.keys(MANUAL_EXPENSE_REVIEW_LABELS) as Array<keyof ExpenseBreakdown>) {
    const customTotal =
      key === "others"
        ? (customExpenseItems ?? []).reduce((sum, item) => sum + item.amount, 0)
        : 0;
    const amount = Math.max(0, (breakdown[key] ?? 0) - customTotal);
    if (amount <= 0) continue;
    lines.push(`${MANUAL_EXPENSE_REVIEW_LABELS[key]}: ${formatMoney(amount)}`);
  }

  for (const item of customExpenseItems ?? []) {
    lines.push(`📦 *${formatManualExpenseMergeLabel(item.label)}*: ${formatMoney(item.amount)}`);
  }

  return lines;
};

const buildManualExpenseFinalReviewReplyTexts = (answer: SessionAnswerValue) => {
  const planInput = buildFinalManualExpensePlanInput(answer);
  const total = parseManualBreakdownTotal(planInput.breakdown) ?? 0;
  return [
    [
      "🧾 *Aku sudah rapihin pengeluaran bulanan Boss*",
      "",
      "Ini yang aku tangkap:",
      "",
      ...buildManualExpenseReviewLines(
        planInput.breakdown,
        planInput.customExpenseItems
      ),
      "",
      "📊 *Total pengeluaran rutin:*",
      `*${formatMoney(total)}/bulan*`,
      "",
      "Kalau sudah pas, balas *lanjut*.",
      "Kalau masih ada yang mau ditambah, balas *ada*."
    ].join("\n")
  ];
};

type ExpenseBudgetSource = "manual" | "guided";
type ExpenseBudgetIncomeType = "active" | "passive";
type ExpenseBudgetDeficitStage =
  | "ask_income_more"
  | "ask_income_type"
  | "ask_active_income_amount"
  | "ask_passive_income_amount"
  | "ask_adjust_expense"
  | "ask_expense_category"
  | "ask_expense_amount"
  | "ask_change_or_save_deficit"
  | "confirm_deficit_save"
  | "confirm_save";

type ExpenseBudgetDeficitReviewAnswer = {
  kind: "expense_budget_deficit_review";
  source: ExpenseBudgetSource;
  originalAnswer: SessionAnswerValue;
  breakdown: ExpenseBreakdown;
  customExpenseItems: Array<{ label: string; amount: number }>;
  additionalActiveIncome: number;
  additionalPassiveIncome: number;
  pendingIncomeTypes: ExpenseBudgetIncomeType[];
  stage: ExpenseBudgetDeficitStage;
  editingItemId: string | null;
  deficitSaveApproved: boolean;
};

type ExpenseBudgetPlanInput = {
  breakdown: ExpenseBreakdown;
  customExpenseItems?: Array<{ label: string; amount: number }>;
};

type ExpenseBudgetEditableItem = {
  id: string;
  label: string;
  amount: number;
  type: "bucket" | "custom" | "others";
  key?: keyof ExpenseBreakdown;
  customIndex?: number;
};

const isExpenseBudgetDeficitReviewAnswer = (
  value: SessionAnswerValue
): value is ExpenseBudgetDeficitReviewAnswer =>
  Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).kind === "expense_budget_deficit_review"
  );

const cloneExpenseBreakdown = (breakdown: ExpenseBreakdown): ExpenseBreakdown => ({
  food: breakdown.food ?? 0,
  transport: breakdown.transport ?? 0,
  bills: breakdown.bills ?? 0,
  entertainment: breakdown.entertainment ?? 0,
  others: breakdown.others ?? 0
});

const getExpenseBudgetTotal = (plan: ExpenseBudgetPlanInput) =>
  parseManualBreakdownTotal(plan.breakdown) ?? 0;

const getExpenseBudgetIncomeTotal = (
  context: RuntimeContext,
  review?: ExpenseBudgetDeficitReviewAnswer
) =>
  Math.max(0, context.monthlyIncomeTotal ?? 0) +
  (review?.additionalActiveIncome ?? 0) +
  (review?.additionalPassiveIncome ?? 0);

const getExpenseBudgetDeficitAmount = (
  context: RuntimeContext,
  plan: ExpenseBudgetPlanInput,
  review?: ExpenseBudgetDeficitReviewAnswer
) => Math.max(0, getExpenseBudgetTotal(plan) - getExpenseBudgetIncomeTotal(context, review));

const buildGuidedExpensePlanInput = (
  context: RuntimeContext,
  normalizedAnswer: SessionAnswerValue
): ExpenseBudgetPlanInput | null => {
  const sessions = context.sessions.filter((item) => item.isCompleted === true);
  const guidedOtherExpenseState = getGuidedOtherExpenseState(sessions);
  const breakdown: ExpenseBreakdown = {
    food:
      getSessionNormalizedValue<number>(
        latestSessionForQuestion(sessions, OnboardingQuestionKey.GUIDED_EXPENSE_FOOD)
      ) ?? 0,
    transport:
      getSessionNormalizedValue<number>(
        latestSessionForQuestion(sessions, OnboardingQuestionKey.GUIDED_EXPENSE_TRANSPORT)
      ) ?? 0,
    bills:
      getSessionNormalizedValue<number>(
        latestSessionForQuestion(sessions, OnboardingQuestionKey.GUIDED_EXPENSE_BILLS)
      ) ?? 0,
    entertainment:
      getSessionNormalizedValue<number>(
        latestSessionForQuestion(sessions, OnboardingQuestionKey.GUIDED_EXPENSE_ENTERTAINMENT)
      ) ?? 0,
    others: guidedOtherExpenseState.total
  };
  let customExpenseItems = guidedOtherExpenseState.items;

  if (typeof normalizedAnswer === "number") {
    breakdown.others = normalizedAnswer;
    customExpenseItems = [];
    return { breakdown };
  }

  if (!isGuidedOtherExpenseAnswer(normalizedAnswer)) {
    return null;
  }

  if (normalizedAnswer.kind === "presence" && normalizedAnswer.hasOtherExpense === false) {
    return {
      breakdown: { ...breakdown, others: 0 }
    };
  }

  if (normalizedAnswer.kind === "add_more" && normalizedAnswer.addMore === false) {
    return {
      breakdown,
      ...(customExpenseItems.length ? { customExpenseItems } : {})
    };
  }

  if (normalizedAnswer.kind === "category_amount") {
    const nextCustomItems = [
      ...customExpenseItems,
      {
        label: normalizedAnswer.label,
        amount: normalizedAnswer.amount
      }
    ];
    return {
      breakdown: {
        ...breakdown,
        others: nextCustomItems.reduce((sum, item) => sum + item.amount, 0)
      },
      customExpenseItems: nextCustomItems
    };
  }

  return null;
};

const getExpenseBudgetPlanForCurrentStep = (
  context: RuntimeContext,
  normalizedAnswer: SessionAnswerValue
): ExpenseBudgetPlanInput | null => {
  if (isExpenseBudgetDeficitReviewAnswer(normalizedAnswer)) {
    return {
      breakdown: cloneExpenseBreakdown(normalizedAnswer.breakdown),
      ...(normalizedAnswer.customExpenseItems.length
        ? { customExpenseItems: normalizedAnswer.customExpenseItems }
        : {})
    };
  }

  if (context.user.onboardingStep === OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN) {
    return buildFinalManualExpensePlanInput(normalizedAnswer);
  }

  if (context.user.onboardingStep === OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS) {
    return buildGuidedExpensePlanInput(context, normalizedAnswer);
  }

  return null;
};

const getExpenseBudgetSourceForCurrentStep = (
  step: OnboardingStep
): ExpenseBudgetSource | null => {
  if (step === OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN) return "manual";
  if (step === OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS) return "guided";
  return null;
};

const buildExpenseBudgetDeficitReviewAnswer = (params: {
  source: ExpenseBudgetSource;
  originalAnswer: SessionAnswerValue;
  plan: ExpenseBudgetPlanInput;
  stage?: ExpenseBudgetDeficitStage;
  previous?: ExpenseBudgetDeficitReviewAnswer | null;
}): ExpenseBudgetDeficitReviewAnswer => ({
  kind: "expense_budget_deficit_review",
  source: params.source,
  originalAnswer: params.previous?.originalAnswer ?? params.originalAnswer,
  breakdown: cloneExpenseBreakdown(params.plan.breakdown),
  customExpenseItems: (params.plan.customExpenseItems ?? []).map((item) => ({
    label: item.label,
    amount: item.amount
  })),
  additionalActiveIncome: params.previous?.additionalActiveIncome ?? 0,
  additionalPassiveIncome: params.previous?.additionalPassiveIncome ?? 0,
  pendingIncomeTypes: params.previous?.pendingIncomeTypes ?? [],
  stage: params.stage ?? params.previous?.stage ?? "ask_income_more",
  editingItemId: params.previous?.editingItemId ?? null,
  deficitSaveApproved: params.previous?.deficitSaveApproved ?? false
});

const buildExpenseBudgetDeficitWarningText = (
  context: RuntimeContext,
  review: ExpenseBudgetDeficitReviewAnswer
) => {
  const plan = { breakdown: review.breakdown, customExpenseItems: review.customExpenseItems };
  const incomeTotal = getExpenseBudgetIncomeTotal(context, review);
  const expenseTotal = getExpenseBudgetTotal(plan);
  const deficit = Math.max(0, expenseTotal - incomeTotal);
  return [
    "⚠️ Pengeluaran bulanan Boss lebih besar dari income.",
    "",
    `Income saat ini: ${formatMoney(incomeTotal)}/bulan`,
    `Pengeluaran: ${formatMoney(expenseTotal)}/bulan`,
    `Defisit: ${formatMoney(deficit)}/bulan`,
    "",
    "Masih ada income lain yang belum dimasukkan?",
    "Balas `ada` kalau ada, atau `tidak ada` kalau memang tidak ada."
  ].join("\n");
};

const buildExpenseBudgetIncomeTypeQuestionText = () =>
  [
    "Income tambahannya masuk jenis apa Boss?",
    "",
    "1. Active income",
    "   Contoh: gaji, freelance, bonus, komisi, pemasukan usaha.",
    "2. Passive income",
    "   Contoh: dividen, sewa aset, bunga, royalti, return investasi.",
    "3. Keduanya",
    "",
    "Balas nomornya atau sebut jenisnya ya Boss."
  ].join("\n");

const parseExpenseBudgetIncomeTypes = (rawAnswer: unknown): ExpenseBudgetIncomeType[] | null => {
  if (typeof rawAnswer !== "string") return null;
  const normalized = normalizeText(rawAnswer).toLowerCase();
  if (!normalized) return null;
  const wantsBoth =
    /\b(3|dua-duanya|dua duanya|keduanya|semua|both)\b/.test(normalized) ||
    (normalized.includes("active") && normalized.includes("passive")) ||
    (normalized.includes("aktif") && normalized.includes("pasif"));
  if (wantsBoth) return ["active", "passive"];

  if (
    /\b(1|active|aktif|gaji|freelance|bonus|komisi|usaha|bisnis)\b/.test(normalized)
  ) {
    return ["active"];
  }

  if (
    /\b(2|passive|pasif|dividen|sewa|bunga|royalti|royalty|return|investasi)\b/.test(normalized)
  ) {
    return ["passive"];
  }

  return null;
};

const getIncomeAmountPromptText = (type: ExpenseBudgetIncomeType) =>
  type === "active"
    ? "Nominal active income tambahannya berapa per bulan Boss? Contoh: `2jt` atau `freelance 1,5jt`."
    : "Nominal passive income tambahannya berapa per bulan Boss? Contoh: `500rb` atau `sewa 2jt`.";

const buildExpenseBudgetFinalSaveConfirmationText = (
  context: RuntimeContext,
  review: ExpenseBudgetDeficitReviewAnswer
) => {
  const plan = { breakdown: review.breakdown, customExpenseItems: review.customExpenseItems };
  const incomeTotal = getExpenseBudgetIncomeTotal(context, review);
  const expenseTotal = getExpenseBudgetTotal(plan);
  return [
    "✅ Budget sudah aman untuk disimpan.",
    "",
    `Income: ${formatMoney(incomeTotal)}/bulan`,
    `Pengeluaran: ${formatMoney(expenseTotal)}/bulan`,
    `Sisa: ${formatMoney(Math.max(0, incomeTotal - expenseTotal))}/bulan`,
    "",
    "Mau saya simpan budget ini?",
    "Balas `simpan` kalau sudah pas, atau `ubah` kalau masih mau revisi pengeluaran."
  ].join("\n");
};

const getExpenseBudgetEditableItems = (
  review: ExpenseBudgetDeficitReviewAnswer
): ExpenseBudgetEditableItem[] => {
  const items: ExpenseBudgetEditableItem[] = [];
  for (const key of ["food", "transport", "bills", "entertainment"] as Array<keyof ExpenseBreakdown>) {
    const amount = review.breakdown[key] ?? 0;
    if (amount > 0) {
      items.push({
        id: `bucket:${key}`,
        label: EXPENSE_BREAKDOWN_CONFIRMATION_LABELS[key],
        amount,
        type: "bucket",
        key
      });
    }
  }

  review.customExpenseItems.forEach((item, index) => {
    if (item.amount <= 0) return;
    items.push({
      id: `custom:${index}`,
      label: item.label,
      amount: item.amount,
      type: "custom",
      customIndex: index
    });
  });

  const customTotal = review.customExpenseItems.reduce((sum, item) => sum + item.amount, 0);
  const unresolvedOthers = Math.max(0, (review.breakdown.others ?? 0) - customTotal);
  if (unresolvedOthers > 0) {
    items.push({
      id: "others",
      label: EXPENSE_BREAKDOWN_CONFIRMATION_LABELS.others,
      amount: unresolvedOthers,
      type: "others",
      key: "others"
    });
  }

  return items;
};

const buildExpenseBudgetEditCategoryQuestionText = (
  review: ExpenseBudgetDeficitReviewAnswer
) => {
  const items = getExpenseBudgetEditableItems(review);
  return [
    "Kategori pengeluaran mana yang mau diubah Boss?",
    "",
    ...items.map((item, index) => `${index + 1}. ${item.label}: ${formatMoney(item.amount)}`),
    "",
    "Balas nomor kategori atau nama kategorinya ya Boss."
  ].join("\n");
};

const parseExpenseBudgetEditableSelection = (
  rawAnswer: unknown,
  items: ExpenseBudgetEditableItem[]
) => {
  if (typeof rawAnswer !== "string") return null;
  const normalized = normalizeText(rawAnswer).toLowerCase();
  const numberMatch = normalized.match(/\b\d+\b/);
  if (numberMatch) {
    const index = Number(numberMatch[0]) - 1;
    if (items[index]) return items[index];
  }

  return (
    items.find((item) => normalized.includes(item.label.toLowerCase())) ??
    items.find((item) => item.label.toLowerCase().includes(normalized))
  );
};

const applyExpenseBudgetItemAmount = (
  review: ExpenseBudgetDeficitReviewAnswer,
  selectedItem: ExpenseBudgetEditableItem,
  amount: number
): ExpenseBudgetDeficitReviewAnswer => {
  const nextReview: ExpenseBudgetDeficitReviewAnswer = {
    ...review,
    breakdown: cloneExpenseBreakdown(review.breakdown),
    customExpenseItems: review.customExpenseItems.map((item) => ({ ...item })),
    editingItemId: null
  };
  const normalizedAmount = Math.max(0, Math.round(amount));

  if (selectedItem.type === "bucket" && selectedItem.key) {
    nextReview.breakdown[selectedItem.key] = normalizedAmount;
    return nextReview;
  }

  if (selectedItem.type === "others") {
    const customTotal = nextReview.customExpenseItems.reduce((sum, item) => sum + item.amount, 0);
    nextReview.breakdown.others = customTotal + normalizedAmount;
    return nextReview;
  }

  if (selectedItem.type === "custom" && selectedItem.customIndex !== undefined) {
    const currentAmount = nextReview.customExpenseItems[selectedItem.customIndex]?.amount ?? 0;
    const difference = normalizedAmount - currentAmount;
    if (nextReview.customExpenseItems[selectedItem.customIndex]) {
      nextReview.customExpenseItems[selectedItem.customIndex].amount = normalizedAmount;
    }
    nextReview.breakdown.others = Math.max(0, (nextReview.breakdown.others ?? 0) + difference);
  }

  return nextReview;
};

const wantsExpenseBudgetEdit = (rawAnswer: unknown) => {
  if (typeof rawAnswer !== "string") return false;
  const normalized = normalizeText(rawAnswer).toLowerCase();
  return ["ubah", "edit", "revisi", "ganti", "atur ulang", "ubah lagi"].some((phrase) =>
    normalized.includes(phrase)
  );
};

const wantsDeficitBudgetSave = (rawAnswer: unknown) => {
  if (typeof rawAnswer !== "string") return false;
  const normalized = normalizeText(rawAnswer).toLowerCase();
  return (
    normalized.includes("simpan defisit") ||
    normalized.includes("save defisit") ||
    normalized.includes("tetap simpan defisit") ||
    normalized.includes("setuju simpan defisit")
  );
};

const buildExpenseBudgetAdjustQuestionText = () =>
  [
    "Oke, berarti belum ada income tambahan lagi.",
    "",
    "Mau ubah nominal pengeluaran dulu supaya budgetnya lebih aman?",
    "Balas `ubah` untuk revisi kategori pengeluaran, atau `tetap simpan defisit` kalau mau tetap disimpan sebagai budget defisit."
  ].join("\n");

const buildExpenseBudgetChangeOrDeficitText = (
  context: RuntimeContext,
  review: ExpenseBudgetDeficitReviewAnswer
) => {
  const plan = { breakdown: review.breakdown, customExpenseItems: review.customExpenseItems };
  const incomeTotal = getExpenseBudgetIncomeTotal(context, review);
  const expenseTotal = getExpenseBudgetTotal(plan);
  return [
    "⚠️ Setelah diubah, pengeluaran masih lebih besar dari income.",
    "",
    `Income: ${formatMoney(incomeTotal)}/bulan`,
    `Pengeluaran: ${formatMoney(expenseTotal)}/bulan`,
    `Defisit: ${formatMoney(Math.max(0, expenseTotal - incomeTotal))}/bulan`,
    "",
    "Mau ubah kategori pengeluaran lain, atau tetap simpan budget ini sebagai budget defisit?",
    "Balas `ubah lagi` atau `tetap simpan defisit`."
  ].join("\n");
};

const buildExpenseBudgetDeficitSaveConfirmationText = (
  context: RuntimeContext,
  review: ExpenseBudgetDeficitReviewAnswer
) => {
  const plan = { breakdown: review.breakdown, customExpenseItems: review.customExpenseItems };
  const incomeTotal = getExpenseBudgetIncomeTotal(context, review);
  const expenseTotal = getExpenseBudgetTotal(plan);
  return [
    "⚠️ Konfirmasi terakhir ya Boss.",
    "",
    "Budget ini masih defisit:",
    `Income: ${formatMoney(incomeTotal)}/bulan`,
    `Pengeluaran: ${formatMoney(expenseTotal)}/bulan`,
    `Defisit: ${formatMoney(Math.max(0, expenseTotal - incomeTotal))}/bulan`,
    "",
    "Saya hanya akan simpan budget defisit kalau Boss setuju eksplisit.",
    "Ketik `simpan defisit` untuk menyimpan, atau `ubah` untuk revisi lagi."
  ].join("\n");
};


const buildConfirmationReplyTexts = (
  context: RuntimeContext,
  normalizedAnswer: SessionAnswerValue
) => {
  if (context.user.onboardingStep === OnboardingStep.ASK_GOAL_TARGET_DATE) {
    const targetAnswer = normalizedAnswer as MonthYearTargetAnswer;
    return buildGoalTargetConfirmationReplyTexts(
      context,
      targetAnswer
    ).filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    );
  }

  if (context.user.onboardingStep === OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN) {
    return [buildManualExpenseAddMoreQuestionText()];
  }

  return [[
    `Saya pakai catatan ${describeStoredAnswer(context, normalizedAnswer)}.`,
    "Kalau ini sudah pas, saya lanjut. Kalau masih ada yang mau diubah, bilang aja."
  ].join("\n")];
};

const buildGoalTargetOverrideAcceptedTexts = (
  context: RuntimeContext,
  targetAnswer: MonthYearTargetAnswer
) => {
  const summary = buildGoalTargetConfirmationSummary(context, targetAnswer);
  const lines = [`Oke, saya pakai target ${summary.goalName} di ${targetAnswer.label}.`];
  if (summary.targetEvaluation) {
    const evaluationCopy = generateShortTargetEvaluationCopy({
      evaluation: {
        ...summary.targetEvaluation,
        userDecision:
          summary.suggestedTarget &&
          summary.suggestedTarget.month === targetAnswer.month &&
          summary.suggestedTarget.year === targetAnswer.year
            ? "realistic"
            : "original"
      },
      monthlySurplus: summary.requestedParallelPreview?.availableMonthly ?? summary.monthlySurplus,
      totalMonthlySurplus: Math.max(0, context.potentialMonthlySaving ?? 0),
      previousGoalNames: summary.previousGoalNames
    });
    if (evaluationCopy) {
      lines.push(evaluationCopy);
    }
  } else if (summary.requiredMonthly !== null) {
    if ((summary.gap ?? 0) > 0) {
      lines.push(
        `Dengan target ini masih ada gap ${formatMoney(summary.gap ?? 0)}/bulan dari ruang tabung yang kebaca sekarang.`
      );
    } else {
      lines.push(
        `Dengan target ini, kebutuhan setorannya sekitar ${formatMoney(summary.requiredMonthly)}/bulan dan masih masuk di ruang tabung sekarang.`
      );
    }
  }

  return [lines.join("\n")];
};

const getTimelinePeriodStartLabel = (goal: PlanningGoalSummary) =>
  goal.startLabel ?? getMonthYearLabelFromNow(1);

const getTimelinePeriodEndLabel = (
  goal: PlanningGoalSummary,
  options?: {
    preserveRequestedTargetDate?: boolean;
  }
) => {
  if (options?.preserveRequestedTargetDate && goal.targetDateLabel) {
    return goal.targetDateLabel;
  }

  if (goal.deadlineMissedBeforeStart) {
    return goal.realisticTargetLabel ?? goal.targetDateLabel;
  }

  if (!goal.feasible && goal.realisticTargetLabel) {
    return goal.realisticTargetLabel;
  }

  return goal.targetDateLabel ?? goal.realisticTargetLabel;
};

const getTimelineMonthlyAllocation = (
  goal: PlanningGoalSummary,
  options?: {
    preserveRequiredMonthly?: boolean;
  }
) => {
  if (options?.preserveRequiredMonthly && goal.requiredMonthlyAllocation !== null) {
    return goal.requiredMonthlyAllocation;
  }

  if (goal.requiredMonthlyAllocation !== null && (goal.gapMonthly ?? 0) <= 0) {
    return goal.requiredMonthlyAllocation;
  }

  if (goal.availableMonthlyAllocation > 0) {
    return goal.availableMonthlyAllocation;
  }

  return goal.requiredMonthlyAllocation;
};

const getTimelineOverallNote = (
  goals: PlanningGoalSummary[],
  options?: {
    hasRequestedParallelPreview?: boolean;
  }
) => {
  if (options?.hasRequestedParallelPreview) {
    return "📌 Overall agak ketat, karena supaya deadline yang diminta tetap kepakai ada target yang perlu jalan paralel atau setoran tambahan.";
  }

  if (goals.some((goal) => goal.deadlineMissedBeforeStart)) {
    return "📌 Overall perlu penyesuaian, karena ada target yang baru bisa mulai setelah prioritas sebelumnya beres.";
  }

  if (goals.some((goal) => (goal.gapMonthly ?? 0) > 0)) {
    return "📌 Overall agak ketat, karena masih ada target yang butuh deadline lebih longgar atau setoran tambahan.";
  }

  return "📌 Rekomendasi AI\n\nTimeline target Boss masih masuk kapasitas tabungan saat ini.";
};

const buildCompactTimelineGoalLine = (params: {
  goalName: string;
  startLabel: string;
  endLabel: string;
  allocation: number;
  gap: number;
}) => {
  const parts = [
    `✅ ${params.goalName}`,
    `${params.startLabel} - ${params.endLabel}`,
    `${formatMoney(params.allocation)}/bulan`
  ];

  if (params.gap > 0) {
    parts.push(`gap ${formatMoney(params.gap)}/bulan`);
  }

  return parts.join(" | ");
};

const buildGapCoverageText = (params: {
  gap: number;
  startLabel: string;
  endLabel: string;
}) => `Gap tambahan: ${formatMoney(params.gap)}/bulan (${params.startLabel} - ${params.endLabel})`;

const buildGoalTimelineRoadmapText = (
  context: RuntimeContext,
  targetAnswer: MonthYearTargetAnswer
) => {
  const summary = buildGoalTargetConfirmationSummary(context, targetAnswer);
  const storedTargetAnswers = getStoredCompletedGoalTargetAnswers(context.sessions);
  const roadmapGoals =
    summary.planningAnalysis?.goalSummaries.filter(
      (goal) => goal.targetAmount !== null
    ) ?? [];

  if (!roadmapGoals.length) return null;

  const currentRoadmapGoalIndex = roadmapGoals.findIndex(
    (goal) => goal.goalName === summary.goalName && goal.targetDateLabel === targetAnswer.label
  );
  const visibleRoadmapGoals =
    currentRoadmapGoalIndex >= 4
      ? [...roadmapGoals.slice(0, 3), roadmapGoals[currentRoadmapGoalIndex]]
      : roadmapGoals.slice(0, 4);
  const visibleCommitments = buildGoalTimelineCommitments({
    roadmapGoals: visibleRoadmapGoals,
    storedTargetAnswers
  });

  let hasRequestedParallelPreview = false;
  let pendingGapSummaryLine: string | null = null;
  const confirmedLines: string[] = [];
  let pendingLines: string[] = [];

  for (const [index, goal] of visibleRoadmapGoals.entries()) {
    const isCurrentPendingGoal =
      goal.goalName === summary.goalName && goal.targetDateLabel === targetAnswer.label;
    const shouldPreserveRequestedTarget =
      isCurrentPendingGoal && !goal.deadlineMissedBeforeStart;
    const requestedPreviewCandidate = isCurrentPendingGoal
      ? buildRequestedTimelinePreview({
          summary,
          roadmapGoals: visibleRoadmapGoals,
          currentGoalIndex: index,
          storedTargetAnswers
        })
      : null;
    const requestedPreview = shouldUseRequestedTimelinePreview({
      goal,
      preview: requestedPreviewCandidate,
      currentGoalIndex: index
    })
      ? requestedPreviewCandidate
      : null;
    if (requestedPreview) {
      hasRequestedParallelPreview = true;
    }
    const commitment = visibleCommitments[index];
    const startLabel =
      requestedPreview?.startLabel ??
      (!isCurrentPendingGoal ? commitment?.startRef.label : null) ??
      getTimelinePeriodStartLabel(goal);
    const endLabel =
      requestedPreview?.endLabel ??
      (!isCurrentPendingGoal ? commitment?.endRef.label : null) ??
      getTimelinePeriodEndLabel(goal, {
        preserveRequestedTargetDate: shouldPreserveRequestedTarget
      });
    const allocation =
      requestedPreview?.allocation ??
      (!isCurrentPendingGoal ? commitment?.allocation : null) ??
      getTimelineMonthlyAllocation(goal, {
        preserveRequiredMonthly: shouldPreserveRequestedTarget
      });

    if (!startLabel || !endLabel || allocation === null || allocation <= 0) {
      continue;
    }

    const gap = requestedPreview?.gap ?? (!isCurrentPendingGoal ? commitment?.gap : null) ?? goal.gapMonthly ?? 0;

    if (!isCurrentPendingGoal) {
      confirmedLines.push(
        buildCompactTimelineGoalLine({
          goalName: goal.goalName,
          startLabel,
          endLabel,
          allocation,
          gap
        })
      );
      continue;
    }

    pendingLines = [`🟡 Lagi dicek: ${goal.goalName}`];

    if (requestedPreview) {
      const realisticStartLabel = getTimelinePeriodStartLabel(goal);
      const realisticEndLabel = getTimelinePeriodEndLabel(goal);

      if (realisticStartLabel && realisticEndLabel) {
        pendingLines.push(`Timeline realistis: ${realisticStartLabel} - ${realisticEndLabel}`);
      }

      pendingLines.push(`Periode paralel: ${startLabel} - ${requestedPreview.parallelEndLabel}`);

      pendingLines.push(
        `Kalau target tetap ${requestedPreview.endLabel}: total setoran paralel ${formatMoney(
          requestedPreview.totalParallelAllocation
        )}/bulan`
      );
      pendingLines.push(
        buildGapCoverageText({
          gap,
          startLabel,
          endLabel: requestedPreview.parallelEndLabel
        })
      );
      pendingGapSummaryLine = `📌 Kalau deadline ${targetAnswer.label} tetap dipakai, perlu tambah sekitar ${formatMoney(
        gap
      )}/bulan dari ${startLabel} sampai ${requestedPreview.parallelEndLabel}.`;
    } else {
      pendingLines.push(`Timeline: ${startLabel} - ${endLabel}`);
      pendingLines.push(`Setoran: ${formatMoney(allocation)}/bulan`);
      if (gap > 0) {
        pendingLines.push(
          buildGapCoverageText({
            gap,
            startLabel,
            endLabel
          })
        );
        pendingGapSummaryLine = `📌 Biar target ini tetap masuk, perlu tambah sekitar ${formatMoney(
          gap
        )}/bulan dari ${startLabel} sampai ${endLabel}.`;
      }
    }
  }

  if (!confirmedLines.length && !pendingLines.length) return null;

  const lines = ["🎯 Timeline Target Boss", ""];

  if (confirmedLines.length) {
    lines.push(...confirmedLines, "");
  }

  if (pendingLines.length) {
    lines.push(...pendingLines, "");
  }

  lines.push(
    pendingGapSummaryLine ??
      getTimelineOverallNote(roadmapGoals, {
        hasRequestedParallelPreview
      })
  );

  return lines.join("\n").trim();
};

const buildPendingConfirmationReminder = (
  context: RuntimeContext,
  prompt: OnboardingPrompt,
  step: OnboardingStep,
  pendingConfirmation?: OnboardingSession | null
): OnboardingResult =>
  buildMessageWithPromptReply(
    prompt,
    [
      step === OnboardingStep.ASK_GOAL_TARGET_DATE &&
      pendingConfirmation &&
      isAggressiveGoalTargetConfirmation(
        context,
        getStoredGoalTargetSessionAnswer(pendingConfirmation.normalizedAnswerJson)?.target ??
          (pendingConfirmation.normalizedAnswerJson as MonthYearTargetAnswer)
      )
        ? "Kalau mau tetap pakai target yang sekarang, tinggal bilang lanjut dengan target ini."
        : step === OnboardingStep.ASK_GOAL_TARGET_DATE
          ? "Pilih opsi yang mau dipakai ya Boss: 1 tetap deadline, 2 versi realistis, 3 ubah nominal, atau 4 ubah deadline."
        : step === OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN
          ? "Kalau masih ada kategori pengeluaran lain, balas `ada` lalu kirim kategorinya. Kalau sudah lengkap, balas `sudah`."
        : "Kalau sudah sesuai, saya lanjut pakai yang ini.",
      step === OnboardingStep.ASK_GOAL_TARGET_DATE &&
      pendingConfirmation &&
      isAggressiveGoalTargetConfirmation(
        context,
        getStoredGoalTargetSessionAnswer(pendingConfirmation.normalizedAnswerJson)?.target ??
          (pendingConfirmation.normalizedAnswerJson as MonthYearTargetAnswer)
      )
        ? "Kalau lebih cocok pakai saran saya atau mau geser lagi bulannya, tinggal bilang aja. Kalau nominalnya yang mau dibenerin, bilang juga."
        : step === OnboardingStep.ASK_GOAL_TARGET_DATE
          ? "Kalau belum pas, bilang aja bagian mana yang mau diubah. Saya bisa ulang dari nominal atau target waktunya."
        : step === OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN
          ? "Contoh tambahannya: `Keluarga: 500rb` atau `Cicilan motor: 1,2jt`."
        : "Kalau belum sesuai, bilang aja yang mau diubah dan saya bantu ulang dari bagian itu.",
    ]
  );

const CONFIRMATION_STEPS = new Set<OnboardingStep>([
  OnboardingStep.ASK_GOAL_TARGET_DATE,
  OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN
]);

const shouldSkipAnswerConfirmation = (step: OnboardingStep) => !CONFIRMATION_STEPS.has(step);

const GOAL_PRIORITY_SYNC_STEPS = new Set<OnboardingStep>([
  OnboardingStep.ASK_GOAL_SELECTION,
  OnboardingStep.ASK_GOAL_CUSTOM_NAME,
  OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
  OnboardingStep.ASK_GOAL_TARGET_DATE,
  OnboardingStep.ASK_GOAL_ADD_MORE,
  OnboardingStep.ASK_GOAL_ALLOCATION_MODE,
  OnboardingStep.ASK_GOAL_PRIORITY_FOCUS,
  OnboardingStep.ASK_GOAL_EXPENSE_TOTAL
]);

const validateAnswerForStep = (context: RuntimeContext, rawAnswer: unknown) => {
  const prompt = resolvePrompt(context);
  switch (context.user.onboardingStep) {
    case OnboardingStep.WAIT_REGISTER:
      return typeof rawAnswer === "string" && isReadyCommand(rawAnswer)
        ? { value: "START" as SessionAnswerValue }
        : buildPromptReplyResult(prompt);
    case OnboardingStep.VERIFY_PHONE: {
      const phone = typeof rawAnswer === "string" ? parsePhoneInput(rawAnswer) : null;
      return phone
        ? { value: phone }
        : buildValidationReply(prompt, "Nomor WhatsApp belum valid.");
    }
    case OnboardingStep.ASK_EMPLOYMENT_TYPES: {
      const parsed = parseEmploymentTypes(rawAnswer);
      return parsed?.length
        ? { value: parsed }
        : buildValidationReply(
            prompt,
            "Saya belum nangkep pilihan pekerjaanmu. Coba pilih salah satu atau kombinasinya ya Boss."
          );
    }
    case OnboardingStep.ASK_HAS_ACTIVE_INCOME:
    case OnboardingStep.ASK_HAS_PASSIVE_INCOME: {
      const parsed = parseBooleanAnswer(rawAnswer);
      return parsed === null
        ? buildValidationReply(prompt, "Balas dengan `Ada` atau `Ga ada` ya Boss.")
        : { value: parsed };
    }
    case STEP_ACTIVE_INCOME_CYCLE_CONFIRM: {
      const parsed = parseBooleanAnswer(rawAnswer);
      return parsed === null
        ? buildValidationReply(prompt, "Balas `iya` kalau tanggal ini mau jadi awal periode report, atau `bukan` kalau mau lanjut ke income berikutnya ya Boss.")
        : { value: parsed };
    }
    case STEP_ACTIVE_INCOME_ADD_MORE: {
      const parsed = parseActiveIncomeAddMoreAnswer(rawAnswer);
      return parsed === null
        ? buildValidationReply(prompt, "Balas `masih ada` kalau mau tambah income aktif lain, atau `udah itu aja` kalau selesai ya Boss.")
        : { value: parsed };
    }
    case STEP_ACTIVE_INCOME_CYCLE_SELECT: {
      const parsed = parseActiveIncomeCycleSelection(
        rawAnswer,
        context.activeIncomePaydays ?? []
      );
      return parsed === null
        ? buildValidationReply(prompt, "Pilih salah satu income yang tadi, misalnya `income pertama` atau tanggal gajiannya ya Boss.")
        : { value: parsed };
    }
    case STEP_ACTIVE_INCOME_COUNT: {
      const parsed = parseActiveIncomeFrequency(rawAnswer);
      return parsed === null
        ? buildValidationReply(prompt, "Pilih `satu kali gajian` atau `lebih dari satu kali gajian` ya Boss.")
        : { value: parsed };
    }
    case OnboardingStep.ASK_GOAL_ADD_MORE:
    case OnboardingStep.ASK_ASSET_ADD_MORE: {
      const parsed = parseAddMoreAnswer(rawAnswer);
      return parsed === null
        ? buildValidationReply(
            prompt,
            "Balas `Ada` kalau masih mau nambah, atau `Ga ada` kalau mau lanjut ya Boss."
          )
        : { value: parsed };
    }
    case OnboardingStep.ASK_GOAL_ALLOCATION_MODE: {
      const parsed = parseGoalAllocationMode(rawAnswer);
      return parsed
        ? { value: parsed }
        : buildValidationReply(prompt, "Pilih dulu targetnya mau dikejar berurutan atau barengan ya Boss.");
    }
    case OnboardingStep.ASK_PERSONALIZATION_CHOICE: {
      const parsed = parsePersonalizationChoice(rawAnswer);
      return parsed === null
        ? buildValidationReply(
            prompt,
            "Balas `lanjut` kalau mau saya rapihin sekarang, atau `nanti dulu` kalau mau pakai rangkuman yang sekarang."
          )
        : { value: parsed };
    }
    case OnboardingStep.ASK_ACTIVE_INCOME: {

      if (typeof rawAnswer === "string" && rawAnswer.trim().startsWith("-")) {
        return buildValidationReply(
          prompt,
          "Nominal tidak boleh negatif atau minus ya Boss. Kirim nominal yang valid."
        );
      }
      const parsed = parseMoneyInput(rawAnswer);
      if (parsed === null) {
        return buildValidationReply(prompt, "Nominalnya belum valid. Coba kirim angka rupiah ya Boss.");
      }
      if (parsed === 0) {
        return buildValidationReply(
          prompt,
          "Income aktif tidak boleh 0 ya Boss. Kalau memang tidak ada income aktif, balas dengan nominal yang sesuai atau hubungi admin."
        );
      }
      return { value: parsed };
    }
    case OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME:
    case OnboardingStep.ASK_GUIDED_EXPENSE_FOOD:
    case OnboardingStep.ASK_GUIDED_EXPENSE_TRANSPORT:
    case OnboardingStep.ASK_GUIDED_EXPENSE_BILLS:
    case OnboardingStep.ASK_GUIDED_EXPENSE_ENTERTAINMENT:
    case OnboardingStep.ASK_GOAL_EXPENSE_TOTAL:
    case OnboardingStep.ASK_ASSET_SAVINGS_BALANCE:
    case OnboardingStep.ASK_ASSET_PROPERTY_ESTIMATED_VALUE: {

      if (typeof rawAnswer === "string" && rawAnswer.trim().startsWith("-")) {
        return buildValidationReply(
          prompt,
          "Nominal tidak boleh negatif atau minus ya Boss. Kirim nominal yang valid."
        );
      }
      const parsed = parseMoneyInput(rawAnswer);
      return parsed === null
        ? buildValidationReply(prompt, "Nominalnya belum valid. Coba kirim angka rupiah ya Boss.")
        : { value: parsed };
    }
    case OnboardingStep.ASK_GOAL_TARGET_AMOUNT: {
      if (looksLikeGoalTargetDateInput(rawAnswer)) {
        return buildValidationReply(
          prompt,
          "Itu kebaca sebagai target waktu. Untuk langkah ini, kirim nominal dana dulu ya Boss. Contohnya `50jt` atau `Rp50.000.000`."
        );
      }

      if (typeof rawAnswer === "string" && rawAnswer.trim().startsWith("-")) {
        return buildValidationReply(
          prompt,
          "Nominal tidak boleh negatif atau minus ya Boss. Kirim nominal yang valid, contoh: `50jt` atau `Rp50.000.000`."
        );
      }

      const parsed = parseMoneyInput(rawAnswer);
      return parsed === null
        ? buildValidationReply(prompt, "Nominalnya belum valid. Coba kirim angka rupiah ya Boss.")
        : { value: parsed };
    }
    case OnboardingStep.ASK_PASSIVE_INCOME: {
      if (typeof rawAnswer === "string" && rawAnswer.trim().startsWith("-")) {
        return buildValidationReply(
          prompt,
          "Nominal tidak boleh negatif atau minus ya Boss. Kirim nominal yang valid."
        );
      }
      const parsed = parseMoneyInputPreservingRange(rawAnswer);
      return parsed === null
        ? buildValidationReply(
            prompt,
            "Nominal passive income belum kebaca ya Boss. Coba kirim angka atau kisaran per bulan dulu ya."
          )
        : { value: parsed };
    }
    case OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS: {
      const stage = context.guidedOtherExpenseStage ?? "presence";

      if (stage === "category_name") {
        const parsed = parseGuidedOtherExpenseCategoryName(rawAnswer);
        return parsed === null
          ? buildValidationReply(
              prompt,
              "Tulis nama kategori pengeluaran lainnya dulu ya Boss. Contoh: `parkir`, `jajan kantor`, atau `bantuan keluarga`."
            )
          : {
              value: {
                kind: "category_name",
                label: parsed
              }
            };
      }

      if (stage === "category_amount") {
        if (typeof rawAnswer === "string" && rawAnswer.trim().startsWith("-")) {
          return buildValidationReply(
            prompt,
            "Nominal tidak boleh negatif atau minus ya Boss. Kirim nominal yang valid."
          );
        }
        const parsed = parseMoneyInput(rawAnswer);
        const label = context.guidedOtherExpensePendingLabel ?? "kategori ini";
        return parsed === null || parsed <= 0
          ? buildValidationReply(
              prompt,
              `Nominal untuk ${label} belum valid. Coba kirim angka rupiah per bulan ya Boss.`
            )
          : {
              value: {
                kind: "category_amount",
                label,
                amount: parsed
              }
            };
      }

      if (stage === "add_more") {
        const parsed = parseAddMoreAnswer(rawAnswer);
        return parsed === null
          ? buildValidationReply(
              prompt,
              "Balas `Ada` kalau masih ada kategori lain, atau `Ga ada` kalau sudah cukup ya Boss."
            )
          : {
              value: {
                kind: "add_more",
                addMore: parsed
              }
            };
      }

      const parsed = parseAddMoreAnswer(rawAnswer);
      return parsed === null
        ? buildValidationReply(prompt, "Balas dengan `Ada` atau `Ga ada` ya Boss.")
        : {
            value: {
              kind: "presence",
              hasOtherExpense: parsed
            }
          };
    }
    case OnboardingStep.ASK_SALARY_DATE: {
      const parsed = parseDayOfMonth(rawAnswer);
      return parsed === null
        ? buildValidationReply(prompt, "Tanggal gajian harus angka 1-31 ya Boss.")
        : { value: parsed };
    }
    case OnboardingStep.ASK_BUDGET_MODE: {
      const parsed = parseBudgetMode(rawAnswer);
      return parsed ? { value: parsed } : buildValidationReply(prompt, "Pilih salah satu mode pengeluaran ya Boss.");
    }
    case OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN: {
      if (typeof rawAnswer === "string" && isManualExpenseBreakdownTooGeneric(rawAnswer)) {
        return buildManualExpenseTooGenericReply(prompt, rawAnswer);
      }

      const details =
        typeof rawAnswer === "string" ? parseManualExpenseBreakdownDetails(rawAnswer) : [];
      const breakdown = buildExpenseBreakdownFromDetails(details);
      return details.length && parseManualBreakdownTotal(breakdown) !== null
        ? { value: buildManualExpenseConfirmationAnswer(details) }
        : buildValidationReply(
            prompt,
            "Pengeluaran bulanannya belum kebayang dari jawaban ini Boss. Coba tulis kategori dan angkanya ya. Kalau belum punya rinciannya, balas `Saya belum punya, tolong bantu susun`."
          );
    }
    case OnboardingStep.ASK_PRIMARY_GOAL:
    case OnboardingStep.ASK_GOAL_SELECTION: {
      const conflict = parseGoalSelectionConflict(rawAnswer);
      if (conflict) {
        return conflict.nonExclusiveOptions.length
          ? { value: conflict.nonExclusiveOptions }
          : buildValidationReply(
              prompt,
              'Boss, pilihan "Belum ada target" nggak bisa digabung dengan target lain. Pilih salah satu arah dulu ya.'
            );
      }

      const parsed = parseGoalSelections(rawAnswer);
      return parsed?.length
        ? { value: parsed }
        : buildValidationReply(prompt, "Pilih minimal satu target dulu ya Boss.");
    }
    case OnboardingStep.ASK_GOAL_CUSTOM_NAME:
    case OnboardingStep.ASK_ASSET_SAVINGS_NAME:
    case OnboardingStep.ASK_ASSET_PROPERTY_NAME:
      return parseAssetFreeText(rawAnswer)
        ? { value: parseAssetFreeText(rawAnswer)! }
        : buildValidationReply(prompt, "Jawabannya masih terlalu pendek, coba lebih spesifik ya Boss.");
    case OnboardingStep.ASK_GOAL_TARGET_DATE: {
      const parsed = parseMonthYearInput(rawAnswer);
      const targetExamples = getCurrentTargetMonthYearExamples();
      return parsed
        ? { value: parsed }
        : buildValidationReply(
            prompt,
            `Waktu targetnya pilih minimal bulan depan ya Boss. Contohnya \`${targetExamples.numeric}\` atau \`${targetExamples.long}\`.`
          );
    }
    case OnboardingStep.ASK_GOAL_PRIORITY_FOCUS: {
      const parsed = parseGoalPriorityFocus(rawAnswer, context.sessions);
      return parsed
        ? { value: parsed }
        : buildValidationReply(prompt, "Pilih dulu target yang mau jadi prioritas utama ya Boss.");
    }
    case OnboardingStep.ASK_ASSET_GOLD_TYPE:
    case OnboardingStep.ASK_ASSET_GOLD_NAME: {
      const parsed = parseGoldAssetType(rawAnswer);
      return parsed
        ? { value: parsed }
        : buildValidationReply(prompt, "Pilih jenis emasnya dulu ya Boss.");
    }
    case OnboardingStep.ASK_ASSET_GOLD_BRAND: {
      const parsed = parseGoldAssetBrand(rawAnswer);
      return parsed
        ? { value: parsed }
        : buildValidationReply(prompt, "Pilih brand emas batangannya dulu ya Boss.");
    }
    case OnboardingStep.ASK_ASSET_GOLD_KARAT: {
      const parsed = parseGoldAssetKarat(rawAnswer);
      return parsed
        ? { value: parsed }
        : buildValidationReply(prompt, "Pilih karat perhiasannya dulu ya Boss.");
    }
    case OnboardingStep.ASK_ASSET_GOLD_PLATFORM: {
      const parsed = parseGoldAssetPlatform(rawAnswer);
      return parsed
        ? { value: parsed }
        : buildValidationReply(prompt, "Pilih platform emas digitalnya dulu ya Boss.");
    }
    case OnboardingStep.ASK_ASSET_STOCK_SYMBOL: {
      const parsed = parseStockSymbolInput(rawAnswer);
      return parsed
        ? { value: parsed }
        : buildValidationReply(prompt, "Kode sahamnya belum valid. Coba kirim kode seperti `BBRI` atau `BBCA` ya Boss.");
    }
    case OnboardingStep.ASK_ASSET_STOCK_LOTS: {
      const parsed = parseAssetQuantityInput(rawAnswer, "stock_lots");
      return parsed ? { value: parsed } : buildValidationReply(prompt, "Jumlah lot saham belum valid ya Boss.");
    }
    case OnboardingStep.ASK_ASSET_NAME: {
      if (context.currentAssetType === AssetType.STOCK) {
        const parsed = parseStockSymbolInput(rawAnswer);
        return parsed
          ? { value: parsed }
          : buildValidationReply(prompt, "Kode sahamnya belum valid. Coba kirim kode seperti `BBRI` atau `BBCA` ya Boss.");
      }
      return parseAssetFreeText(rawAnswer)
        ? { value: parseAssetFreeText(rawAnswer)! }
        : buildValidationReply(prompt, "Jawabannya masih terlalu pendek, coba lebih spesifik ya Boss.");
    }
    case OnboardingStep.ASK_GOAL_EXPENSE_STRATEGY: {
      const parsed = parseGoalExpenseStrategy(rawAnswer);
      return parsed ? { value: parsed } : buildValidationReply(prompt, "Pilih salah satu opsi dulu ya Boss.");
    }
    case OnboardingStep.ASK_ASSET_SELECTION: {
      const conflict = parseAssetSelectionConflict(rawAnswer);
      if (conflict) {
        return conflict.nonExclusiveOptions.length
          ? { value: conflict.nonExclusiveOptions }
          : buildValidationReply(
              prompt,
              'Boss, kalau memang belum punya aset, pilih "Belum punya" aja ya.'
            );
      }

      const parsed = parseAssetSelections(rawAnswer);
      if (parsed?.length) return { value: parsed };
      return hasMixedNoneAssetSelection(rawAnswer)
        ? buildValidationReply(
            prompt,
            "Kalau memang belum punya aset, pilih Belum punya aja ya Boss. Jangan digabung sama pilihan lain."
          )
        : buildValidationReply(prompt, "Pilih minimal satu aset dulu ya Boss.");
    }
    case OnboardingStep.ASK_ASSET_GOLD_GRAMS: {
      const parsed = parseAssetQuantityInput(rawAnswer, "gold_grams");
      return parsed ? { value: parsed } : buildValidationReply(prompt, "Jumlah gram emas belum valid ya Boss.");
    }
    case OnboardingStep.ASK_ASSET_ESTIMATED_VALUE: {
      if (context.currentAssetType === AssetType.STOCK) {
        const parsed = parseAssetQuantityInput(rawAnswer, "stock_lots");
        return parsed ? { value: parsed } : buildValidationReply(prompt, "Jumlah unitnya belum valid ya Boss.");
      }
      if (typeof rawAnswer === "string" && rawAnswer.trim().startsWith("-")) {
        return buildValidationReply(
          prompt,
          "Nominal tidak boleh negatif atau minus ya Boss. Kirim nominal yang valid."
        );
      }
      const parsed = parseMoneyInput(rawAnswer);
      return parsed === null
        ? buildValidationReply(prompt, "Nominalnya belum valid. Coba kirim angka rupiah ya Boss.")
        : { value: parsed };
    }
    default:
      return buildValidationReply(prompt, "Jawaban belum bisa diproses. Coba lagi ya Boss.");
  }
};

const persistConfirmedAnswerEffects = async (
  context: RuntimeContext,
  normalizedAnswer: SessionAnswerValue
) => {
  switch (context.user.onboardingStep) {
    case OnboardingStep.WAIT_REGISTER:
      await prisma.user.update({ where: { id: context.user.id }, data: { onboardingStatus: OnboardingStatus.IN_PROGRESS } });
      break;
    case OnboardingStep.VERIFY_PHONE:
      await prisma.user.update({ where: { id: context.user.id }, data: { waNumber: normalizedAnswer as string } });
      break;
    case OnboardingStep.ASK_EMPLOYMENT_TYPES: {
      const summary = deriveEmploymentSummary(normalizedAnswer as any[]);
      await prisma.user.update({ where: { id: context.user.id }, data: { employmentType: summary.employmentType, incomeStability: summary.incomeStability } });
      break;
    }
    case OnboardingStep.ASK_ACTIVE_INCOME:
      await syncActiveIncomeProfileFromSessions(context.user.id);
      break;
    case OnboardingStep.ASK_SALARY_DATE: {
      const isSingleActiveIncome =
        context.activeIncomeMode !== "MULTIPLE" && (context.activeIncomeCount ?? 1) <= 1;
      if (isSingleActiveIncome) {
        await prisma.user.update({ where: { id: context.user.id }, data: { salaryDate: normalizedAnswer as number } });
      }
      break;
    }
    case STEP_ACTIVE_INCOME_CYCLE_CONFIRM:
      if ((normalizedAnswer as boolean) === true && context.activeIncomeLatestPayday) {
        await prisma.user.update({ where: { id: context.user.id }, data: { salaryDate: context.activeIncomeLatestPayday } });
      }
      break;
    case STEP_ACTIVE_INCOME_CYCLE_SELECT:
      await prisma.user.update({ where: { id: context.user.id }, data: { salaryDate: normalizedAnswer as number } });
      break;
    case OnboardingStep.ASK_HAS_PASSIVE_INCOME:
      await prisma.user.update({ where: { id: context.user.id }, data: { hasPassiveIncome: normalizedAnswer as boolean } });
      if ((normalizedAnswer as boolean) === false) {
        await upsertIncomeProfile({ userId: context.user.id, passiveIncomeMonthly: null });
      }
      break;
    case OnboardingStep.ASK_PASSIVE_INCOME:
      await upsertIncomeProfile({
        userId: context.user.id,
        passiveIncomeMonthly: getMoneyAnswerLowerBound(normalizedAnswer as number | MoneyRangeAnswer)
      });
      break;
    case OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME:
      await upsertIncomeProfile({ userId: context.user.id, estimatedMonthlyIncome: normalizedAnswer as number });
      break;
    case OnboardingStep.ASK_BUDGET_MODE:
      await prisma.user.update({ where: { id: context.user.id }, data: { budgetMode: normalizedAnswer as BudgetMode } });
      break;
    case OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN: {
      if (isExpenseBudgetDeficitReviewAnswer(normalizedAnswer)) {
        await persistExpenseBudgetReviewAdditionalIncome(context, normalizedAnswer);
        await persistExpenseBudgetPlan(
          context,
          {
            breakdown: normalizedAnswer.breakdown,
            ...(normalizedAnswer.customExpenseItems.length
              ? { customExpenseItems: normalizedAnswer.customExpenseItems }
              : {})
          },
          ExpensePlanSource.MANUAL_USER_PLAN
        );
        break;
      }

      const planInput = buildFinalManualExpensePlanInput(normalizedAnswer);
      await persistExpenseBudgetPlan(context, planInput, ExpensePlanSource.MANUAL_USER_PLAN);
      break;
    }
    case OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS: {
      if (isExpenseBudgetDeficitReviewAnswer(normalizedAnswer)) {
        await persistExpenseBudgetReviewAdditionalIncome(context, normalizedAnswer);
        await persistExpenseBudgetPlan(
          context,
          {
            breakdown: normalizedAnswer.breakdown,
            ...(normalizedAnswer.customExpenseItems.length
              ? { customExpenseItems: normalizedAnswer.customExpenseItems }
              : {})
          },
          ExpensePlanSource.GUIDED_ONBOARDING_PLAN
        );
        break;
      }

      const onboardingSessionModel = getOnboardingSessionModel();
      const sessions = onboardingSessionModel
        ? await onboardingSessionModel.findMany({ where: { userId: context.user.id }, orderBy: { createdAt: "asc" } })
        : [];
      const guidedOtherExpenseState = getGuidedOtherExpenseState(sessions);
      const breakdown: ExpenseBreakdown = {
        food: getSessionNormalizedValue<number>(latestSessionForQuestion(sessions, OnboardingQuestionKey.GUIDED_EXPENSE_FOOD)) ?? 0,
        transport: getSessionNormalizedValue<number>(latestSessionForQuestion(sessions, OnboardingQuestionKey.GUIDED_EXPENSE_TRANSPORT)) ?? 0,
        bills: getSessionNormalizedValue<number>(latestSessionForQuestion(sessions, OnboardingQuestionKey.GUIDED_EXPENSE_BILLS)) ?? 0,
        entertainment: getSessionNormalizedValue<number>(latestSessionForQuestion(sessions, OnboardingQuestionKey.GUIDED_EXPENSE_ENTERTAINMENT)) ?? 0,
        others:
          typeof normalizedAnswer === "number"
            ? normalizedAnswer
            : guidedOtherExpenseState.total
      };

      if (typeof normalizedAnswer === "number") {
        await replaceExpensePlan({
          userId: context.user.id,
          source: ExpensePlanSource.GUIDED_ONBOARDING_PLAN,
          breakdown
        });
        break;
      }

      if (!isGuidedOtherExpenseAnswer(normalizedAnswer)) {
        break;
      }

      if (normalizedAnswer.kind === "presence" && normalizedAnswer.hasOtherExpense === false) {
        await replaceExpensePlan({
          userId: context.user.id,
          source: ExpensePlanSource.GUIDED_ONBOARDING_PLAN,
          breakdown: { ...breakdown, others: 0 }
        });
        break;
      }

      if (
        (normalizedAnswer.kind === "add_more" && normalizedAnswer.addMore === false)
      ) {
        await persistExpenseBudgetPlan(
          context,
          { breakdown, customExpenseItems: guidedOtherExpenseState.items },
          ExpensePlanSource.GUIDED_ONBOARDING_PLAN
        );
      }

      break;
    }
    case OnboardingStep.ASK_PRIMARY_GOAL:
    case OnboardingStep.ASK_GOAL_SELECTION: {
      const selectedGoalTypes = (Array.isArray(normalizedAnswer)
        ? normalizedAnswer
        : [normalizedAnswer]
      ).filter(
        (item): item is FinancialGoalType =>
          isActiveOnboardingGoalType(item)
      );

      for (const goalType of selectedGoalTypes) {
        await createOrUpdateFinancialGoal({
          userId: context.user.id,
          goalType,
          goalName: goalNameByType(goalType, goalType === FinancialGoalType.CUSTOM ? "Custom Target" : null),
          targetAmount: null,
          calculationType:
            goalType === FinancialGoalType.EMERGENCY_FUND
              ? GoalCalculationType.FORMULA_BASED
              : GoalCalculationType.MANUAL,
          status:
            goalType === FinancialGoalType.EMERGENCY_FUND
              ? context.expenseAvailable
                ? FinancialGoalStatus.ACTIVE
                : FinancialGoalStatus.PENDING_CALCULATION
              : FinancialGoalStatus.ACTIVE
        });
      }
      break;
    }
    case OnboardingStep.ASK_GOAL_CUSTOM_NAME:
      if (context.currentGoalType) {
        await createOrUpdateFinancialGoal({
          userId: context.user.id,
          goalType: context.currentGoalType,
          goalName:
            context.currentGoalType === FinancialGoalType.CUSTOM
              ? (normalizedAnswer as string)
              : goalNameByType(context.currentGoalType, getLatestCustomGoalName(context.sessions)),
          targetAmount: getLatestAnswerValue<number>(context, OnboardingQuestionKey.GOAL_TARGET_AMOUNT) ?? null,
          calculationType: GoalCalculationType.MANUAL,
          status: FinancialGoalStatus.ACTIVE
        });
      }
      break;
    case OnboardingStep.ASK_GOAL_TARGET_AMOUNT:
      break;
    case OnboardingStep.ASK_GOAL_TARGET_DATE:
      if (context.currentGoalType) {
        const target =
          getStoredGoalTargetSessionAnswer(normalizedAnswer)?.target ??
          (normalizedAnswer as MonthYearTargetAnswer);
        await createOrUpdateFinancialGoal({
          userId: context.user.id,
          goalType: context.currentGoalType,
          goalName: goalNameByType(context.currentGoalType, getLatestCustomGoalName(context.sessions)),
          targetAmount:
            getLatestAnswerValue<number>(context, OnboardingQuestionKey.GOAL_TARGET_AMOUNT) ?? null,
          calculationType: GoalCalculationType.MANUAL,
          status: FinancialGoalStatus.ACTIVE,
          targetMonth: target.month,
          targetYear: target.year
        });
      }
      break;
    case OnboardingStep.ASK_GOAL_EXPENSE_STRATEGY:
      if (normalizedAnswer === "SKIP") {
        for (const goalType of getSelectedExpenseGoalTypes(context.sessions)) {
          await createOrUpdateFinancialGoal({
            userId: context.user.id,
            goalType,
            goalName: goalNameByType(goalType, null),
            targetAmount: null,
            calculationType:
              goalType === FinancialGoalType.EMERGENCY_FUND
                ? GoalCalculationType.AUTO_FROM_EXPENSE
                : GoalCalculationType.FORMULA_BASED,
            status: FinancialGoalStatus.PENDING_CALCULATION
          });
        }
      }
      break;
    case OnboardingStep.ASK_GOAL_EXPENSE_TOTAL:
      await setMonthlyExpenseTotal(context.user.id, normalizedAnswer as number);
      if (getSelectedExpenseGoalTypes(context.sessions).includes(FinancialGoalType.EMERGENCY_FUND)) {
        await createOrUpdateFinancialGoal({
          userId: context.user.id,
          goalType: FinancialGoalType.EMERGENCY_FUND,
          goalName: goalNameByType(FinancialGoalType.EMERGENCY_FUND, null),
          targetAmount: null,
          calculationType: GoalCalculationType.FORMULA_BASED,
          status: FinancialGoalStatus.ACTIVE
        });
      }
      break;
    case OnboardingStep.ASK_GOAL_ALLOCATION_MODE:
      await prisma.user.update({
        where: { id: context.user.id },
        data: { goalExecutionMode: normalizedAnswer as any }
      });
      break;
    case OnboardingStep.ASK_GOAL_PRIORITY_FOCUS:
      await prisma.user.update({
        where: { id: context.user.id },
        data: { priorityGoalType: normalizedAnswer as FinancialGoalType }
      });
      break;
    case OnboardingStep.ASK_ASSET_SELECTION: {
      const selectedAssetTypes = (Array.isArray(normalizedAnswer)
        ? normalizedAnswer
        : [normalizedAnswer]
      ).filter(
        (item): item is AssetType =>
          Boolean(item) && item !== ASSET_NONE_VALUE
      );
      await prisma.user.update({
        where: { id: context.user.id },
        data: { hasAssets: selectedAssetTypes.length > 0 }
      });
      break;
    }
    case OnboardingStep.ASK_ASSET_SAVINGS_BALANCE:
    case OnboardingStep.ASK_ASSET_GOLD_GRAMS:
    case OnboardingStep.ASK_ASSET_GOLD_KARAT:
    case OnboardingStep.ASK_ASSET_GOLD_PLATFORM:
    case OnboardingStep.ASK_ASSET_STOCK_LOTS:
    case OnboardingStep.ASK_ASSET_PROPERTY_ESTIMATED_VALUE:
    case OnboardingStep.ASK_ASSET_ESTIMATED_VALUE:
      {
        const assetPayload = await buildAssetCreatePayload(context, normalizedAnswer);
        if (assetPayload) {
          await createOnboardingAsset({
            userId: context.user.id,
            ...assetPayload
          });
        }
      }
      break;
  }

  if (GOAL_PRIORITY_SYNC_STEPS.has(context.user.onboardingStep)) {
    const onboardingSessionModel = getOnboardingSessionModel();
    if (!onboardingSessionModel) return;

    const sessions = await onboardingSessionModel.findMany({
      where: { userId: context.user.id },
      orderBy: { createdAt: "asc" }
    });
    await syncAutomaticGoalRecommendation(context.user.id, sessions as OnboardingSession[]);
  }
};

const moveToStep = async (userId: string, step: OnboardingStep) =>
  prisma.user.update({ where: { id: userId }, data: { onboardingStep: step, onboardingStatus: step === OnboardingStep.COMPLETED ? OnboardingStatus.COMPLETED : OnboardingStatus.IN_PROGRESS } });

const buildFallbackCompletedAnalysisText = async (userId: string) => {
  const context = await buildRuntimeContext(userId);
  const lines = [
    "Onboarding selesai, Boss.",
    "Saya sudah simpan data onboarding Boss. Analisa detail dari AI belum bisa dibuat sekarang, jadi saya tampilkan ringkasan amannya dulu.",
    "",
    "📊 Ringkasan Keuangan Boss",
    ""
  ];

  lines.push(
    `Income: ${
      context.monthlyIncomeTotal !== null
        ? `${formatMoney(context.monthlyIncomeTotal)}/bulan`
        : "belum kebaca"
    }`
  );
  lines.push(
    `Pengeluaran: ${
      context.monthlyExpenseTotal !== null
        ? `${formatMoney(context.monthlyExpenseTotal)}/bulan`
        : "belum lengkap"
    }`
  );
  lines.push(
    `Ruang nabung: ${
      context.potentialMonthlySaving !== null
        ? `${formatMoney(context.potentialMonthlySaving)}/bulan`
        : "belum kebaca"
    }`
  );

  if (
    context.monthlyIncomeTotal !== null &&
    context.monthlyIncomeTotal > 0 &&
    context.potentialMonthlySaving !== null
  ) {
    lines.push(
      `Saving rate: ${formatPercent(
        Math.max(0, context.potentialMonthlySaving) / context.monthlyIncomeTotal,
        1
      )}`
    );
  }

  lines.push("");
  lines.push("Bacaan saya: data utama sudah masuk, jadi fitur pencatatan, report, reminder, dan tracking target bisa mulai dipakai.");

  return lines.join("\n");
};

const buildSafeCompletedAnalysisText = async (userId: string) => {
  try {
    return await generateOnboardingAnalysis(userId);
  } catch (error) {
    logger.error({ err: error, userId }, "Failed to generate onboarding analysis");
    return buildFallbackCompletedAnalysisText(userId);
  }
};

const buildCompletedTimelineReplyTexts = async (userId: string) => {
  const context = await buildRuntimeContext(userId);
  if (!context.activeGoals.length) return null;

  const planningAnalysis = buildOnboardingPlanningAnalysis({
    incomeStability: context.user.incomeStability,
    monthlyIncomeTotal: context.monthlyIncomeTotal,
    monthlyExpenseTotal: context.monthlyExpenseTotal,
    goalExecutionMode: context.user.goalExecutionMode,
    priorityGoalType: context.user.priorityGoalType,
    goals: context.activeGoals,
    assets: []
  });

  const storedTargetAnswers = getStoredCompletedGoalTargetAnswers(context.sessions);
  const timelineGoals = planningAnalysis.goalSummaries.filter(
    (goal) => goal.targetAmount !== null || goal.goalType === FinancialGoalType.EMERGENCY_FUND
  );
  const commitments = buildGoalTimelineCommitments({
    roadmapGoals: timelineGoals,
    storedTargetAnswers
  });

  const evaluations = timelineGoals.map((goal, index) => {
    const storedTargetAnswer = findStoredGoalTargetAnswer(goal, storedTargetAnswers);
    const baseEvaluation = evaluateTargetAgainstCurrentPlan({
      goal,
      desiredDate:
        storedTargetAnswer?.userDecision === "original" && storedTargetAnswer.desiredDate
          ? {
              month: storedTargetAnswer.desiredDate.month,
              year: storedTargetAnswer.desiredDate.year,
              monthsFromNow: storedTargetAnswer.desiredDate.monthsFromNow,
              label: storedTargetAnswer.desiredDate.label
            }
          : undefined,
      userDecision:
        goal.goalType === FinancialGoalType.EMERGENCY_FUND
          ? "original"
          : storedTargetAnswer?.userDecision ?? "original"
    });

    return applyStoredGoalTargetDecisionToEvaluation({
      evaluation: baseEvaluation,
      storedTargetAnswer,
      commitment: commitments[index]
    });
  });

  return generateFinalTimelineReplyTexts({
    evaluations
  });
};

const buildSafeCompletedTimelineReplyTexts = async (userId: string) => {
  try {
    return await buildCompletedTimelineReplyTexts(userId);
  } catch (error) {
    logger.error({ err: error, userId }, "Failed to generate onboarding timeline");
    return null;
  }
};

const finalizeOnboarding = async (userId: string) => {
  await buildInitialFinancialProfile(userId);
  const [analysisText, timelineReplyTexts] = await Promise.all([
    buildSafeCompletedAnalysisText(userId),
    buildSafeCompletedTimelineReplyTexts(userId)
  ]);
  const timelineText = timelineReplyTexts?.join("\n\n").trim() ?? null;
  const user = await prisma.user.update({ where: { id: userId }, data: { registrationStatus: RegistrationStatus.COMPLETED, onboardingStatus: OnboardingStatus.COMPLETED, onboardingStep: OnboardingStep.COMPLETED, onboardingCompletedAt: new Date(), analysisReady: true } });
  return createState({ user, prompt: null, analysisText, timelineText, timelineReplyTexts });
};

const buildPostOnboardingActiveText = () =>
  [
    "💼 Mulai sekarang Boss bisa pakai Finance AI begini:",
    "- Catat transaksi natural: `makan 35rb`, `gaji 9,2jt`, atau `beli bensin 100rb`.",
    "- Cek laporan: `laporan minggu ini`, `/monthly report`, atau `/cashflow report`.",
    "- Lihat arah target: kirim `lihat timeline` kapan pun.",
    "- Reminder otomatis: `status reminder aku`, `matikan reminder budget`, atau `pause reminder 12 jam`.",
    "- Update aset/target: `catat tabungan 10jt`, `catat emas`, `catat saham BBCA 2 lot harga 9000`, `catat properti rumah senilai 300jt`, atau `nabung 500rb`."
  ].join("\n");

const buildCompletedReplyTexts = (state: OnboardingState) =>
  [
    state.analysisText ?? "Onboarding selesai.",
    ...(state.timelineReplyTexts?.length
      ? state.timelineReplyTexts
      : state.timelineText
        ? [state.timelineText]
        : []),
    buildPostOnboardingActiveText()
  ].filter((item): item is string => typeof item === "string" && item.trim().length > 0);

const buildCompletedReplyText = (state: OnboardingState) =>
  buildCompletedReplyTexts(state).join("\n\n");

const requestAnswerConfirmation = async (
  context: RuntimeContext,
  normalizedAnswer: SessionAnswerValue,
  rawAnswer: unknown,
  pendingConfirmation?: OnboardingSession | null
): Promise<OnboardingResult> => {
  const prompt = resolvePrompt(context);
  const normalizedAnswerToStore =
    context.user.onboardingStep === OnboardingStep.ASK_GOAL_TARGET_DATE
      ? buildStoredGoalTargetSessionAnswer({
          summary: buildGoalTargetConfirmationSummary(
            context,
            normalizedAnswer as MonthYearTargetAnswer
          ),
          target: normalizedAnswer as MonthYearTargetAnswer,
          userDecision: "pending"
        })
      : normalizedAnswer;
  await saveSessionAnswer({
    userId: context.user.id,
    stepKey: context.user.onboardingStep,
    questionKey: prompt.questionKey,
    rawAnswer,
    normalizedAnswer: normalizedAnswerToStore,
    isCompleted: false,
    replaceSessionId: pendingConfirmation?.id ?? null
  });

  const replyTexts = buildConfirmationReplyTexts(context, normalizedAnswer);
  return buildReplyResult(
    replyTexts,
    createState({ user: context.user, prompt }),
    {
      preserveReplyTextBubbles: replyTexts.length > 1
    }
  );
};

const isGuidedExpenseFinalAnswer = (normalizedAnswer: SessionAnswerValue) => {
  if (typeof normalizedAnswer === "number") return true;
  if (!isGuidedOtherExpenseAnswer(normalizedAnswer)) return false;
  if (normalizedAnswer.kind === "presence") return normalizedAnswer.hasOtherExpense === false;
  if (normalizedAnswer.kind === "add_more") return normalizedAnswer.addMore === false;
  return false;
};

const shouldCheckExpenseBudgetDeficit = (
  context: RuntimeContext,
  normalizedAnswer: SessionAnswerValue
) => {
  if (isExpenseBudgetDeficitReviewAnswer(normalizedAnswer)) return true;
  if (context.user.onboardingStep === OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN) return true;
  if (context.user.onboardingStep === OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS) {
    return isGuidedExpenseFinalAnswer(normalizedAnswer);
  }
  return false;
};

const requestExpenseBudgetDeficitReviewIfNeeded = async (params: {
  context: RuntimeContext;
  normalizedAnswer: SessionAnswerValue;
  rawAnswer: unknown;
  pendingConfirmation?: OnboardingSession | null;
}): Promise<OnboardingResult | null> => {
  const { context, normalizedAnswer, rawAnswer, pendingConfirmation } = params;
  if (!shouldCheckExpenseBudgetDeficit(context, normalizedAnswer)) return null;

  const plan = getExpenseBudgetPlanForCurrentStep(context, normalizedAnswer);
  const source = getExpenseBudgetSourceForCurrentStep(context.user.onboardingStep);
  if (!plan || !source) return null;

  const existingReview = isExpenseBudgetDeficitReviewAnswer(normalizedAnswer)
    ? normalizedAnswer
    : null;
  if (
    existingReview?.deficitSaveApproved ||
    getExpenseBudgetDeficitAmount(context, plan, existingReview ?? undefined) <= 0
  ) {
    return null;
  }

  const prompt = resolvePrompt(context);
  const review = buildExpenseBudgetDeficitReviewAnswer({
    source,
    originalAnswer: normalizedAnswer,
    plan,
    previous: existingReview,
    stage: "ask_income_more"
  });

  await saveSessionAnswer({
    userId: context.user.id,
    stepKey: context.user.onboardingStep,
    questionKey: prompt.questionKey,
    rawAnswer,
    normalizedAnswer: review,
    isCompleted: false,
    replaceSessionId: pendingConfirmation?.id ?? null
  });

  return buildReplyResult(
    [buildExpenseBudgetDeficitWarningText(context, review)],
    createState({ user: context.user, prompt })
  );
};

type PersistAnswerEffectsResult =
  | { kind: "ok" }
  | { kind: "validation"; message: string }
  | { kind: "redirect"; redirect: OnboardingStepRedirect };

const tryPersistAnswerEffects = async (
  context: RuntimeContext,
  normalizedAnswer: SessionAnswerValue
): Promise<PersistAnswerEffectsResult> => {
  try {
    await persistConfirmedAnswerEffects(context, normalizedAnswer);
    return { kind: "ok" };
  } catch (error) {
    const userMessage = getOnboardingAssetErrorMessage(error);
    if (userMessage) return { kind: "validation", message: userMessage };

    const redirect = getOnboardingStepRedirect(error);
    if (redirect) return { kind: "redirect", redirect };

    throw error;
  }
};

const persistExpenseBudgetReviewAdditionalIncome = async (
  context: RuntimeContext,
  review: ExpenseBudgetDeficitReviewAnswer
) => {
  const additionalActive = Math.max(0, review.additionalActiveIncome);
  const additionalPassive = Math.max(0, review.additionalPassiveIncome);
  if (additionalActive <= 0 && additionalPassive <= 0) return;

  const existingStructuredIncome =
    (context.activeIncomeMonthly ?? 0) + (context.passiveIncomeMonthly ?? 0);
  if (existingStructuredIncome > 0 || context.estimatedMonthlyIncome === null) {
    await upsertIncomeProfile({
      userId: context.user.id,
      activeIncomeMonthly: (context.activeIncomeMonthly ?? 0) + additionalActive,
      passiveIncomeMonthly: (context.passiveIncomeMonthly ?? 0) + additionalPassive
    });
    return;
  }

  await upsertIncomeProfile({
    userId: context.user.id,
    estimatedMonthlyIncome:
      (context.estimatedMonthlyIncome ?? context.monthlyIncomeTotal ?? 0) +
      additionalActive +
      additionalPassive
  });
};

const persistExpenseBudgetPlan = async (
  context: RuntimeContext,
  plan: ExpenseBudgetPlanInput,
  source: ExpensePlanSource
) => {
  await replaceExpensePlan({
    userId: context.user.id,
    source,
    breakdown: plan.breakdown,
    ...(plan.customExpenseItems?.length
      ? { customExpenseItems: plan.customExpenseItems }
      : {})
  });
};

const continueWithoutConfirmation = async (
  context: RuntimeContext,
  normalizedAnswer: SessionAnswerValue,
  rawAnswer: unknown
): Promise<OnboardingResult> => {
  const prompt = resolvePrompt(context);
  const deficitReview = await requestExpenseBudgetDeficitReviewIfNeeded({
    context,
    normalizedAnswer,
    rawAnswer
  });
  if (deficitReview) return deficitReview;

  if (isFinalAssetStep(context)) {
    const effectResult = await tryPersistAnswerEffects(context, normalizedAnswer);
    if (effectResult.kind === "validation") {
      return buildValidationReply(prompt, effectResult.message);
    }
    if (effectResult.kind === "redirect") {
      await saveSessionAnswer({
        userId: context.user.id,
        stepKey: context.user.onboardingStep,
        questionKey: prompt.questionKey,
        rawAnswer,
        normalizedAnswer,
        isCompleted: true
      });

      const redirectedUser = await moveToStep(context.user.id, effectResult.redirect.step);
      const redirectedContext = await buildRuntimeContext(context.user.id, redirectedUser);
      const redirectedPrompt = resolvePrompt(redirectedContext);
      const redirectedPromptTexts = await formatOutgoingPromptForChatBubbles(redirectedContext);
      return buildReplyResult(
        [effectResult.redirect.message, ...redirectedPromptTexts],
        createState({ user: redirectedUser, prompt: redirectedPrompt }),
        { preserveReplyTextBubbles: redirectedPromptTexts.length > 1 }
      );
    }
  }
  await saveSessionAnswer({
    userId: context.user.id,
    stepKey: context.user.onboardingStep,
    questionKey: prompt.questionKey,
    rawAnswer,
    normalizedAnswer,
    isCompleted: true
  });
  if (!isFinalAssetStep(context)) {
    await persistConfirmedAnswerEffects(context, normalizedAnswer);
  }
  if (needsProfileRecalculation(context.user.onboardingStep)) {
    await buildInitialFinancialProfile(context.user.id);
  }

  const nextContext = await buildRuntimeContext(context.user.id);
  const nextStep = getNextOnboardingStep(context.user.onboardingStep, nextContext, normalizedAnswer);
  const leadTexts = await getTransitionLeadTexts({
    userId: context.user.id,
    currentStep: context.user.onboardingStep,
    normalizedAnswer,
    nextStep
  });
  if (nextStep === OnboardingStep.SHOW_ANALYSIS) {
    const state = await finalizeOnboarding(context.user.id);
    const replyTexts = buildCompletedReplyTexts(state);
    return buildReplyResult(replyTexts, state, {
      preserveReplyTextBubbles: replyTexts.length > 1
    });
  }

  const updatedUser = await moveToStep(context.user.id, nextStep);
  const updatedContext = await buildRuntimeContext(context.user.id, updatedUser);
  const nextPrompt = resolvePrompt(updatedContext);
  const nextPromptTexts = await formatOutgoingPromptForChatBubbles(updatedContext);
  const nextState = createState({ user: updatedUser, prompt: nextPrompt });
  const shouldPreservePromptBubble =
    shouldSeparateNextPromptBubble(context.user.onboardingStep, nextStep) ||
    (nextStep === OnboardingStep.ASK_ASSET_SELECTION &&
      leadTexts.some((text) => text.startsWith("Berikut kategori pengeluarannya:"))) ||
    nextPromptTexts.length > 1;

  if (shouldPreservePromptBubble) {
    const transitionText = leadTexts.filter(Boolean).join("\n\n");
    return buildReplyResult([transitionText, ...nextPromptTexts], nextState, {
      preserveReplyTextBubbles: true
    });
  }

  return buildReplyResult([...leadTexts, ...nextPromptTexts], nextState);
};

const completePendingConfirmation = async (params: {
  context: RuntimeContext;
  pendingConfirmation: OnboardingSession;
  normalizedAnswerOverride?: SessionAnswerValue;
  rawAnswerOverride?: unknown;
  prefixTexts?: string[];
}): Promise<OnboardingResult> => {
  const { context, pendingConfirmation } = params;
  const prompt = resolvePrompt(context);
  const normalizedAnswer =
    params.normalizedAnswerOverride ?? (pendingConfirmation.normalizedAnswerJson as SessionAnswerValue);
  const rawAnswer = params.rawAnswerOverride ?? pendingConfirmation.rawAnswerJson;
  const pendingStoredGoalTarget =
    context.user.onboardingStep === OnboardingStep.ASK_GOAL_TARGET_DATE
      ? getStoredGoalTargetSessionAnswer(pendingConfirmation.normalizedAnswerJson)
      : null;
  const acceptedGoalTargetAnswer =
    getStoredGoalTargetSessionAnswer(normalizedAnswer)?.target ??
    (normalizedAnswer as MonthYearTargetAnswer);
  const goalTargetSessionValue =
    context.user.onboardingStep === OnboardingStep.ASK_GOAL_TARGET_DATE
      ? (() => {
          const base = buildStoredGoalTargetSessionAnswer({
            summary: buildGoalTargetConfirmationSummary(context, acceptedGoalTargetAnswer),
            target: acceptedGoalTargetAnswer,
            userDecision:
              pendingStoredGoalTarget?.realisticDate &&
              pendingStoredGoalTarget.realisticDate.month === acceptedGoalTargetAnswer.month &&
              pendingStoredGoalTarget.realisticDate.year === acceptedGoalTargetAnswer.year
                ? "realistic"
                : "original"
          });

          return pendingStoredGoalTarget
            ? {
                ...base,
                desiredDate: pendingStoredGoalTarget.desiredDate,
                realisticDate: pendingStoredGoalTarget.realisticDate ?? base.realisticDate,
                realisticStartDate:
                  pendingStoredGoalTarget.realisticStartDate ?? base.realisticStartDate,
                realisticEndDate:
                  pendingStoredGoalTarget.realisticEndDate ?? base.realisticEndDate
              }
            : base;
        })()
      : normalizedAnswer;
  const deficitReview = await requestExpenseBudgetDeficitReviewIfNeeded({
    context,
    normalizedAnswer: goalTargetSessionValue,
    rawAnswer,
    pendingConfirmation
  });
  if (deficitReview) return deficitReview;

  await resetAssetSessionScopeIfNeeded(context, pendingConfirmation);
  if (isFinalAssetStep(context)) {
    const effectResult = await tryPersistAnswerEffects(context, goalTargetSessionValue);
    if (effectResult.kind === "validation") {
      await invalidatePendingConfirmation(pendingConfirmation.id);
      return buildValidationReply(prompt, effectResult.message);
    }
    if (effectResult.kind === "redirect") {
      await saveSessionAnswer({
        userId: context.user.id,
        stepKey: context.user.onboardingStep,
        questionKey: prompt.questionKey,
        rawAnswer,
        normalizedAnswer: goalTargetSessionValue,
        isCompleted: true,
        replaceSessionId: pendingConfirmation.id
      });

      const redirectedUser = await moveToStep(context.user.id, effectResult.redirect.step);
      const redirectedContext = await buildRuntimeContext(context.user.id, redirectedUser);
      const redirectedPrompt = resolvePrompt(redirectedContext);
      const redirectedPromptTexts = await formatOutgoingPromptForChatBubbles(redirectedContext);
      return buildReplyResult(
        [effectResult.redirect.message, ...redirectedPromptTexts],
        createState({ user: redirectedUser, prompt: redirectedPrompt }),
        { preserveReplyTextBubbles: redirectedPromptTexts.length > 1 }
      );
    }
  }
  await saveSessionAnswer({
    userId: context.user.id,
    stepKey: context.user.onboardingStep,
    questionKey: prompt.questionKey,
    rawAnswer,
    normalizedAnswer: goalTargetSessionValue,
    isCompleted: true,
    replaceSessionId: pendingConfirmation.id
  });
  if (!isFinalAssetStep(context)) {
    await persistConfirmedAnswerEffects(context, goalTargetSessionValue);
  }
  if (needsProfileRecalculation(context.user.onboardingStep)) {
    await buildInitialFinancialProfile(context.user.id);
  }

  const nextContext = await buildRuntimeContext(context.user.id);
  const nextStep = getNextOnboardingStep(
    context.user.onboardingStep,
    nextContext,
    goalTargetSessionValue
  );
  const leadTexts = await getTransitionLeadTexts({
    userId: context.user.id,
    currentStep: context.user.onboardingStep,
    normalizedAnswer: goalTargetSessionValue,
    nextStep
  });
  if (nextStep === OnboardingStep.SHOW_ANALYSIS) {
    const state = await finalizeOnboarding(context.user.id);
    return buildReplyResult(
      [...(params.prefixTexts ?? []), ...leadTexts, ...buildCompletedReplyTexts(state)],
      state,
      {
        preserveReplyTextBubbles:
          (params.prefixTexts?.length ?? 0) > 1 || buildCompletedReplyTexts(state).length > 1
      }
    );
  }

  const updatedUser = await moveToStep(context.user.id, nextStep);
  const updatedContext = await buildRuntimeContext(context.user.id, updatedUser);
  const nextPrompt = resolvePrompt(updatedContext);
  const nextPromptTexts = await formatOutgoingPromptForChatBubbles(updatedContext);
  return buildReplyResult(
    [...(params.prefixTexts ?? []), ...leadTexts, ...nextPromptTexts],
    createState({ user: updatedUser, prompt: nextPrompt }),
    {
      preserveReplyTextBubbles:
        (params.prefixTexts?.length ?? 0) > 1 || nextPromptTexts.length > 1
    }
  );
};

const continueFromConfirmedAnswer = async (
  context: RuntimeContext,
  pendingConfirmation: OnboardingSession
): Promise<OnboardingResult> =>
  completePendingConfirmation({
    context,
    pendingConfirmation,
    prefixTexts: ["Oke, saya lanjut dari sini."]
  });

const routeManualExpenseToGuidedSetup = async (
  context: RuntimeContext
): Promise<OnboardingResult> => {
  await prisma.user.update({
    where: { id: context.user.id },
    data: { budgetMode: BudgetMode.GUIDED_PLAN }
  });

  const guidedUser = await moveToStep(context.user.id, OnboardingStep.ASK_GUIDED_EXPENSE_FOOD);
  const guidedContext = await buildRuntimeContext(context.user.id, guidedUser);
  const guidedPrompt = resolvePrompt(guidedContext);
  const guidedPromptTexts = await formatOutgoingPromptForChatBubbles(guidedContext);

  return buildReplyResult(
    ["Siap Boss, saya bantu susun satu per satu.", ...guidedPromptTexts],
    createState({ user: guidedUser, prompt: guidedPrompt }),
    { preserveReplyTextBubbles: guidedPromptTexts.length > 1 }
  );
};

const requestManualExpenseMergeConfirmation = async (
  context: RuntimeContext,
  prompt: OnboardingPrompt,
  pendingConfirmation: OnboardingSession,
  answer: ManualExpenseConfirmationAnswer,
  rawAnswer: unknown,
  candidate: ManualExpenseMergeCandidate
): Promise<OnboardingResult> => {
  const answerWithPrompt: ManualExpenseConfirmationAnswer = {
    ...answer,
    mergePromptBucket: candidate.bucket
  };
  await saveSessionAnswer({
    userId: context.user.id,
    stepKey: context.user.onboardingStep,
    questionKey: prompt.questionKey,
    rawAnswer,
    normalizedAnswer: answerWithPrompt,
    isCompleted: false,
    replaceSessionId: pendingConfirmation.id
  });

  return buildReplyResult(
    [buildManualExpenseMergeQuestionText(candidate)],
    createState({ user: context.user, prompt })
  );
};

const requestManualExpenseFinalReview = async (
  context: RuntimeContext,
  prompt: OnboardingPrompt,
  pendingConfirmation: OnboardingSession,
  answer: ManualExpenseConfirmationAnswer,
  rawAnswer: unknown
): Promise<OnboardingResult> => {
  const answerForReview: ManualExpenseConfirmationAnswer = {
    ...answer,
    mergePromptBucket: null,
    reviewReady: true
  };
  await saveSessionAnswer({
    userId: context.user.id,
    stepKey: context.user.onboardingStep,
    questionKey: prompt.questionKey,
    rawAnswer,
    normalizedAnswer: answerForReview,
    isCompleted: false,
    replaceSessionId: pendingConfirmation.id
  });

  const replyTexts = buildManualExpenseFinalReviewReplyTexts(answerForReview);
  return buildReplyResult(
    replyTexts,
    createState({ user: context.user, prompt }),
    { preserveReplyTextBubbles: replyTexts.length > 1 }
  );
};

const saveExpenseBudgetDeficitReviewReply = async (
  context: RuntimeContext,
  prompt: OnboardingPrompt,
  pendingConfirmation: OnboardingSession,
  review: ExpenseBudgetDeficitReviewAnswer,
  rawAnswer: unknown,
  replyText: string
): Promise<OnboardingResult> => {
  await saveSessionAnswer({
    userId: context.user.id,
    stepKey: context.user.onboardingStep,
    questionKey: prompt.questionKey,
    rawAnswer,
    normalizedAnswer: review,
    isCompleted: false,
    replaceSessionId: pendingConfirmation.id
  });

  return buildReplyResult([replyText], createState({ user: context.user, prompt }));
};

const wantsRegularBudgetSave = (rawAnswer: unknown) => {
  if (typeof rawAnswer === "string") {
    const normalized = normalizeText(rawAnswer).toLowerCase();
    if (normalized.includes("simpan") || normalized.includes("save")) return true;
  }
  return isPositiveAnswerConfirmation(rawAnswer);
};

const handleExpenseBudgetDeficitPendingConfirmation = async (
  context: RuntimeContext,
  prompt: OnboardingPrompt,
  pendingConfirmation: OnboardingSession,
  review: ExpenseBudgetDeficitReviewAnswer,
  rawAnswer: unknown
): Promise<OnboardingResult> => {
  const plan = { breakdown: review.breakdown, customExpenseItems: review.customExpenseItems };

  if (review.stage === "ask_income_more") {
    const addMoreAnswer = parseAddMoreAnswer(rawAnswer);
    if (addMoreAnswer === true) {
      return saveExpenseBudgetDeficitReviewReply(
        context,
        prompt,
        pendingConfirmation,
        { ...review, stage: "ask_income_type" },
        rawAnswer,
        buildExpenseBudgetIncomeTypeQuestionText()
      );
    }

    if (addMoreAnswer === false || isNegativeAnswerConfirmation(rawAnswer)) {
      return saveExpenseBudgetDeficitReviewReply(
        context,
        prompt,
        pendingConfirmation,
        { ...review, stage: "ask_adjust_expense" },
        rawAnswer,
        buildExpenseBudgetAdjustQuestionText()
      );
    }

    return buildReplyResult(
      [buildExpenseBudgetDeficitWarningText(context, review)],
      createState({ user: context.user, prompt })
    );
  }

  if (review.stage === "ask_income_type") {
    const incomeTypes = parseExpenseBudgetIncomeTypes(rawAnswer);
    if (!incomeTypes) {
      return buildReplyResult(
        [buildExpenseBudgetIncomeTypeQuestionText()],
        createState({ user: context.user, prompt })
      );
    }

    const [nextType, ...remainingTypes] = incomeTypes;
    const nextReview: ExpenseBudgetDeficitReviewAnswer = {
      ...review,
      pendingIncomeTypes: remainingTypes,
      stage: nextType === "active" ? "ask_active_income_amount" : "ask_passive_income_amount"
    };
    return saveExpenseBudgetDeficitReviewReply(
      context,
      prompt,
      pendingConfirmation,
      nextReview,
      rawAnswer,
      getIncomeAmountPromptText(nextType)
    );
  }

  if (
    review.stage === "ask_active_income_amount" ||
    review.stage === "ask_passive_income_amount"
  ) {
    const amount = parseMoneyInput(rawAnswer);
    const currentType: ExpenseBudgetIncomeType =
      review.stage === "ask_active_income_amount" ? "active" : "passive";
    if (amount === null || amount <= 0) {
      return buildReplyResult(
        [getIncomeAmountPromptText(currentType)],
        createState({ user: context.user, prompt })
      );
    }

    const [nextType, ...remainingTypes] = review.pendingIncomeTypes;
    const updatedReview: ExpenseBudgetDeficitReviewAnswer = {
      ...review,
      additionalActiveIncome:
        review.additionalActiveIncome + (currentType === "active" ? amount : 0),
      additionalPassiveIncome:
        review.additionalPassiveIncome + (currentType === "passive" ? amount : 0),
      pendingIncomeTypes: remainingTypes,
      stage: nextType
        ? nextType === "active"
          ? "ask_active_income_amount"
          : "ask_passive_income_amount"
        : "ask_income_more"
    };

    if (nextType) {
      return saveExpenseBudgetDeficitReviewReply(
        context,
        prompt,
        pendingConfirmation,
        updatedReview,
        rawAnswer,
        getIncomeAmountPromptText(nextType)
      );
    }

    if (getExpenseBudgetDeficitAmount(context, plan, updatedReview) <= 0) {
      return saveExpenseBudgetDeficitReviewReply(
        context,
        prompt,
        pendingConfirmation,
        { ...updatedReview, stage: "confirm_save" },
        rawAnswer,
        buildExpenseBudgetFinalSaveConfirmationText(context, updatedReview)
      );
    }

    return saveExpenseBudgetDeficitReviewReply(
      context,
      prompt,
      pendingConfirmation,
      { ...updatedReview, stage: "ask_income_more" },
      rawAnswer,
      buildExpenseBudgetDeficitWarningText(context, updatedReview)
    );
  }

  if (review.stage === "ask_adjust_expense" || review.stage === "ask_change_or_save_deficit") {
    if (wantsExpenseBudgetEdit(rawAnswer)) {
      const nextReview = { ...review, stage: "ask_expense_category" as const };
      return saveExpenseBudgetDeficitReviewReply(
        context,
        prompt,
        pendingConfirmation,
        nextReview,
        rawAnswer,
        buildExpenseBudgetEditCategoryQuestionText(nextReview)
      );
    }

    if (wantsDeficitBudgetSave(rawAnswer) || parseBooleanAnswer(rawAnswer) === false) {
      return saveExpenseBudgetDeficitReviewReply(
        context,
        prompt,
        pendingConfirmation,
        { ...review, stage: "confirm_deficit_save" },
        rawAnswer,
        buildExpenseBudgetDeficitSaveConfirmationText(context, review)
      );
    }

    return buildReplyResult(
      [
        review.stage === "ask_adjust_expense"
          ? buildExpenseBudgetAdjustQuestionText()
          : buildExpenseBudgetChangeOrDeficitText(context, review)
      ],
      createState({ user: context.user, prompt })
    );
  }

  if (review.stage === "ask_expense_category") {
    const editableItems = getExpenseBudgetEditableItems(review);
    const selectedItem = parseExpenseBudgetEditableSelection(rawAnswer, editableItems);
    if (!selectedItem) {
      return buildReplyResult(
        [buildExpenseBudgetEditCategoryQuestionText(review)],
        createState({ user: context.user, prompt })
      );
    }

    return saveExpenseBudgetDeficitReviewReply(
      context,
      prompt,
      pendingConfirmation,
      {
        ...review,
        editingItemId: selectedItem.id,
        stage: "ask_expense_amount"
      },
      rawAnswer,
      `Nominal baru untuk ${selectedItem.label} berapa per bulan Boss?`
    );
  }

  if (review.stage === "ask_expense_amount") {
    const amount = parseMoneyInput(rawAnswer);
    const selectedItem = getExpenseBudgetEditableItems(review).find(
      (item) => item.id === review.editingItemId
    );
    if (!selectedItem || amount === null || amount < 0) {
      return buildReplyResult(
        ["Nominal barunya belum valid. Coba kirim angka rupiah ya Boss."],
        createState({ user: context.user, prompt })
      );
    }

    const updatedReview = applyExpenseBudgetItemAmount(review, selectedItem, amount);
    const updatedPlan = {
      breakdown: updatedReview.breakdown,
      customExpenseItems: updatedReview.customExpenseItems
    };
    if (getExpenseBudgetDeficitAmount(context, updatedPlan, updatedReview) <= 0) {
      return saveExpenseBudgetDeficitReviewReply(
        context,
        prompt,
        pendingConfirmation,
        { ...updatedReview, stage: "confirm_save" },
        rawAnswer,
        buildExpenseBudgetFinalSaveConfirmationText(context, updatedReview)
      );
    }

    return saveExpenseBudgetDeficitReviewReply(
      context,
      prompt,
      pendingConfirmation,
      { ...updatedReview, stage: "ask_change_or_save_deficit" },
      rawAnswer,
      buildExpenseBudgetChangeOrDeficitText(context, updatedReview)
    );
  }

  if (review.stage === "confirm_deficit_save") {
    if (wantsExpenseBudgetEdit(rawAnswer)) {
      const nextReview = { ...review, stage: "ask_expense_category" as const };
      return saveExpenseBudgetDeficitReviewReply(
        context,
        prompt,
        pendingConfirmation,
        nextReview,
        rawAnswer,
        buildExpenseBudgetEditCategoryQuestionText(nextReview)
      );
    }

    if (!wantsDeficitBudgetSave(rawAnswer)) {
      return buildReplyResult(
        [buildExpenseBudgetDeficitSaveConfirmationText(context, review)],
        createState({ user: context.user, prompt })
      );
    }

    return completePendingConfirmation({
      context,
      pendingConfirmation,
      normalizedAnswerOverride: {
        ...review,
        deficitSaveApproved: true
      },
      rawAnswerOverride: rawAnswer,
      prefixTexts: ["Saya simpan sebagai budget defisit sesuai konfirmasi Boss."]
    });
  }

  if (review.stage === "confirm_save") {
    if (wantsExpenseBudgetEdit(rawAnswer)) {
      const nextReview = { ...review, stage: "ask_expense_category" as const };
      return saveExpenseBudgetDeficitReviewReply(
        context,
        prompt,
        pendingConfirmation,
        nextReview,
        rawAnswer,
        buildExpenseBudgetEditCategoryQuestionText(nextReview)
      );
    }

    if (!wantsRegularBudgetSave(rawAnswer)) {
      return buildReplyResult(
        [buildExpenseBudgetFinalSaveConfirmationText(context, review)],
        createState({ user: context.user, prompt })
      );
    }

    return completePendingConfirmation({
      context,
      pendingConfirmation,
      normalizedAnswerOverride: review,
      rawAnswerOverride: rawAnswer,
      prefixTexts: ["Oke, budget saya simpan."]
    });
  }

  return buildReplyResult(
    [buildExpenseBudgetDeficitWarningText(context, review)],
    createState({ user: context.user, prompt })
  );
};

const handleManualExpensePendingConfirmation = async (
  context: RuntimeContext,
  prompt: OnboardingPrompt,
  pendingConfirmation: OnboardingSession,
  rawAnswer: unknown
): Promise<OnboardingResult> => {
  const currentManualAnswer = isManualExpenseConfirmationAnswer(
    pendingConfirmation.normalizedAnswerJson as SessionAnswerValue
  )
    ? (pendingConfirmation.normalizedAnswerJson as ManualExpenseConfirmationAnswer)
    : null;

  if (currentManualAnswer?.mergePromptBucket) {
    const currentCandidate =
      getManualExpenseMergeCandidates(currentManualAnswer).find(
        (candidate) => candidate.bucket === currentManualAnswer.mergePromptBucket
      ) ?? null;
    const decision = parseManualExpenseMergeDecision(rawAnswer);

    if (!currentCandidate) {
      const clearedAnswer: ManualExpenseConfirmationAnswer = {
        ...currentManualAnswer,
        mergePromptBucket: null
      };
      return completePendingConfirmation({
        context,
        pendingConfirmation,
        normalizedAnswerOverride: clearedAnswer,
        rawAnswerOverride: rawAnswer,
        prefixTexts: ["Siap, saya pakai pengaturan kategori ini."]
      });
    }

    if (!decision) {
      return buildReplyResult(
        [
          `Untuk kategori ${currentCandidate.label}, balas \`gabung\` kalau mau dijadikan satu atau \`pisah\` kalau mau tetap kategori masing-masing ya Boss.`
        ],
        createState({ user: context.user, prompt })
      );
    }

    const updatedAnswer: ManualExpenseConfirmationAnswer = {
      ...currentManualAnswer,
      mergeDecisions: {
        ...currentManualAnswer.mergeDecisions,
        [currentCandidate.bucket]: decision
      },
      mergePromptBucket: null
    };
    const nextCandidate = getNextManualExpenseMergeCandidate(updatedAnswer);

    if (nextCandidate) {
      return requestManualExpenseMergeConfirmation(
        context,
        prompt,
        pendingConfirmation,
        updatedAnswer,
        rawAnswer,
        nextCandidate
      );
    }

    return requestManualExpenseFinalReview(
      context,
      prompt,
      pendingConfirmation,
      updatedAnswer,
      rawAnswer
    );
  }

  if (currentManualAnswer?.reviewReady) {
    const addMoreAnswer = parseAddMoreAnswer(rawAnswer);
    if (addMoreAnswer === false || isPositiveAnswerConfirmation(rawAnswer)) {
      return continueFromConfirmedAnswer(context, pendingConfirmation);
    }

    if (addMoreAnswer === true) {
      const collectingAnswer: ManualExpenseConfirmationAnswer = {
        ...currentManualAnswer,
        mergeDecisions: {},
        mergePromptBucket: null,
        reviewReady: false
      };
      await saveSessionAnswer({
        userId: context.user.id,
        stepKey: context.user.onboardingStep,
        questionKey: prompt.questionKey,
        rawAnswer,
        normalizedAnswer: collectingAnswer,
        isCompleted: false,
        replaceSessionId: pendingConfirmation.id
      });
      return buildManualExpenseAddMorePromptReply(prompt, context);
    }
  }

  if (isManualExpenseHelpRequest(rawAnswer)) {
    await invalidatePendingConfirmation(pendingConfirmation.id);
    return routeManualExpenseToGuidedSetup(context);
  }

  const addMoreAnswer = parseAddMoreAnswer(rawAnswer);
  if (addMoreAnswer === false || isPositiveAnswerConfirmation(rawAnswer)) {
    if (currentManualAnswer) {
      const nextCandidate = getNextManualExpenseMergeCandidate(currentManualAnswer);
      if (nextCandidate) {
        return requestManualExpenseMergeConfirmation(
          context,
          prompt,
          pendingConfirmation,
          currentManualAnswer,
          rawAnswer,
          nextCandidate
        );
      }

      return requestManualExpenseFinalReview(
        context,
        prompt,
        pendingConfirmation,
        currentManualAnswer,
        rawAnswer
      );
    }

    return continueFromConfirmedAnswer(context, pendingConfirmation);
  }

  if (typeof rawAnswer === "string" && isManualExpenseBreakdownTooGeneric(rawAnswer)) {
    return buildManualExpenseTooGenericReply(prompt, rawAnswer);
  }

  const additionalDetails =
    typeof rawAnswer === "string" ? parseManualExpenseBreakdownDetails(rawAnswer) : [];
  const parsedAdditional = buildExpenseBreakdownFromDetails(additionalDetails);

  if (additionalDetails.length && parseManualBreakdownTotal(parsedAdditional) !== null) {
    const additionalAnswer = buildManualExpenseConfirmationAnswer(additionalDetails);
    const merged =
      currentManualAnswer !== null
        ? mergeManualExpenseAnswers(currentManualAnswer, additionalAnswer)
        : additionalAnswer;
    return requestAnswerConfirmation(context, merged, rawAnswer, pendingConfirmation);
  }

  if (addMoreAnswer === true) {
    return buildManualExpenseAddMorePromptReply(prompt, context);
  }

  return buildPendingConfirmationReminder(
    context,
    prompt,
    context.user.onboardingStep,
    pendingConfirmation
  );
};

const advanceOnboarding = async (user: User, rawAnswer: unknown): Promise<OnboardingResult> => {
  const initialStep = user.onboardingStep;
  const currentUser = await migrateLegacyGoalDecisionStepIfNeeded(user);
  if (currentUser.onboardingStep === OnboardingStep.SHOW_ANALYSIS) {
    const state = await finalizeOnboarding(currentUser.id);
    const replyTexts = buildCompletedReplyTexts(state);
    return buildReplyResult(replyTexts, state, {
      preserveReplyTextBubbles: replyTexts.length > 1
    });
  }
  const context = await buildRuntimeContext(currentUser.id, currentUser);
  const prompt = resolvePrompt(context);
  if (
    initialStep === OnboardingStep.ASK_PERSONALIZATION_CHOICE &&
    currentUser.onboardingStep !== OnboardingStep.ASK_PERSONALIZATION_CHOICE
  ) {
    return buildPromptReplyResult(prompt, createState({ user: context.user, prompt }));
  }
  const pendingConfirmation = getPendingConfirmationSession(
    context.sessions,
    context.user.onboardingStep,
    prompt.questionKey
  );
  const pendingDeficitReview =
    pendingConfirmation &&
    isExpenseBudgetDeficitReviewAnswer(
      pendingConfirmation.normalizedAnswerJson as SessionAnswerValue
    )
      ? (pendingConfirmation.normalizedAnswerJson as ExpenseBudgetDeficitReviewAnswer)
      : null;

  if (pendingConfirmation && pendingDeficitReview) {
    return handleExpenseBudgetDeficitPendingConfirmation(
      context,
      prompt,
      pendingConfirmation,
      pendingDeficitReview,
      rawAnswer
    );
  }

  if (
    pendingConfirmation &&
    context.user.onboardingStep === OnboardingStep.ASK_GOAL_TARGET_DATE
  ) {
    const decision = parseGoalTargetPendingDecision(context, pendingConfirmation, rawAnswer);

    if (decision.kind === "confirm_original") {
      const pendingTargetAnswer =
        getStoredGoalTargetSessionAnswer(pendingConfirmation.normalizedAnswerJson)?.target ??
        (pendingConfirmation.normalizedAnswerJson as MonthYearTargetAnswer);
      return completePendingConfirmation({
        context,
        pendingConfirmation,
        normalizedAnswerOverride: pendingTargetAnswer,
        prefixTexts: ["Oke, saya lanjut dari sini."]
      });
    }

    if (decision.kind === "confirm_ai_suggestion") {
      const summary = buildGoalTargetConfirmationSummary(context, decision.target);
      const acceptedLines = buildGoalTargetOverrideAcceptedTexts(context, decision.target);
      acceptedLines[0] = `Oke, saya pakai saran ${decision.target.label} untuk ${summary.goalName}.`;
      return completePendingConfirmation({
        context,
        pendingConfirmation,
        normalizedAnswerOverride: decision.target,
        rawAnswerOverride: rawAnswer,
        prefixTexts: acceptedLines
      });
    }

    if (decision.kind === "confirm_custom_date") {
      return completePendingConfirmation({
        context,
        pendingConfirmation,
        normalizedAnswerOverride: decision.target,
        rawAnswerOverride: rawAnswer,
        prefixTexts: buildGoalTargetOverrideAcceptedTexts(context, decision.target)
      });
    }

    if (decision.kind === "request_custom_date") {
      return buildMessageWithPromptReply(
        prompt,
        ["Siap, kirim bulan dan tahun baru yang Boss mau ya. Contohnya `06/2032` atau `Juni 2032`."],
        createState({ user: context.user, prompt })
      );
    }

    if (decision.kind === "restart_amount") {
      await invalidatePendingConfirmation(pendingConfirmation.id);
      await deleteLatestConfirmedSessionForQuestion(
        context.user.id,
        OnboardingQuestionKey.GOAL_TARGET_AMOUNT
      );
      const rewoundUser = await moveToStep(context.user.id, OnboardingStep.ASK_GOAL_TARGET_AMOUNT);
      const rewoundContext = await buildRuntimeContext(context.user.id, rewoundUser);
      const rewoundPrompt = resolvePrompt(rewoundContext);

      return buildMessageWithPromptReply(
        rewoundPrompt,
        ["Oke, saya ulang dari nominal targetnya dulu ya."],
        createState({ user: rewoundUser, prompt: rewoundPrompt })
      );
    }

    return buildPendingConfirmationReminder(
      context,
      prompt,
      context.user.onboardingStep,
      pendingConfirmation
    );
  }

  if (
    pendingConfirmation &&
    context.user.onboardingStep === OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN
  ) {
    return handleManualExpensePendingConfirmation(
      context,
      prompt,
      pendingConfirmation,
      rawAnswer
    );
  }

  if (pendingConfirmation && isPositiveAnswerConfirmation(rawAnswer)) {
    return continueFromConfirmedAnswer(context, pendingConfirmation);
  }

  if (pendingConfirmation && isNegativeAnswerConfirmation(rawAnswer)) {
    await invalidatePendingConfirmation(pendingConfirmation.id);

    if (context.user.onboardingStep === OnboardingStep.ASK_GOAL_TARGET_DATE) {
      await deleteLatestConfirmedSessionForQuestion(
        context.user.id,
        OnboardingQuestionKey.GOAL_TARGET_AMOUNT
      );
      const rewoundUser = await moveToStep(context.user.id, OnboardingStep.ASK_GOAL_TARGET_AMOUNT);
      const rewoundContext = await buildRuntimeContext(context.user.id, rewoundUser);
      const rewoundPrompt = resolvePrompt(rewoundContext);

      return buildMessageWithPromptReply(
        rewoundPrompt,
        ["Oke, saya ulang dari nominal targetnya dulu ya."],
        createState({ user: rewoundUser, prompt: rewoundPrompt })
      );
    }

    return buildMessageWithPromptReply(
      prompt,
      ["Siap Boss, jawab ulang pertanyaan yang ini ya."],
      createState({ user: context.user, prompt })
    );
  }

  if (pendingConfirmation) {
    return buildPendingConfirmationReminder(
      context,
      prompt,
      context.user.onboardingStep,
      pendingConfirmation
    );
  }

  if (
    context.user.onboardingStep === OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN &&
    isManualExpenseHelpRequest(rawAnswer)
  ) {
    return routeManualExpenseToGuidedSetup(context);
  }

  if (isClarificationInsteadOfAnswer(rawAnswer) || isOptionExplanationQuestion(prompt, rawAnswer)) {
    return buildClarificationReply(prompt, rawAnswer);
  }

  const initialValidation = validateAnswerForStep(context, rawAnswer);
  if (!("handled" in initialValidation)) {
    if (shouldSkipAnswerConfirmation(context.user.onboardingStep)) {
      return continueWithoutConfirmation(context, initialValidation.value, rawAnswer);
    }
    return requestAnswerConfirmation(context, initialValidation.value, rawAnswer, pendingConfirmation);
  }

  return pendingConfirmation
    ? buildPendingConfirmationReminder(
        context,
        prompt,
        context.user.onboardingStep,
        pendingConfirmation
      )
    : initialValidation;
};

export const getOnboardingState = async (params: { userId: string }): Promise<OnboardingState> => {
  const existingUser = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!existingUser) throw new Error("User not found");
  const user = await migrateLegacyGoalDecisionStepIfNeeded(existingUser);
  if (user.onboardingStep === OnboardingStep.SHOW_ANALYSIS) {
    return finalizeOnboarding(user.id);
  }
  const context = await buildRuntimeContext(params.userId, user);
  if (context.user.onboardingStatus === OnboardingStatus.COMPLETED) {
    const [analysisText, timelineReplyTexts] = await Promise.all([
      context.user.analysisReady ? buildSafeCompletedAnalysisText(params.userId) : Promise.resolve(null),
      buildSafeCompletedTimelineReplyTexts(params.userId)
    ]);
    const timelineText = timelineReplyTexts?.join("\n\n").trim() ?? null;
    return createState({ user: context.user, prompt: null, analysisText, timelineText, timelineReplyTexts });
  }
  const prompt = resolvePrompt(context);
  return createState({ user: context.user, prompt });
};

export const submitOnboardingAnswer = async (params: { userId: string; answer: unknown }) => {
  const user = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!user) throw new Error("User not found");
  const result = await advanceOnboarding(user, params.answer);
  if (!result.state) throw new Error("Onboarding state not available");
  return result.state;
};

export const completeOnboarding = async (userId: string) => finalizeOnboarding(userId);

export const handleOnboarding = async (params: {
  user: User;
  isNew: boolean;
  messageId?: string;
  messageType: "TEXT" | "IMAGE";
  text: string | undefined;
  phoneInput?: string;
  phoneInputRegistered?: boolean;
}): Promise<OnboardingResult> => {
  if (params.user.onboardingStatus === OnboardingStatus.COMPLETED || params.user.registrationStatus === RegistrationStatus.COMPLETED) {
    const rawText = (params.text ?? "").trim();
    if (params.messageType === "TEXT" && rawText && isTimelineRequest(rawText)) {
      const timelineReplyTexts = await buildSafeCompletedTimelineReplyTexts(params.user.id);
      if (timelineReplyTexts?.length) {
        const timelineText = timelineReplyTexts.join("\n\n").trim();
        return buildReplyResult(
          timelineReplyTexts,
          createState({ user: params.user, prompt: null, timelineText, timelineReplyTexts }),
          { preserveReplyTextBubbles: true }
        );
      }
    }
    return { handled: false, replyText: "" };
  }

  const initialStep = params.user.onboardingStep;
  const currentUser = await migrateLegacyGoalDecisionStepIfNeeded(params.user);
  if (currentUser.onboardingStep === OnboardingStep.SHOW_ANALYSIS) {
    const state = await finalizeOnboarding(currentUser.id);
    const replyTexts = buildCompletedReplyTexts(state);
    return buildReplyResult(replyTexts, state, {
      preserveReplyTextBubbles: replyTexts.length > 1
    });
  }
  const context = await buildRuntimeContext(currentUser.id, currentUser);
  const prompt = resolvePrompt(context);
  if (
    initialStep === OnboardingStep.ASK_PERSONALIZATION_CHOICE &&
    currentUser.onboardingStep !== OnboardingStep.ASK_PERSONALIZATION_CHOICE
  ) {
    return buildPromptReplyResult(prompt, createState({ user: context.user, prompt }));
  }
  if (params.messageType !== "TEXT") {
    return buildMessageWithPromptReply(
      prompt,
      ["Onboarding awal hanya bisa via teks ya Boss."],
      createState({ user: context.user, prompt })
    );
  }

  const rawText = (params.text ?? "").trim();
  if (!rawText) {
    return buildPromptReplyResult(prompt, createState({ user: context.user, prompt }));
  }

  if (isTimelineRequest(rawText)) {
    const timelineReplyTexts = await buildSafeCompletedTimelineReplyTexts(context.user.id);
    if (timelineReplyTexts?.length) {
      const timelineText = timelineReplyTexts.join("\n\n").trim();
      return buildReplyResult(
        [...timelineReplyTexts, ...getPromptReplyTexts(prompt)],
        createState({ user: context.user, prompt, timelineText, timelineReplyTexts }),
        { preserveReplyTextBubbles: true }
      );
    }
  }

  if (context.user.onboardingStep === OnboardingStep.VERIFY_PHONE && params.phoneInputRegistered === false) {
    return buildValidationReply(prompt, "Nomor tersebut tidak terdaftar di WhatsApp.");
  }

  if (context.user.onboardingStep === OnboardingStep.VERIFY_PHONE && params.phoneInputRegistered === true && params.phoneInput) {
    return advanceOnboarding(context.user, params.phoneInput);
  }

  if (rawText.startsWith("/") && !isReadyCommand(rawText)) {
    return buildMessageWithPromptReply(
      prompt,
      ["Perintah belum bisa dipakai sebelum onboarding selesai."],
      createState({ user: context.user, prompt })
    );
  }

  if (
    params.isNew &&
    context.user.onboardingStatus === OnboardingStatus.NOT_STARTED &&
    context.user.onboardingStep === OnboardingStep.WAIT_REGISTER
  ) {
    if (isReadyCommand(rawText)) {
      return advanceOnboarding(context.user, rawText);
    }
    return buildPromptReplyResult(prompt, createState({ user: context.user, prompt }));
  }

  return advanceOnboarding(context.user, rawText);
};
