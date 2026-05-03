import {
  AssetType,
  BudgetMode,
  ExpensePlanSource,
  FinancialGoalStatus,
  FinancialGoalType,
  GoalExecutionMode,
  GoalCalculationType,
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
  GOLD_BRAND_OPTIONS,
  GOLD_KARAT_OPTIONS,
  GOLD_PLATFORM_OPTIONS,
  GOLD_TYPE_OPTIONS,
  formatPromptForChatBubbles,
  formatPromptForChat,
  getNextOnboardingStep,
  getPromptForStep,
  GOAL_ALLOCATION_MODE_OPTIONS,
  GOAL_NONE_VALUE,
  GOAL_EXPENSE_STRATEGY_OPTIONS,
  GOAL_OPTIONS,
  BUDGET_MODE_OPTIONS,
  EMPLOYMENT_OPTIONS,
  type GoldAssetBrandValue,
  type GoldAssetKaratValue,
  type GoldAssetPlatformValue,
  type GoldAssetTypeValue,
  type OnboardingPrompt,
  type OnboardingPromptContext
} from "@/lib/services/onboarding/onboarding-flow-service";
import {
  buildInitialFinancialProfile,
  buildOnboardingPlanningAnalysis,
  generateFinalTimelineCopy,
  generateShortTargetEvaluationCopy,
  evaluateTargetAgainstCurrentPlan,
  type OnboardingPlanningAnalysis,
  type PlanningGoalSummary,
  type TargetEvaluation,
  type TargetUserDecision,
  calculateFinancialFreedomPlan,
  calculateTargetFeasibility,
  buildFinancialFreedomAllocationPlan,
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
} from "@/lib/services/onboarding/onboarding-calculation-service";
import { activateSubscription } from "@/lib/services/payments/subscription-service";
import {
  getCurrentGoldType,
  getCurrentAssetType,
  getCurrentGoalType,
  getEmploymentTypes,
  type FinancialFreedomPlanningAnswer,
  type FinancialFreedomTargetAnswer,
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
  parseAssetSelections,
  parseAssetSelectionConflict,
  parseBooleanAnswer,
  parseBudgetMode,
  parseDayOfMonth,
  parseDecimalInputPreservingRange,
  parseAssetFreeText,
  parseFinancialFreedomPlanningAnswer,
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
  parseManualExpenseBreakdown,
  parseMonthYearInput,
  parseMoneyInput,
  parseMoneyInputPreservingRange,
  parseOptionalFinancialFreedomTarget,
  parsePhoneInput,
  parsePersonalizationChoice,
  parseStockSymbolInput,
  parseCryptoSymbolInput,
  parseMutualFundSymbolInput,
  parseEmploymentTypes,
  isStoredGoalPriorityOrderAnswer,
  isStoredGoalTargetAnswer,
  type StoredGoalPriorityOrderAnswer,
  type StoredGoalTargetAnswer,
  type MoneyRangeAnswer,
  type NumericRangeAnswer,
  type SessionAnswerValue
} from "@/lib/services/onboarding/onboarding-parser-service";
import { env } from "@/lib/env";
import {
  buildManualMutualFundSymbol,
  getMarketQuoteBySymbol,
  getMutualFundQuoteBySelection
} from "@/lib/services/market/market-price-service";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatPercent } from "@/lib/services/shared/money-format";

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
  paymentLink?: string | null;
};

type RuntimeContext = OnboardingPromptContext & {
  user: User;
  sessions: OnboardingSession[];
  monthlyExpenseTotal: number | null;
  potentialMonthlySaving: number | null;
  emergencyFundTargetAmount: number | null;
  financialFreedomTargetAmount: number | null;
  financialFreedomSafeMonthlyWithdrawal: number | null;
  activeGoals: Array<{
    goalType: FinancialGoalType;
    goalName: string;
    targetAmount: number | null;
    targetMonth: number | null;
    targetYear: number | null;
    status: FinancialGoalStatus;
    priorityOrder?: number | null;
  }>;
};

const GUIDED_EXPENSE_SUMMARY_BUCKETS: Array<{
  questionKey: OnboardingQuestionKey;
  label: string;
}> = [
  {
    questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_FOOD,
    label: "Makan & kebutuhan harian"
  },
  {
    questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_TRANSPORT,
    label: "Transport"
  },
  {
    questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_BILLS,
    label: "Tagihan & kewajiban rutin"
  },
  {
    questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_ENTERTAINMENT,
    label: "Hiburan & lifestyle"
  }
];

const getOnboardingSessionModel = () => (prisma as { onboardingSession?: any }).onboardingSession;
const getFinancialProfileModel = () => (prisma as { financialProfile?: any }).financialProfile;
const getExpensePlanModel = () => (prisma as { expensePlan?: any }).expensePlan;
const getFinancialGoalModel = () => (prisma as { financialGoal?: any }).financialGoal;
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
  OnboardingQuestionKey.ASSET_CRYPTO_SYMBOL,
  OnboardingQuestionKey.ASSET_CRYPTO_QUANTITY,
  OnboardingQuestionKey.ASSET_MUTUAL_FUND_SYMBOL,
  OnboardingQuestionKey.ASSET_MUTUAL_FUND_UNITS,
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
  paymentLink?: string | null;
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
  paymentLink: params.paymentLink ?? null
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

const hasWholePhrase = (text: string, phrase: string) =>
  text === phrase ||
  text.startsWith(`${phrase} `) ||
  text.endsWith(` ${phrase}`) ||
  text.includes(` ${phrase} `);

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

type AssetValuationSource = "MARKET_LIVE" | "NAV_DELAYED" | "MANUAL_USER";
type OnboardingStepRedirect = {
  step: OnboardingStep;
  message: string;
};

const buildOnboardingAssetError = (message: string) =>
  new Error(`${ONBOARDING_ASSET_ERROR_PREFIX}${message}`);

const buildOnboardingStepRedirectError = (payload: OnboardingStepRedirect) =>
  new Error(`${ONBOARDING_STEP_REDIRECT_PREFIX}${JSON.stringify(payload)}`);

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

const buildGuidedExpenseSummaryItems = (
  sessions: OnboardingSession[],
  guidedOtherItems: Array<{ label: string; amount: number }>
) => {
  const guidedCoreItems = GUIDED_EXPENSE_SUMMARY_BUCKETS.map((bucket) => ({
    label: bucket.label,
    amount: getSessionNormalizedValue<number>(
      latestSessionForQuestion(sessions, bucket.questionKey)
    ) ?? 0
  })).filter((item) => item.amount > 0);

  return [
    ...guidedCoreItems,
    ...guidedOtherItems.filter((item) => Number.isFinite(item.amount) && item.amount > 0)
  ];
};

const formatGuidedExpenseSummaryText = (
  items: Array<{ label: string; amount: number }>,
  totals?: {
    monthlyExpenseTotal?: number | null;
    potentialMonthlySaving?: number | null;
  }
) => {
  if (!items.length) return null;

  const resolvedMonthlyExpenseTotal =
    totals?.monthlyExpenseTotal ??
    items.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0);
  const lines = [
    "Berikut kategori pengeluarannya:",
    ...items.map((item) => `- ${item.label}: ${formatMoney(item.amount)}/bulan`)
  ];

  if (resolvedMonthlyExpenseTotal > 0) {
    lines.push("");
    lines.push(`Total pengeluaran: ${formatMoney(resolvedMonthlyExpenseTotal)}/bulan`);
  }

  if (totals?.potentialMonthlySaving !== null && totals?.potentialMonthlySaving !== undefined) {
    if (totals.potentialMonthlySaving >= 0) {
      lines.push(`Sisa dari income: ${formatMoney(totals.potentialMonthlySaving)}/bulan`);
    } else {
      lines.push(`Masih tekor dari income: ${formatMoney(Math.abs(totals.potentialMonthlySaving))}/bulan`);
    }
  }

  return lines.join("\n");
};

const getAssetTransitionLeadText = () =>
  "Sip, gambaran pengeluaran bulanannya sudah kebaca. Sekarang saya cek aset yang sudah jalan ya Boss.";

const EXPENSE_TO_ASSET_TRANSITION_STEPS = new Set<OnboardingStep>([
  OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN,
  OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS,
  OnboardingStep.ASK_GOAL_EXPENSE_TOTAL
]);

const shouldSeparateNextPromptBubble = (
  currentStep: OnboardingStep,
  nextStep: OnboardingStep
) => nextStep === OnboardingStep.ASK_ASSET_SELECTION && EXPENSE_TO_ASSET_TRANSITION_STEPS.has(currentStep);

const formatMoneyRange = (value: MoneyRangeAnswer) =>
  `${formatMoney(value.low)} sampai ${formatMoney(value.high)}`;

const formatQuantityValue = (value: number) => {
  if (!Number.isFinite(value)) return String(value);
  const formatted = value.toFixed(8).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  return formatted === "-0" ? "0" : formatted;
};

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

const getGoldTypeLabel = (value: GoldAssetTypeValue | null | undefined) =>
  value ? findOptionLabel(GOLD_TYPE_OPTIONS, value) : "Emas";

const getGoldBrandLabel = (value: GoldAssetBrandValue | null | undefined) =>
  value ? findOptionLabel(GOLD_BRAND_OPTIONS, value) : "Lainnya";

const getGoldKaratLabel = (value: GoldAssetKaratValue | null | undefined) =>
  value ? findOptionLabel(GOLD_KARAT_OPTIONS, value) : "24K";

const getGoldPlatformLabel = (value: GoldAssetPlatformValue | null | undefined) =>
  value ? findOptionLabel(GOLD_PLATFORM_OPTIONS, value) : "Lainnya";

const getGoldPurityMultiplier = (value: GoldAssetKaratValue | null | undefined) => {
  switch (value) {
    case "24K":
      return 1;
    case "23K":
      return 23 / 24;
    case "22K":
      return 22 / 24;
    case "18K":
      return 18 / 24;
    case "17K":
      return 17 / 24;
    default:
      return 1;
  }
};

const buildGoldAssetName = (context: RuntimeContext) => {
  const goldType = context.currentGoldType ?? getLatestAnswerValue<GoldAssetTypeValue>(context, OnboardingQuestionKey.ASSET_GOLD_TYPE);
  if (goldType === "BULLION") {
    const brand = getLatestAnswerValue<GoldAssetBrandValue>(context, OnboardingQuestionKey.ASSET_GOLD_BRAND);
    return `Emas batangan ${getGoldBrandLabel(brand)}`;
  }
  if (goldType === "JEWELRY") {
    const karat = getLatestAnswerValue<GoldAssetKaratValue>(context, OnboardingQuestionKey.ASSET_GOLD_KARAT);
    return `Perhiasan emas ${getGoldKaratLabel(karat)}`;
  }
  if (goldType === "DIGITAL") {
    const platform = getLatestAnswerValue<GoldAssetPlatformValue>(context, OnboardingQuestionKey.ASSET_GOLD_PLATFORM);
    return `Emas digital ${getGoldPlatformLabel(platform)}`;
  }
  return "Emas";
};

const stringifyAssetNotes = (payload: Record<string, unknown>) => JSON.stringify(payload);

const buildAssetValuationNotes = (
  valuationSource: AssetValuationSource,
  payload: Record<string, unknown> = {}
) =>
  stringifyAssetNotes({
    source: "onboarding",
    valuationSource,
    ...payload
  });

const getConfirmedSessions = (sessions: OnboardingSession[]) =>
  sessions.filter((session) => session.isCompleted === true);

const getCurrentAssetBatchSessions = (sessions: OnboardingSession[]) => {
  const confirmedSessions = getConfirmedSessions(sessions);
  const latestSelection = [...confirmedSessions]
    .reverse()
    .find((session) => session.questionKey === OnboardingQuestionKey.ASSET_SELECTION);

  if (!latestSelection) return confirmedSessions;

  const latestSelectionIndex = confirmedSessions.findIndex((session) => session.id === latestSelection.id);
  return latestSelectionIndex >= 0 ? confirmedSessions.slice(latestSelectionIndex) : confirmedSessions;
};

const getCurrentBatchAnswerValue = <T>(
  sessions: OnboardingSession[],
  questionKey: OnboardingQuestionKey
) => getSessionNormalizedValue<T>(latestSessionForQuestion(getCurrentAssetBatchSessions(sessions), questionKey));

const shouldAskManualMutualFundEstimatedValue = (
  context: Pick<RuntimeContext, "user" | "currentAssetType" | "hasCurrentMutualFundUnits">
) =>
  context.user.onboardingStep === OnboardingStep.ASK_ASSET_ESTIMATED_VALUE &&
  context.currentAssetType === AssetType.MUTUAL_FUND &&
  context.hasCurrentMutualFundUnits === true;

const formatCryptoQuantity = (value: number) => formatQuantityValue(value);

const isFinalAssetStep = (context: RuntimeContext) => {
  if (context.user.onboardingStep === OnboardingStep.ASK_ASSET_SAVINGS_BALANCE) return true;
  if (context.user.onboardingStep === OnboardingStep.ASK_ASSET_STOCK_LOTS) return true;
  if (context.user.onboardingStep === OnboardingStep.ASK_ASSET_CRYPTO_QUANTITY) return true;
  if (context.user.onboardingStep === OnboardingStep.ASK_ASSET_MUTUAL_FUND_UNITS) return true;
  if (context.user.onboardingStep === OnboardingStep.ASK_ASSET_PROPERTY_ESTIMATED_VALUE) return true;
  if (
    context.user.onboardingStep === OnboardingStep.ASK_ASSET_ESTIMATED_VALUE &&
    (context.currentAssetType === AssetType.SAVINGS ||
      context.currentAssetType === AssetType.STOCK ||
      context.currentAssetType === AssetType.CRYPTO ||
      context.currentAssetType === AssetType.MUTUAL_FUND ||
      context.currentAssetType === AssetType.PROPERTY)
  ) {
    return true;
  }
  if (context.user.onboardingStep === OnboardingStep.ASK_ASSET_GOLD_KARAT) return true;
  if (context.user.onboardingStep === OnboardingStep.ASK_ASSET_GOLD_PLATFORM) return true;
  return (
    context.user.onboardingStep === OnboardingStep.ASK_ASSET_GOLD_GRAMS &&
    context.currentGoldType === "BULLION"
  );
};

const hasTruthyPhrase = (text: string, phrases: string[]) =>
  phrases.some((phrase) => {
    const normalizedPhrase = phrase.toLowerCase();
    return hasWholePhrase(text, normalizedPhrase);
  });

const hasAnyWholePhrase = (text: string, phrases: string[]) =>
  phrases.some((phrase) => hasWholePhrase(text, phrase));

const CONSULTATION_CLARIFICATION_PHRASES = [
  "konsultasi",
  "konsultasi dulu",
  "mau konsultasi",
  "mau konsultasi dulu",
  "bisa konsultasi",
  "boleh konsultasi",
  "konsul",
  "curhat",
  "minta saran"
];

const CONFUSION_CLARIFICATION_PHRASES = [
  "bingung",
  "masih bingung",
  "bingung saya",
  "belum ngerti",
  "ga ngerti",
  "gak ngerti",
  "nggak ngerti",
  "tidak ngerti",
  "belum paham",
  "ga paham",
  "gak paham",
  "nggak paham",
  "tidak paham",
  "belum nangkep",
  "kurang paham"
];

const FEATURE_CLARIFICATION_PHRASES = [
  "fiturnya apa",
  "fiturnya apa aja",
  "bisa apa",
  "bisa apa aja",
  "bot ini bisa apa",
  "ini buat apa",
  "fungsinya apa",
  "manfaatnya apa",
  "tujuannya apa",
  "buat ngapain",
  "ini gunanya apa",
  "bantu apa aja"
];

const DATA_PRIVACY_CLARIFICATION_PHRASES = [
  "data aman",
  "aman ga",
  "aman gak",
  "aman nggak",
  "aman engga",
  "privasi saya",
  "data saya aman",
  "data saya disimpan",
  "data disimpan",
  "akses rekening",
  "akses bank",
  "connect bank",
  "konek bank",
  "baca rekening",
  "baca transaksi",
  "ambil data rekening",
  "minta password",
  "password bank"
];

const PRICING_CLARIFICATION_PHRASES = [
  "ini bayar",
  "ini berbayar",
  "berbayar ga",
  "berbayar gak",
  "berbayar nggak",
  "berbayar engga",
  "bayar ga",
  "bayar gak",
  "bayar nggak",
  "harus bayar",
  "perlu bayar",
  "ini gratis",
  "gratis ga",
  "gratis gak",
  "gratis nggak",
  "gratis engga",
  "harganya berapa",
  "harga berapa",
  "berapa harganya",
  "biayanya berapa",
  "biaya berapa",
  "berapa biaya",
  "langganan berapa",
  "biaya langganan",
  "ada subscription",
  "pakai subscription"
];

const EDIT_LATER_CLARIFICATION_PHRASES = [
  "bisa diubah",
  "bisa diganti",
  "bisa edit",
  "ubah nanti",
  "ganti nanti",
  "nanti bisa ganti",
  "bisa ganti jawaban",
  "bisa revisi",
  "revisi nanti",
  "salah jawab",
  "kalau salah",
  "kalo salah",
  "nanti bisa edit"
];

const WHY_NEEDED_CLARIFICATION_PHRASES = [
  "kenapa harus",
  "kenapa perlu",
  "kenapa ditanya",
  "buat apa",
  "buat apa ditanya",
  "wajib ga",
  "wajib gak",
  "wajib nggak",
  "harus diisi",
  "wajib diisi",
  "perlu diisi",
  "harus jawab",
  "wajib jawab"
];

const SKIP_CLARIFICATION_PHRASES = [
  "bisa skip",
  "boleh skip",
  "skip bisa",
  "bisa lewati",
  "boleh lewati",
  "bisa kosong",
  "boleh kosong",
  "kosongin dulu",
  "diisi nanti",
  "isi nanti",
  "jawab nanti",
  "belum siap jawab"
];

const EXAMPLE_CLARIFICATION_PHRASES = [
  "contohnya apa",
  "kasih contoh",
  "contoh jawabannya",
  "contoh ngisinya",
  "contoh isi",
  "contoh format",
  "misalnya gimana",
  "misal gimana"
];

const ASK_QUESTION_CLARIFICATION_PHRASES = [
  "mau nanya",
  "mau nanya dulu",
  "nanya dulu",
  "nanya bentar",
  "tanya dulu",
  "tanya bentar",
  "bisa tanya dulu",
  "boleh tanya",
  "boleh nanya",
  "jelasin dulu",
  "bisa jelasin dulu",
  "maksudnya gimana",
  "maksudnya apa"
];

const OPTION_EXPLANATION_LEAD_PHRASES = [
  "apa bedanya",
  "bedanya apa",
  "maksudnya",
  "jelasin",
  "jelasin dong",
  "gimana",
  "gmn",
  "yang mana",
  "opsi mana",
  "pilihan mana"
];

const FORMAT_CLARIFICATION_PHRASES = [
  "cara jawab",
  "cara jawabnya",
  "jawabnya gimana",
  "jawabnya gmn",
  "formatnya gimana",
  "formatnya gmn",
  "format jawabannya",
  "formatnya apa",
  "balas apa",
  "isi apa",
  "cara isi",
  "cara ngisi",
  "tulisnya gimana",
  "pakai format apa",
  "harus angka",
  "jawab angka",
  "bisa pakai juta",
  "boleh pakai juta",
  "bisa pakai jt",
  "boleh pakai jt"
];

const ESTIMATE_CLARIFICATION_PHRASES = [
  "belum tahu jawabannya",
  "belum tau jawabannya",
  "belum tahu angkanya",
  "belum tau angkanya",
  "ga punya datanya",
  "gak punya datanya",
  "nggak punya datanya",
  "belum punya datanya",
  "lupa nominalnya",
  "harus akurat",
  "harus presisi",
  "boleh estimasi",
  "boleh perkiraan",
  "boleh kira kira",
  "kira kira boleh",
  "estimasi boleh",
  "perkiraan boleh"
];

const HELP_CHOOSE_CLARIFICATION_PHRASES = [
  "bisa bantu pilih",
  "bantu pilih",
  "pilihin dong",
  "pilih yang mana",
  "harus pilih apa",
  "bagus yang mana",
  "rekomendasi yang mana",
  "saran pilih",
  "mending pilih",
  "yang cocok yang mana"
];

const MULTI_SELECT_CLARIFICATION_PHRASES = [
  "bisa pilih lebih dari satu",
  "boleh pilih lebih dari satu",
  "pilih lebih dari satu",
  "bisa pilih beberapa",
  "boleh pilih beberapa",
  "pilih beberapa",
  "pilih multiple",
  "multiple boleh"
];

const DURATION_CLARIFICATION_PHRASES = [
  "berapa lama",
  "lama ga",
  "lama gak",
  "lama nggak",
  "prosesnya lama",
  "onboarding lama",
  "setup lama"
];

const CHANNEL_CLARIFICATION_PHRASES = [
  "harus install app",
  "perlu install app",
  "ada aplikasinya",
  "bisa lewat voice",
  "bisa vn",
  "bisa voice note",
  "bisa kirim foto",
  "bisa pakai foto",
  "bisa upload"
];

const CLARIFICATION_PHRASES = [
  ...CONSULTATION_CLARIFICATION_PHRASES,
  ...CONFUSION_CLARIFICATION_PHRASES,
  ...FEATURE_CLARIFICATION_PHRASES,
  ...DATA_PRIVACY_CLARIFICATION_PHRASES,
  ...PRICING_CLARIFICATION_PHRASES,
  ...EDIT_LATER_CLARIFICATION_PHRASES,
  ...WHY_NEEDED_CLARIFICATION_PHRASES,
  ...SKIP_CLARIFICATION_PHRASES,
  ...EXAMPLE_CLARIFICATION_PHRASES,
  ...ASK_QUESTION_CLARIFICATION_PHRASES,
  ...FORMAT_CLARIFICATION_PHRASES,
  ...ESTIMATE_CLARIFICATION_PHRASES,
  ...HELP_CHOOSE_CLARIFICATION_PHRASES,
  ...MULTI_SELECT_CLARIFICATION_PHRASES,
  ...DURATION_CLARIFICATION_PHRASES,
  ...CHANNEL_CLARIFICATION_PHRASES
];

const promptAllowsSkip = (prompt?: OnboardingPrompt | null) =>
  Boolean(
    prompt?.allowSkip ||
      prompt?.options?.some((option) => {
        const normalizedLabel = normalizeText(option.label).toLowerCase();
        return option.value === "SKIP" || normalizedLabel.includes("lewati");
      })
  );

const isClarificationInsteadOfAnswer = (rawAnswer: unknown) => {
  if (typeof rawAnswer !== "string") return false;
  const normalized = normalizeText(rawAnswer)
    .toLowerCase()
    .replace(/[?!.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return false;

  return hasAnyWholePhrase(normalized, CLARIFICATION_PHRASES);
};

const getClarificationLeadText = (rawAnswer: unknown, prompt?: OnboardingPrompt) => {
  if (typeof rawAnswer !== "string") {
    return "Jawab dulu pertanyaan onboarding ini ya Boss.";
  }

  const normalized = normalizeText(rawAnswer)
    .toLowerCase()
    .replace(/[?!.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (hasAnyWholePhrase(normalized, CONSULTATION_CLARIFICATION_PHRASES)) {
    return "Bisa Boss. Supaya konsultasinya nanti nyambung dengan kondisi kamu, jawab dulu pertanyaan ini ya.";
  }

  if (hasAnyWholePhrase(normalized, CONFUSION_CLARIFICATION_PHRASES)) {
    return "Saya bantu pelan-pelan Boss. Untuk sekarang, pilih jawaban yang paling mendekati dulu ya.";
  }

  if (hasAnyWholePhrase(normalized, FEATURE_CLARIFICATION_PHRASES)) {
    return "Bisa Boss. Saya nanti bisa bantu catat transaksi, pantau aset, dan kasih insight. Untuk setup awal, jawab dulu pertanyaan ini ya.";
  }

  if (hasAnyWholePhrase(normalized, DATA_PRIVACY_CLARIFICATION_PHRASES)) {
    return "Pertanyaan soal data penting Boss. Saya jawab setelah setup awal ini, tapi untuk sekarang lanjutkan dulu pertanyaan berikut supaya profilnya kebentuk.";
  }

  if (hasAnyWholePhrase(normalized, PRICING_CLARIFICATION_PHRASES)) {
    return "Soal biaya bisa dibahas setelah setup awal Boss. Jawab dulu pertanyaan ini supaya saya bisa siapkan profil keuangannya.";
  }

  if (hasAnyWholePhrase(normalized, EDIT_LATER_CLARIFICATION_PHRASES)) {
    return "Bisa Boss, nanti datanya bisa diperbarui. Untuk sekarang jawab yang paling mendekati dulu ya.";
  }

  if (hasAnyWholePhrase(normalized, WHY_NEEDED_CLARIFICATION_PHRASES)) {
    return "Pertanyaan ini bantu saya kenal kondisi kamu dulu Boss, supaya arahan awalnya lebih pas. Jawab yang paling mendekati dulu ya.";
  }

  if (hasAnyWholePhrase(normalized, SKIP_CLARIFICATION_PHRASES)) {
    if (promptAllowsSkip(prompt)) {
      return "Bisa Boss, pertanyaan ini boleh dilewati dulu. Kalau mau lewati, balas `skip` atau `lewati` ya.";
    }
    return "Kalau belum yakin, pilih opsi yang paling mendekati dulu ya Boss. Kalau ada pilihan lewati, kamu juga bisa pilih itu.";
  }

  if (hasAnyWholePhrase(normalized, EXAMPLE_CLARIFICATION_PHRASES)) {
    return "Contohnya bisa lihat dari pilihan di bawah ini Boss. Pilih yang paling cocok dengan kondisi kamu.";
  }

  if (hasAnyWholePhrase(normalized, FORMAT_CLARIFICATION_PHRASES)) {
    if (prompt?.inputType === "money") {
      return "Jawabnya cukup pakai angka rupiah Boss. Singkatan seperti `2jt` juga bisa.";
    }
    if (prompt?.inputType === "integer" || prompt?.inputType === "decimal") {
      return "Jawabnya cukup pakai angka Boss. Nanti saya baca dan simpan sesuai pertanyaan ini.";
    }
    if (prompt?.options?.length) {
      return prompt.inputType === "multi_select"
        ? "Jawabnya boleh pilih satu atau beberapa opsi yang cocok Boss. Tulis angkanya atau nama opsinya juga bisa."
        : "Jawabnya cukup pilih salah satu opsi yang paling cocok Boss. Tulis angkanya atau nama opsinya juga bisa.";
    }
    return "Jawabnya cukup tulis singkat sesuai kondisi kamu Boss.";
  }

  if (hasAnyWholePhrase(normalized, ESTIMATE_CLARIFICATION_PHRASES)) {
    return "Belum harus presisi Boss. Pakai estimasi paling mendekati dulu, nanti datanya bisa diperbarui.";
  }

  if (hasAnyWholePhrase(normalized, HELP_CHOOSE_CLARIFICATION_PHRASES)) {
    return "Bisa saya bantu arahkan Boss. Untuk sekarang, pilih yang paling mendekati kondisi kamu dari opsi di bawah ini dulu ya.";
  }

  if (hasAnyWholePhrase(normalized, MULTI_SELECT_CLARIFICATION_PHRASES)) {
    if (prompt?.inputType === "multi_select") {
      return "Boleh Boss. Kalau ada beberapa yang cocok, tulis sekaligus saja dari pilihan di bawah ini.";
    }
    return "Untuk pertanyaan ini pilih satu jawaban yang paling cocok dulu ya Boss.";
  }

  if (hasAnyWholePhrase(normalized, DURATION_CLARIFICATION_PHRASES)) {
    return "Sebentar saja Boss. Saya butuh beberapa jawaban dasar dulu supaya profil awalnya kebentuk.";
  }

  if (hasAnyWholePhrase(normalized, CHANNEL_CLARIFICATION_PHRASES)) {
    return "Setup awal cukup lewat chat teks ini dulu Boss. Jawab pertanyaan berikut supaya profilnya kebentuk.";
  }

  if (
    hasAnyWholePhrase(normalized, [
      ...ASK_QUESTION_CLARIFICATION_PHRASES,
      ...OPTION_EXPLANATION_LEAD_PHRASES
    ])
  ) {
    return "Bisa Boss. Jawab dulu pertanyaan ini supaya saya punya konteks, setelah itu kamu bisa tanya lebih detail.";
  }

  return "Jawab dulu pertanyaan onboarding ini ya Boss.";
};

const buildClarificationReply = (prompt: OnboardingPrompt, rawAnswer: unknown): OnboardingResult =>
  buildMessageWithPromptReply(prompt, [getClarificationLeadText(rawAnswer, prompt)]);

const isOptionExplanationQuestion = (prompt: OnboardingPrompt, rawAnswer: unknown) => {
  if (typeof rawAnswer !== "string" || !prompt.options?.length) return false;

  const normalized = normalizeText(rawAnswer)
    .toLowerCase()
    .replace(/[?!.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return false;

  const explanationPhrases = [
    "apa bedanya",
    "bedanya apa",
    "maksudnya",
    "contohnya",
    "contoh jawabannya",
    "jelasin",
    "jelasin dong",
    "gimana",
    "gmn",
    "yang mana",
    "opsi mana",
    "pilihan mana"
  ];

  if (!explanationPhrases.some((phrase) => hasWholePhrase(normalized, phrase))) {
    return false;
  }

  const optionKeywords = prompt.options.flatMap((option) =>
    normalizeText(option.label)
      .toLowerCase()
      .split(" ")
      .filter((token) => token.length >= 4)
  );

  const optionReferenceDetected =
    normalized.includes("opsi") ||
    normalized.includes("pilihan") ||
    normalized.startsWith("yang ") ||
    normalized.includes(" yang ") ||
    /\b\d+\b/.test(normalized);

  return optionReferenceDetected || optionKeywords.some((token) => normalized.includes(token));
};

const isPositiveAnswerConfirmation = (rawAnswer: unknown) => {
  if (typeof rawAnswer !== "string") return false;
  const normalized = normalizeText(rawAnswer).toLowerCase();
  if (!normalized) return false;

  return hasTruthyPhrase(normalized, [
    "benar",
    "benerr",
    "benarrr",
    "bener",
    "bener banget",
    "betul",
    "betull",
    "bner",
    "bnr",
    "sudah",
    "udah",
    "sudah benar",
    "udah benar",
    "sudah pas",
    "udah pas",
    "pas",
    "cocok",
    "sip lanjut",
    "oke lanjut",
    "ok lanjut",
    "lanjut aja",
    "pakai ini",
    "pakai itu",
    "pakai yang ini",
    "pake ini",
    "pake itu",
    "pake yang ini",
    "tetap yang ini",
    "tetap target ini",
    "itu aja",
    "itu saja",
    "itu doang",
    "setuju",
    "confirmed",
    "confirm"
  ]);
};

const isNegativeAnswerConfirmation = (rawAnswer: unknown) => {
  if (typeof rawAnswer !== "string") return false;
  const normalized = normalizeText(rawAnswer).toLowerCase();
  if (!normalized) return false;

  return hasTruthyPhrase(normalized, [
    "salah",
    "salh",
    "slah",
    "sala",
    "slh",
    "ga",
    "gak",
    "nggak",
    "engga",
    "enggak",
    "bukan",
    "masih salah",
    "belum benar",
    "belum pas",
    "kurang pas",
    "belum cocok",
    "ubah lagi",
    "mau diubah",
    "masih mau diubah",
    "ganti lagi",
    "revisi",
    "geser lagi"
  ]);
};

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

const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta"
});

const getMonthYearLabelFromNow = (monthsFromNow: number) => {
  const now = new Date();
  const totalMonths = now.getUTCFullYear() * 12 + now.getUTCMonth() + Math.max(1, monthsFromNow);
  const year = Math.floor(totalMonths / 12);
  const monthIndex = totalMonths % 12;
  return MONTH_YEAR_FORMATTER.format(new Date(Date.UTC(year, monthIndex, 1, 12)));
};

const getFinancialFreedomEtaLabel = (monthsFromNow: number | null) => {
  if (monthsFromNow === null || !Number.isFinite(monthsFromNow)) return null;
  return getMonthYearLabelFromNow(Math.ceil(monthsFromNow));
};

type GoalTargetConfirmationSummary = {
  goalType: FinancialGoalType | null;
  goalName: string;
  targetAmount: number | null;
  targetAnswer: FinancialFreedomTargetAnswer;
  deadlineMissedBeforeStart: boolean;
  requiredMonthly: number | null;
  monthlySurplus: number;
  gap: number | null;
  realisticTargetLabel: string | null;
  suggestedTarget: FinancialFreedomTargetAnswer | null;
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

type GoalTargetPendingDecision =
  | { kind: "confirm_original" }
  | { kind: "confirm_ai_suggestion"; target: FinancialFreedomTargetAnswer }
  | { kind: "request_custom_date" }
  | { kind: "confirm_custom_date"; target: FinancialFreedomTargetAnswer }
  | { kind: "restart_amount" }
  | { kind: "unknown" };

type FinancialFreedomPendingDecision =
  | { kind: "confirm_pending" }
  | { kind: "confirm_original"; planningAnswer: FinancialFreedomPlanningAnswer }
  | { kind: "replace_pending"; planningAnswer: FinancialFreedomPlanningAnswer }
  | { kind: "restart_requested" }
  | { kind: "unknown" };

type RequestedTimelinePreview = {
  startLabel: string;
  endLabel: string;
  parallelEndLabel: string;
  allocation: number;
  availableMonthly: number;
  gap: number;
  totalParallelAllocation: number;
  insight: string;
};

type TimelineMonthReference = {
  month: number;
  year: number;
  monthsFromNow: number;
  label: string;
};

type GoalTimelineCommitment = {
  goalName: string;
  startRef: TimelineMonthReference;
  endRef: TimelineMonthReference;
  allocation: number;
  gap: number;
  storedTargetAnswer: StoredGoalTargetAnswer | null;
};

const buildTimelineMonthReference = (
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

const buildTimelineMonthReferenceFromOffset = (monthsFromNow: number | null) => {
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

const compareTimelineMonthReferences = (
  left: TimelineMonthReference,
  right: TimelineMonthReference
) => (left.year === right.year ? left.month - right.month : left.year - right.year);

const countTimelineMonthsInclusive = (
  startRef: TimelineMonthReference,
  endRef: TimelineMonthReference
) =>
  Math.max(
    1,
    endRef.year * 12 + (endRef.month - 1) - (startRef.year * 12 + (startRef.month - 1)) + 1
  );

const getStoredCompletedGoalTargetAnswers = (sessions: OnboardingSession[]) =>
  sessions
    .filter(
      (session) =>
        session.questionKey === OnboardingQuestionKey.GOAL_TARGET_DATE && session.isCompleted === true
    )
    .map((session) => getStoredGoalTargetSessionAnswer(session.normalizedAnswerJson, "original"))
    .filter((item): item is StoredGoalTargetAnswer => Boolean(item));

const findStoredGoalTargetAnswer = (
  goal: PlanningGoalSummary,
  storedTargetAnswers: StoredGoalTargetAnswer[]
) =>
  goal.goalType === FinancialGoalType.EMERGENCY_FUND ||
  goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM
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

const buildGoalTimelineCommitments = (params: {
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

const getOverlappingTimelineCommitments = (
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

const applyStoredGoalTargetDecisionToEvaluation = (params: {
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

const getStoredGoalTargetSessionAnswer = (
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

const getStoredFinancialFreedomPlanningAnswer = (value: unknown): FinancialFreedomPlanningAnswer | null => {
  const parsed = parseFinancialFreedomPlanningAnswer(value);
  return parsed === undefined ? null : parsed;
};

const buildStoredGoalTargetSessionAnswer = (params: {
  summary: GoalTargetConfirmationSummary;
  target: FinancialFreedomTargetAnswer;
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

const buildRequestedTimelinePreview = (params: {
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
    insight:
      previewGap > 0
        ? "Perlu penyesuaian, kalau deadline ini mau dipertahankan targetnya perlu jalan paralel dengan target lain."
        : "Kalau deadline ini mau dipertahankan, targetnya perlu jalan paralel dengan target lain."
  };
};

const shouldUseRequestedTimelinePreview = (params: {
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

const buildGoalTargetConfirmationSummary = (
  context: RuntimeContext,
  targetAnswer: FinancialFreedomTargetAnswer
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
            targetMonth: goal.targetMonth,
            targetYear: goal.targetYear,
            status: goal.status
          };
        }

        return {
          goalType: goal.goalType,
          goalName: currentGoalName,
          targetAmount: targetAmount ?? goal.targetAmount,
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
              insight: "Perlu jalan paralel atau tambah setoran kalau deadline ini mau dipertahankan."
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

const isAggressiveGoalTargetConfirmation = (context: RuntimeContext, targetAnswer: FinancialFreedomTargetAnswer) => {
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
    (pendingConfirmation.normalizedAnswerJson as FinancialFreedomTargetAnswer);
  const summary = buildGoalTargetConfirmationSummary(context, pendingTargetAnswer);
  const text = typeof rawAnswer === "string" ? normalizeText(rawAnswer).toLowerCase() : "";
  const compactText = text.replace(/\s+/g, "");
  const parsedMonthYear = parseMonthYearInput(rawAnswer);

  if (parsedMonthYear) {
    return { kind: "confirm_custom_date", target: parsedMonthYear };
  }

  if (!summary.deadlineMissedBeforeStart && (summary.gap ?? 0) <= 0) {
    if (isPositiveAnswerConfirmation(rawAnswer)) return { kind: "confirm_original" };
    if (isNegativeAnswerConfirmation(rawAnswer)) return { kind: "restart_amount" };
    return { kind: "unknown" };
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

  if (
    text === "3" ||
    text.includes("ganti bulan") ||
    text.includes("ganti tahun") ||
    text.includes("ubah tanggal") ||
    text.includes("ubah target") ||
    text.includes("bulan tahun lain")
  ) {
    return { kind: "request_custom_date" };
  }

  if (
    text.includes("ubah nominal") ||
    text.includes("ganti nominal") ||
    text.includes("nominalnya salah") ||
    isNegativeAnswerConfirmation(rawAnswer)
  ) {
    return { kind: "restart_amount" };
  }

  return { kind: "unknown" };
};

const parseFinancialFreedomPendingDecision = (
  context: RuntimeContext,
  pendingConfirmation: OnboardingSession,
  rawAnswer: unknown
): FinancialFreedomPendingDecision => {
  const text = typeof rawAnswer === "string" ? normalizeText(rawAnswer).toLowerCase() : "";
  const pendingPlanningAnswer = getStoredFinancialFreedomPlanningAnswer(
    pendingConfirmation.normalizedAnswerJson
  );
  const defaultPlanningAnswer = buildDefaultFinancialFreedomPlanningAnswer(context);
  const parsedPlanningAnswer = parseFinancialFreedomPlanningAnswer(rawAnswer);

  if (parsedPlanningAnswer !== undefined) {
    if (
      pendingPlanningAnswer &&
      areFinancialFreedomPlanningAnswersEquivalent(
        context,
        parsedPlanningAnswer,
        pendingPlanningAnswer
      )
    ) {
      return { kind: "confirm_pending" };
    }

    if (
      defaultPlanningAnswer &&
      areFinancialFreedomPlanningAnswersEquivalent(
        context,
        parsedPlanningAnswer,
        defaultPlanningAnswer
      )
    ) {
      return {
        kind: "confirm_original",
        planningAnswer: defaultPlanningAnswer
      };
    }

    return {
      kind: "replace_pending",
      planningAnswer: parsedPlanningAnswer
    };
  }

  if (
    defaultPlanningAnswer &&
    (text === "pakai yang awal" ||
      text === "pakai versi awal" ||
      text === "yang awal aja" ||
      text === "versi awal aja" ||
      text.includes("balik ke awal") ||
      text.includes("kembali ke awal") ||
      text.includes("versi awal") ||
      text.includes("hitungan awal"))
  ) {
    return {
      kind: "confirm_original",
      planningAnswer: defaultPlanningAnswer
    };
  }

  if (
    text === "pakai ini" ||
    text === "pakai yang ini" ||
    text === "pakai versi ini" ||
    text === "versi ini" ||
    text === "lanjut dengan ini" ||
    isPositiveAnswerConfirmation(rawAnswer)
  ) {
    return { kind: "confirm_pending" };
  }

  if (
    text.includes("ubah lagi") ||
    text.includes("ganti lagi") ||
    text.includes("revisi") ||
    text.includes("belum pas") ||
    text.includes("masih mau ubah") ||
    text.includes("belum cocok") ||
    isNegativeAnswerConfirmation(rawAnswer)
  ) {
    return { kind: "restart_requested" };
  }

  return { kind: "unknown" };
};

const getDefaultFinancialFreedomSafeWithdrawalRate = () =>
  env.FINANCIAL_FREEDOM_EXPENSE_MULTIPLIER > 0
    ? 1 / env.FINANCIAL_FREEDOM_EXPENSE_MULTIPLIER
    : 0.04;

const getFinancialFreedomStartLabel = (params: {
  projectionBasis: string | null | undefined;
  totalMonthlySurplus: number | null;
  financialFreedomTargetAmount: number | null;
  estimatedEtaMonths: number | null;
}) => {
  const surplus = Math.max(0, params.totalMonthlySurplus ?? 0);
  const targetAmount = Math.max(0, params.financialFreedomTargetAmount ?? 0);

  if (surplus <= 0 || targetAmount <= 0) return null;

  if (
    params.projectionBasis === "FULL_SURPLUS" ||
    params.projectionBasis === "RESIDUAL_AFTER_PRIORITY"
  ) {
    return getMonthYearLabelFromNow(1);
  }

  if (
    params.projectionBasis === "AFTER_PRIORITY_GOAL" &&
    params.estimatedEtaMonths !== null &&
    Number.isFinite(params.estimatedEtaMonths)
  ) {
    const monthsNeededForFreedomOnly = targetAmount / surplus;
    const priorityDelayMonths = Math.max(0, params.estimatedEtaMonths - monthsNeededForFreedomOnly);
    return getMonthYearLabelFromNow(Math.max(1, Math.ceil(priorityDelayMonths) + 1));
  }

  return null;
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

  const [sessions, profile, activePlan, freedomGoal, activeGoals] = await Promise.all([
    onboardingSessionModel
      ? onboardingSessionModel.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })
      : Promise.resolve([]),
    financialProfileModel
      ? financialProfileModel.findUnique({ where: { userId } })
      : Promise.resolve(null),
    expensePlanModel
      ? expensePlanModel.findFirst({ where: { userId, isActive: true }, orderBy: { createdAt: "desc" } })
      : Promise.resolve(null),
    financialGoalModel
      ? financialGoalModel.findFirst({
          where: {
            userId,
            goalType: FinancialGoalType.FINANCIAL_FREEDOM,
            status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] }
          },
          orderBy: { createdAt: "desc" }
        })
      : Promise.resolve(null),
    financialGoalModel?.findMany
      ? financialGoalModel.findMany({
          where: {
            userId,
            status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] }
          },
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
  const goalExecutionModeSession = latestSessionForQuestion(
    confirmedSessions,
    OnboardingQuestionKey.GOAL_ALLOCATION_MODE
  );
  const priorityGoalSession = latestSessionForQuestion(
    confirmedSessions,
    OnboardingQuestionKey.GOAL_PRIORITY_FOCUS
  );
  const financialFreedomTargetSession = latestSessionForQuestion(
    confirmedSessions,
    OnboardingQuestionKey.GOAL_FINANCIAL_FREEDOM_AGE
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
  const activeGoalsByStoredPriority = Array.isArray(activeGoals) ? [...activeGoals] : [];
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
  const resolvedPriorityGoalType =
    storedPriorityOrderAnswer?.priorityGoalType ??
    goalPlanRecommendation.priorityGoalType ??
    null;
  const financialFreedomTargetAmount =
    toNumberOrNull(profile?.financialFreedomTarget) ??
    toNumberOrNull(freedomGoal?.targetAmount) ??
    (monthlyExpenseTotal !== null
      ? Math.ceil(monthlyExpenseTotal * 12 * env.FINANCIAL_FREEDOM_EXPENSE_MULTIPLIER)
      : null);
  const emergencyFundTargetAmount = toNumberOrNull(profile?.emergencyFundTarget);
  const financialFreedomAllocationPlan = buildFinancialFreedomAllocationPlan({
    goals: activeGoalsByStoredPriority.length
      ? activeGoalsByStoredPriority
      : freedomGoal
        ? [freedomGoal]
        : [],
    potentialMonthlySaving,
    financialFreedomTarget: financialFreedomTargetAmount,
    emergencyFundTarget: emergencyFundTargetAmount,
    monthlyExpenseTotal,
    goalExecutionMode: resolvedGoalExecutionMode,
    priorityGoalType: resolvedPriorityGoalType
  });
  const financialFreedomSafeWithdrawalRate =
    financialFreedomTargetAmount && financialFreedomTargetAmount > 0
      ? getDefaultFinancialFreedomSafeWithdrawalRate()
      : null;
  const financialFreedomSafeAnnualWithdrawal =
    financialFreedomSafeWithdrawalRate && financialFreedomTargetAmount
      ? Math.round(financialFreedomTargetAmount * financialFreedomSafeWithdrawalRate)
      : null;
  const financialFreedomSafeMonthlyWithdrawal =
    financialFreedomSafeAnnualWithdrawal !== null
      ? Math.round(financialFreedomSafeAnnualWithdrawal / 12)
      : null;
  const financialFreedomProjectedMonthlyContribution =
    financialFreedomAllocationPlan.projectionBasis === "AFTER_PRIORITY_GOAL"
      ? potentialMonthlySaving && potentialMonthlySaving > 0
        ? potentialMonthlySaving
        : null
      : financialFreedomAllocationPlan.monthlyAllocation !== null &&
          financialFreedomAllocationPlan.monthlyAllocation > 0
        ? financialFreedomAllocationPlan.monthlyAllocation
        : null;
  const financialFreedomStartLabel = getFinancialFreedomStartLabel({
    projectionBasis: financialFreedomAllocationPlan.projectionBasis,
    totalMonthlySurplus: potentialMonthlySaving,
    financialFreedomTargetAmount,
    estimatedEtaMonths: financialFreedomAllocationPlan.estimatedMonthsToGoal
  });
  const hasChosenGoalExecutionMode = Boolean(goalExecutionModeSession);
  const hasChosenPriorityGoal =
    Boolean(priorityGoalSession) &&
    !isStoredGoalPriorityOrderAnswer(priorityGoalSession?.normalizedAnswerJson);
  const hasFinancialFreedomTargetPreference = Boolean(financialFreedomTargetSession);
  const hasPersonalizationPending =
    pendingGoalDetail !== null ||
    (selectedGoalTypes.includes(FinancialGoalType.FINANCIAL_FREEDOM) &&
      Boolean(activePlan || monthlyExpenseTotal != null) &&
      !hasFinancialFreedomTargetPreference);

  return {
    user,
    sessions,
    activeGoals: activeGoalsByStoredPriority.map((goal: any) => ({
      goalType: goal.goalType,
      goalName: goal.goalName,
      targetAmount: toNumberOrNull(goal.targetAmount),
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
    hasFinancialFreedomTargetPreference,
    hasPersonalizationPending,
    pendingGoalStep: pendingGoalDetail?.step ?? null,
    currentGoalType: getCurrentGoalType(confirmedSessions),
    pendingAssetStep: pendingAssetDetail?.step ?? null,
    currentAssetType: getCurrentAssetType(confirmedSessions, user.onboardingStep),
    currentGoldType: getCurrentGoldType(confirmedSessions),
    hasCurrentMutualFundUnits:
      getCurrentBatchAnswerValue<number>(confirmedSessions, OnboardingQuestionKey.ASSET_MUTUAL_FUND_UNITS) != null,
    expenseAvailable: Boolean(activePlan || monthlyExpenseTotal != null),
    hasExpenseDependentGoal: hasExpenseDependentGoalSelection(confirmedSessions),
    hasFinancialFreedomGoal: selectedGoalTypes.includes(FinancialGoalType.FINANCIAL_FREEDOM),
    goalExpenseStrategy: getGoalExpenseStrategy(confirmedSessions),
    monthlyIncomeTotal,
    monthlyExpenseTotal,
    potentialMonthlySaving,
    guidedOtherExpenseStage: guidedOtherExpenseState.stage,
    guidedOtherExpensePendingLabel: guidedOtherExpenseState.pendingLabel,
    guidedOtherExpenseItems: buildGuidedExpenseSummaryItems(
      confirmedSessions,
      guidedOtherExpenseState.items
    ),
    emergencyFundTargetAmount,
    financialFreedomEtaMonths:
      financialFreedomAllocationPlan.estimatedMonthsToGoal ??
      toNumberOrNull(freedomGoal?.estimatedMonthsToGoal),
    financialFreedomTargetAmount,
    financialFreedomMonthlyAllocation: financialFreedomAllocationPlan.monthlyAllocation,
    financialFreedomProjectionBasis: financialFreedomAllocationPlan.projectionBasis,
    financialFreedomStartLabel,
    financialFreedomProjectedMonthlyContribution,
    financialFreedomSafeWithdrawalRate,
    financialFreedomSafeAnnualWithdrawal,
    financialFreedomSafeMonthlyWithdrawal,
    financialFreedomPriorityGoalName:
      financialFreedomAllocationPlan.priorityGoalName ??
      (resolvedPriorityGoalType && resolvedPriorityGoalType !== FinancialGoalType.FINANCIAL_FREEDOM
        ? goalNameByType(resolvedPriorityGoalType, getLatestCustomGoalName(confirmedSessions))
        : null)
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
  OnboardingStep.ASK_ACTIVE_INCOME,
  OnboardingStep.ASK_SALARY_DATE,
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
    case OnboardingStep.ASK_ASSET_CRYPTO_QUANTITY: {
      const symbol =
        getLatestAnswerValue<string>(context, OnboardingQuestionKey.ASSET_CRYPTO_SYMBOL) ??
        getLatestAssetName(context.sessions, OnboardingQuestionKey.ASSET_NAME);
      if (!symbol) {
        throw buildOnboardingAssetError("Saya belum nangkep crypto yang dimaksud. Coba kirim lagi simbolnya ya Boss.");
      }

      let quote;
      try {
        quote = await getMarketQuoteBySymbol(symbol);
      } catch {
        throw buildOnboardingAssetError("Crypto ini belum ketemu. Coba pakai simbol seperti `BTC`, `ETH`, atau `SOL` ya Boss.");
      }
      const quantityAnswer = normalizedAnswer as number | NumericRangeAnswer;
      const quantity = getNumericAnswerValue(quantityAnswer);
      if (!quantity || quantity <= 0) {
        throw buildOnboardingAssetError("Jumlah crypto belum lengkap. Jawab lagi pertanyaan yang ini ya Boss.");
      }
      return {
        assetType: AssetType.CRYPTO,
        assetName: quote.symbol,
        symbol: quote.symbol,
        quantity,
        unit: "coin",
        unitPrice: quote.price,
        estimatedValue: Math.round(quote.price * quantity),
        notes: buildAssetValuationNotes("MARKET_LIVE", {
          priceSource: quote.source,
          ...buildNumericRangeNote("reportedQuantityRange", quantityAnswer)
        })
      };
    }
    case OnboardingStep.ASK_ASSET_MUTUAL_FUND_UNITS: {
      const rawSelection =
        getLatestAnswerValue<string>(context, OnboardingQuestionKey.ASSET_MUTUAL_FUND_SYMBOL) ??
        getLatestAssetName(context.sessions, OnboardingQuestionKey.ASSET_NAME);
      if (!rawSelection) {
        throw buildOnboardingAssetError("Saya belum nangkep nama atau kode reksa dananya. Jawab lagi yang ini ya Boss.");
      }

      let quote;
      try {
        quote = await getMutualFundQuoteBySelection(rawSelection);
      } catch {
        throw buildOnboardingStepRedirectError({
          step: OnboardingStep.ASK_ASSET_ESTIMATED_VALUE,
          message:
            "Produk reksa dana ini belum ketemu data NAB terbarunya. Saya catat unitnya dulu, sekarang kirim estimasi total nilainya ya Boss."
        });
      }
      const quantityAnswer = normalizedAnswer as number | NumericRangeAnswer;
      const quantity = getNumericAnswerValue(quantityAnswer);
      if (!quantity || quantity <= 0) {
        throw buildOnboardingAssetError("Jumlah unit reksa dananya belum lengkap. Jawab lagi pertanyaan yang ini ya Boss.");
      }
      return {
        assetType: AssetType.MUTUAL_FUND,
        assetName: quote.displayName,
        symbol: quote.symbol,
        quantity,
        unit: "unit",
        unitPrice: quote.price,
        estimatedValue: Math.round(quote.price * quantity),
        notes: buildAssetValuationNotes("NAV_DELAYED", {
          rawSelection,
          priceSource: quote.source,
          ...buildNumericRangeNote("reportedUnitRange", quantityAnswer)
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

      if (context.currentAssetType === AssetType.CRYPTO) {
        context = {
          ...context,
          user: { ...context.user, onboardingStep: OnboardingStep.ASK_ASSET_CRYPTO_QUANTITY }
        };
        return buildAssetCreatePayload(context, normalizedAnswer);
      }

      if (context.currentAssetType === AssetType.MUTUAL_FUND) {
        if (shouldAskManualMutualFundEstimatedValue(context)) {
          const rawSelection =
            getCurrentBatchAnswerValue<string>(
              context.sessions,
              OnboardingQuestionKey.ASSET_MUTUAL_FUND_SYMBOL
            ) ??
            getLatestAssetName(context.sessions, OnboardingQuestionKey.ASSET_NAME);
          const quantityAnswer = getCurrentBatchAnswerValue<number | NumericRangeAnswer>(
            context.sessions,
            OnboardingQuestionKey.ASSET_MUTUAL_FUND_UNITS
          );
          const quantity = getNumericAnswerValue(quantityAnswer);

          if (!rawSelection || !quantity || quantity <= 0) {
            throw buildOnboardingAssetError(
              "Detail reksa dananya belum lengkap. Jawab lagi pertanyaan yang ini ya Boss."
            );
          }

          const totalValue = normalizedAnswer as number;
          return {
            assetType: AssetType.MUTUAL_FUND,
            assetName: rawSelection,
            symbol: buildManualMutualFundSymbol(rawSelection),
            quantity,
            unit: "unit",
            unitPrice: Math.round(totalValue / Math.max(quantity, 1)),
            estimatedValue: totalValue,
            notes: buildAssetValuationNotes("MANUAL_USER", {
              rawSelection,
              manualValuationReason: "quote_not_found",
              ...buildNumericRangeNote("reportedUnitRange", quantityAnswer)
            })
          };
        }

        context = {
          ...context,
          user: { ...context.user, onboardingStep: OnboardingStep.ASK_ASSET_MUTUAL_FUND_UNITS }
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
  return "Financial Freedom";
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
  OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE,
  OnboardingStep.ASK_ASSET_GOLD_GRAMS,
  OnboardingStep.ASK_ASSET_ESTIMATED_VALUE
];

const needsProfileRecalculation = (step: OnboardingStep) =>
  PROFILE_RECALCULATION_STEPS.includes(step);

const getSelectedExpenseGoalTypes = (sessions: OnboardingSession[]) =>
  Array.from(
    new Set(
      getSelectedGoalTypes(sessions).filter(
        (goalType) =>
          goalType === FinancialGoalType.EMERGENCY_FUND ||
          goalType === FinancialGoalType.FINANCIAL_FREEDOM
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
  const laterFinancialFreedomGoals = laterGoals
    .filter((goal) => goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM)
    .map((goal) => goal.goalName);
  const laterShortTermGoals = laterGoals
    .filter((goal) => goal.goalType !== FinancialGoalType.FINANCIAL_FREEDOM)
    .map((goal) => goal.goalName);

  const lines = ["Biar langkahnya rapi, saya bantu urutin targetnya ya Boss."];

  if (recommendation.executionMode === "PARALLEL" && leadGoals.length >= 2) {
    lines.push(
      `${joinNaturalLabels(leadGoals.map((goal) => goal.goalName))} enaknya jalan bareng dulu karena waktunya berdekatan.`
    );
  } else {
    lines.push(`Saya saranin fokus dulu ke ${leadGoals[0]?.goalName} ya Boss.`);
  }

  if (laterShortTermGoals.length) {
    lines.push(`Setelah itu baru lanjut ke ${joinNaturalLabels(laterShortTermGoals)}.`);
  }

  if (laterFinancialFreedomGoals.length) {
    lines.push(
      `${joinNaturalLabels(laterFinancialFreedomGoals)} saya taruh sebagai target jangka panjangnya.`
    );
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
    params.nextStep === OnboardingStep.ASK_ASSET_SELECTION &&
    EXPENSE_TO_ASSET_TRANSITION_STEPS.has(params.currentStep)
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
    case BudgetMode.AUTO_FROM_TRANSACTIONS:
      return "kamu mau mulai dari analisis transaksi bulan ini";
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

const getPriorityGoalRequiredMonthlyAllocation = (
  context: RuntimeContext
): { goalName: string; monthlyAllocation: number | null } | null => {
  const priorityGoalType = context.priorityGoalType;
  if (!priorityGoalType || priorityGoalType === FinancialGoalType.FINANCIAL_FREEDOM) return null;

  const goalName = getGoalDisplayNameForContext(context, priorityGoalType);

  if (priorityGoalType === FinancialGoalType.EMERGENCY_FUND) {
    if (context.monthlyExpenseTotal === null || context.monthlyExpenseTotal <= 0) {
      return { goalName, monthlyAllocation: null };
    }

    const summary = deriveEmploymentSummary(getEmploymentTypes(context.sessions));
    const emergencyMultiplier =
      summary.incomeStability === "STABLE"
        ? env.EMERGENCY_FUND_STABLE_MULTIPLIER
        : env.EMERGENCY_FUND_UNSTABLE_MULTIPLIER;

    // Dana darurat tidak punya tenggat eksplisit di onboarding, jadi hanya target totalnya yang bisa diperkirakan.
    return {
      goalName,
      monthlyAllocation: Math.ceil(context.monthlyExpenseTotal * emergencyMultiplier / 12)
    };
  }

  const recommendation = getGoalPlanRecommendation(context.sessions);
  const priorityDetail = recommendation.orderedGoalDetails.find(
    (goal) => goal.goalType === priorityGoalType
  );
  const targetAmount = getOnboardingGoalTargetAmount(context.sessions, priorityGoalType);

  if (!priorityDetail?.monthsFromNow || !targetAmount) {
    return { goalName, monthlyAllocation: null };
  }

  return {
    goalName,
    monthlyAllocation: Math.ceil(targetAmount / Math.max(1, priorityDetail.monthsFromNow))
  };
};

type FinancialFreedomPlanningTimeline = {
  startLabel: string | null;
  effectiveSavingMonths: number;
  availableMonthlyCapacity: number | null;
  priorityGoalName: string | null;
  mode: "FULL_SURPLUS" | "PARALLEL_WITH_PRIORITY" | "AFTER_PRIORITY_GOAL";
  feasibleWithinRequestedTarget: boolean;
  estimatedCompletionMonthsFromNow: number | null;
};

const getFinancialFreedomPlanningTimeline = (
  context: RuntimeContext,
  planningAnswer: FinancialFreedomPlanningAnswer,
  freedomTargetAmount: number,
  currentSurplus: number
): FinancialFreedomPlanningTimeline => {
  const targetMonthsFromNow = Math.max(1, planningAnswer.target?.monthsFromNow ?? 1);
  const baseTimeline: FinancialFreedomPlanningTimeline = {
    startLabel: currentSurplus > 0 ? getMonthYearLabelFromNow(1) : null,
    effectiveSavingMonths: targetMonthsFromNow,
    availableMonthlyCapacity: currentSurplus > 0 ? currentSurplus : null,
    priorityGoalName: null,
    mode: "FULL_SURPLUS",
    feasibleWithinRequestedTarget: true,
    estimatedCompletionMonthsFromNow:
      currentSurplus > 0 && freedomTargetAmount > 0
        ? Math.max(1, Math.ceil(freedomTargetAmount / currentSurplus))
        : null
  };

  if (currentSurplus <= 0) {
    return baseTimeline;
  }

  const activeGoalsForFinancialFreedom = context.activeGoals.length
    ? [
        ...context.activeGoals.filter(
          (goal) => goal.goalType !== FinancialGoalType.FINANCIAL_FREEDOM
        ),
        ...context.activeGoals.filter(
          (goal) => goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM
        )
      ]
    : [];
  const goalsForPlanning = activeGoalsForFinancialFreedom.length
    ? activeGoalsForFinancialFreedom.map((goal) => ({
        goalType: goal.goalType,
        goalName: goal.goalName,
        targetAmount:
          goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM
            ? freedomTargetAmount
            : goal.targetAmount,
        targetMonth:
          goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM
            ? planningAnswer.target?.month ?? goal.targetMonth
            : goal.targetMonth,
        targetYear:
          goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM
            ? planningAnswer.target?.year ?? goal.targetYear
            : goal.targetYear,
        status: goal.status
      }))
    : [
        {
          goalType: FinancialGoalType.FINANCIAL_FREEDOM,
          goalName: "Financial Freedom",
          targetAmount: freedomTargetAmount,
          targetMonth: planningAnswer.target?.month ?? null,
          targetYear: planningAnswer.target?.year ?? null,
          status: FinancialGoalStatus.ACTIVE
        }
      ];

  const allocationPlan = buildFinancialFreedomAllocationPlan({
    goals: goalsForPlanning,
    potentialMonthlySaving: currentSurplus,
    financialFreedomTarget: freedomTargetAmount,
    emergencyFundTarget: context.emergencyFundTargetAmount,
    monthlyExpenseTotal: context.monthlyExpenseTotal,
    goalExecutionMode: context.goalExecutionMode,
    priorityGoalType: context.priorityGoalType
  });

  if (allocationPlan.projectionBasis === "FULL_SURPLUS") {
    return baseTimeline;
  }

  if (
    allocationPlan.projectionBasis === "RESIDUAL_AFTER_PRIORITY" ||
    allocationPlan.projectionBasis === "BLOCKED_BY_PRIORITY"
  ) {
    return {
      startLabel: getMonthYearLabelFromNow(1),
      effectiveSavingMonths: targetMonthsFromNow,
      availableMonthlyCapacity:
        allocationPlan.monthlyAllocation !== null
          ? Math.max(0, allocationPlan.monthlyAllocation)
          : null,
      priorityGoalName: allocationPlan.priorityGoalName,
      mode: "PARALLEL_WITH_PRIORITY",
      feasibleWithinRequestedTarget: true,
      estimatedCompletionMonthsFromNow:
        allocationPlan.estimatedMonthsToGoal !== null
          ? Math.max(1, Math.ceil(allocationPlan.estimatedMonthsToGoal))
          : null
    };
  }

  if (
    allocationPlan.projectionBasis !== "AFTER_PRIORITY_GOAL" ||
    allocationPlan.estimatedMonthsToGoal === null ||
    !Number.isFinite(allocationPlan.estimatedMonthsToGoal)
  ) {
    return {
      ...baseTimeline,
      priorityGoalName: allocationPlan.priorityGoalName,
      mode: "AFTER_PRIORITY_GOAL"
    };
  }

  const freedomOnlyMonths = freedomTargetAmount > 0 ? freedomTargetAmount / currentSurplus : 0;
  const priorityDelayMonths = Math.max(
    0,
    allocationPlan.estimatedMonthsToGoal - freedomOnlyMonths
  );
  const roundedPriorityDelayMonths = Math.max(0, Math.ceil(priorityDelayMonths));
  const effectiveSavingMonths = targetMonthsFromNow - roundedPriorityDelayMonths;

  return {
    startLabel: getMonthYearLabelFromNow(Math.max(1, roundedPriorityDelayMonths + 1)),
    effectiveSavingMonths: Math.max(1, effectiveSavingMonths),
    availableMonthlyCapacity: currentSurplus,
    priorityGoalName: allocationPlan.priorityGoalName,
    mode: "AFTER_PRIORITY_GOAL",
    feasibleWithinRequestedTarget: effectiveSavingMonths >= 1,
    estimatedCompletionMonthsFromNow:
      allocationPlan.estimatedMonthsToGoal !== null
        ? Math.max(1, Math.ceil(allocationPlan.estimatedMonthsToGoal))
        : null
  };
};

type FinancialFreedomPlanningPreview = {
  planningAnswer: FinancialFreedomPlanningAnswer;
  targetAmount: number;
  targetMonthlyPassive: number;
  currentSurplus: number;
  timeline: FinancialFreedomPlanningTimeline;
  plan: ReturnType<typeof calculateFinancialFreedomPlan>;
  requestedTargetLabel: string;
  periodStartLabel: string | null;
  realisticCompletionLabel: string | null;
  previousGoalNames: string[];
  safeWithdrawalRate: number;
  safeMonthlyWithdrawal: number;
};

const formatMonthDuration = (totalMonths: number | null) => {
  if (totalMonths === null || totalMonths <= 0) return null;

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const parts: string[] = [];

  if (years > 0) {
    parts.push(`${years} tahun`);
  }

  if (months > 0) {
    parts.push(`${months} bulan`);
  }

  return parts.join(" ");
};

const getFinancialFreedomPlanningMonthlyExpenseBasis = (
  context: RuntimeContext,
  planningAnswer: FinancialFreedomPlanningAnswer
) => {
  if (planningAnswer.expenseMode === "CUSTOM") {
    return planningAnswer.monthlyExpense ?? null;
  }

  if (context.monthlyExpenseTotal !== null && context.monthlyExpenseTotal > 0) {
    return context.monthlyExpenseTotal;
  }

  if (
    context.financialFreedomSafeMonthlyWithdrawal !== null &&
    context.financialFreedomSafeMonthlyWithdrawal > 0
  ) {
    return context.financialFreedomSafeMonthlyWithdrawal;
  }

  if (context.financialFreedomTargetAmount !== null && context.financialFreedomTargetAmount > 0) {
    return Math.ceil(
      context.financialFreedomTargetAmount /
        (12 * Math.max(1, env.FINANCIAL_FREEDOM_EXPENSE_MULTIPLIER))
    );
  }

  return null;
};

const getFinancialFreedomPreviousGoalNames = (context: RuntimeContext) => {
  return context.activeGoals
    .filter((goal) => goal.goalType !== FinancialGoalType.FINANCIAL_FREEDOM)
    .map((goal) => goal.goalName)
    .filter(Boolean);
};

const buildFinancialFreedomPlanningPreview = (
  context: RuntimeContext,
  planningAnswer: FinancialFreedomPlanningAnswer
): FinancialFreedomPlanningPreview | null => {
  if (!planningAnswer.target) return null;

  const monthlyExpenseBasis =
    getFinancialFreedomPlanningMonthlyExpenseBasis(context, planningAnswer);

  if (monthlyExpenseBasis === null || monthlyExpenseBasis <= 0) return null;

  const freedomTargetAmount = Math.ceil(
    monthlyExpenseBasis * 12 * env.FINANCIAL_FREEDOM_EXPENSE_MULTIPLIER
  );
  const currentSurplus = Math.max(context.potentialMonthlySaving ?? 0, 0);
  const timeline = getFinancialFreedomPlanningTimeline(
    context,
    planningAnswer,
    freedomTargetAmount,
    currentSurplus
  );
  const plan = calculateFinancialFreedomPlan({
    targetAmount: freedomTargetAmount,
    currentSavedAmount: 0,
    targetDate: {
      month: planningAnswer.target.month,
      year: planningAnswer.target.year
    },
    monthlySurplus:
      timeline.availableMonthlyCapacity !== null
        ? timeline.availableMonthlyCapacity
        : currentSurplus
  });
  const realisticCompletionLabel =
    !timeline.feasibleWithinRequestedTarget || (plan.gapMonthly ?? 0) > 0
      ? getFinancialFreedomEtaLabel(timeline.estimatedCompletionMonthsFromNow) ??
        plan.realisticTargetLabel ??
        planningAnswer.target.label
      : planningAnswer.target.label;
  const safeWithdrawalRate = getDefaultFinancialFreedomSafeWithdrawalRate();
  const safeMonthlyWithdrawal = Math.round((freedomTargetAmount * safeWithdrawalRate) / 12);

  return {
    planningAnswer,
    targetAmount: freedomTargetAmount,
    targetMonthlyPassive: monthlyExpenseBasis,
    currentSurplus,
    timeline,
    plan,
    requestedTargetLabel: planningAnswer.target.label,
    periodStartLabel:
      timeline.startLabel ?? (currentSurplus > 0 ? getMonthYearLabelFromNow(1) : null),
    realisticCompletionLabel,
    previousGoalNames: getFinancialFreedomPreviousGoalNames(context),
    safeWithdrawalRate,
    safeMonthlyWithdrawal
  };
};

const buildDefaultFinancialFreedomPlanningAnswer = (
  context: RuntimeContext
): FinancialFreedomPlanningAnswer | null => {
  const etaLabel = getFinancialFreedomEtaLabel(context.financialFreedomEtaMonths);
  const target = etaLabel ? parseMonthYearInput(etaLabel) : null;
  if (!target) return null;

  return {
    target,
    expenseMode: "CURRENT",
    monthlyExpense: null
  };
};

const areFinancialFreedomPlanningAnswersEquivalent = (
  context: RuntimeContext,
  left: FinancialFreedomPlanningAnswer,
  right: FinancialFreedomPlanningAnswer
) => {
  const leftTarget = left.target;
  const rightTarget = right.target;
  const sameTarget =
    leftTarget === null && rightTarget === null
      ? true
      : leftTarget !== null &&
          rightTarget !== null &&
          leftTarget.month === rightTarget.month &&
          leftTarget.year === rightTarget.year;

  if (!sameTarget) return false;

  return (
    getFinancialFreedomPlanningMonthlyExpenseBasis(context, left) ===
    getFinancialFreedomPlanningMonthlyExpenseBasis(context, right)
  );
};

const buildFinancialFreedomPlanningConfirmationLines = (
  context: RuntimeContext,
  planningAnswer: FinancialFreedomPlanningAnswer
) => {
  const preview = buildFinancialFreedomPlanningPreview(context, planningAnswer);
  if (!preview) return [];

  const lines = [
    "🧭 Versi yang saya cek",
    `Target dana FF: ${formatMoney(preview.targetAmount)}`
  ];

  if (planningAnswer.expenseMode === "CUSTOM") {
    lines.push(`Target hasil pasif yang dipakai: ${formatMoney(preview.targetMonthlyPassive)}/bulan`);
  }

  lines.push(
    `Timeline realistis: ${preview.periodStartLabel ?? "belum kebaca"} - ${preview.realisticCompletionLabel ?? preview.requestedTargetLabel}`
  );
  const completionDurationLabel = formatMonthDuration(preview.timeline.estimatedCompletionMonthsFromNow);
  if (completionDurationLabel) {
    lines.push(`Estimasi sampai tercapai: ${completionDurationLabel}`);
  }
  lines.push(`Skema setelah tercapai: sekitar ${formatMoney(preview.safeMonthlyWithdrawal)}/bulan`);

  if (preview.previousGoalNames.length) {
    lines.push(`Target sebelumnya yang masih dihitung: ${joinNaturalLabels(preview.previousGoalNames)}`);
  }

  if (
    preview.timeline.mode === "PARALLEL_WITH_PRIORITY" &&
    preview.timeline.priorityGoalName
  ) {
    lines.push(`FF perlu berbagi alokasi bareng ${preview.timeline.priorityGoalName}.`);
  } else if (
    preview.timeline.mode === "AFTER_PRIORITY_GOAL" &&
    preview.timeline.priorityGoalName
  ) {
    lines.push(`Alokasi FF baru kebuka setelah ${preview.timeline.priorityGoalName} selesai.`);
  }

  if ((preview.plan.gapMonthly ?? 0) > 0) {
    lines.push(
      `Kalau mau tetap kejar ${preview.requestedTargetLabel}, masih perlu tambah sekitar ${formatMoney(
        preview.plan.gapMonthly ?? 0
      )}/bulan.`
    );
  } else if (!preview.timeline.feasibleWithinRequestedTarget) {
    lines.push(
      `Kalau tetap mau target ${preview.requestedTargetLabel}, FF perlu jalan paralel karena ruangnya belum kebuka penuh.`
    );
  }

  return lines;
};

const buildFinancialFreedomPlanningShortSummary = (
  preview: FinancialFreedomPlanningPreview,
  options?: {
    includeTargetMonthlyPassive?: boolean;
  }
) => {
  const lines = [
    `Target dana FF ${formatMoney(preview.targetAmount)}`,
    `Timeline ${preview.periodStartLabel ?? "belum kebaca"} - ${
      preview.realisticCompletionLabel ?? preview.requestedTargetLabel
    }`,
    `Skema sekitar ${formatMoney(preview.safeMonthlyWithdrawal)}/bulan`
  ];

  if (options?.includeTargetMonthlyPassive && preview.planningAnswer.expenseMode === "CUSTOM") {
    lines.splice(1, 0, `Patokan hasil pasif ${formatMoney(preview.targetMonthlyPassive)}/bulan`);
  }

  return lines.join(", ");
};

const buildFinancialFreedomPlanningDecisionText = (
  context: RuntimeContext,
  planningAnswer: FinancialFreedomPlanningAnswer
) => {
  const defaultPlanningAnswer = buildDefaultFinancialFreedomPlanningAnswer(context);
  const defaultPreview =
    defaultPlanningAnswer &&
    !areFinancialFreedomPlanningAnswersEquivalent(context, planningAnswer, defaultPlanningAnswer)
      ? buildFinancialFreedomPlanningPreview(context, defaultPlanningAnswer)
      : null;

  const lines = [
    "Kalau mau pakai versi ini, balas `pakai ini` atau `lanjut`."
  ];

  if (defaultPreview) {
    lines.push("Kalau mau balik ke versi awal, balas `pakai yang awal`.");
    lines.push(`Versi awal saya: ${buildFinancialFreedomPlanningShortSummary(defaultPreview)}.`);
  }

  lines.push(
    "Kalau masih mau revisi, kirim lagi bulan-tahun baru atau target hasil pasif bulanan yang Boss mau."
  );

  return lines.join("\n");
};

const buildFinancialFreedomPlanningAcceptedTexts = (
  context: RuntimeContext,
  planningAnswer: FinancialFreedomPlanningAnswer,
  intro: string
) => {
  if (!planningAnswer.target) {
    return [intro];
  }

  const preview = buildFinancialFreedomPlanningPreview(context, planningAnswer);
  if (!preview) {
    return [intro];
  }

  const lines = [
    intro,
    `Saya pakai ${buildFinancialFreedomPlanningShortSummary(preview, {
      includeTargetMonthlyPassive: true
    })}.`
  ];

  if (preview.previousGoalNames.length) {
    lines.push(`Target sebelumnya tetap saya hitung: ${joinNaturalLabels(preview.previousGoalNames)}.`);
  }

  return [lines.join("\n")];
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
    case OnboardingStep.ASK_ACTIVE_INCOME:
      return `income aktifnya sekitar ${formatMoney(normalizedAnswer as number)} per bulan`;
    case OnboardingStep.ASK_SALARY_DATE:
      return `tanggal gajiannya di tanggal ${normalizedAnswer as number}`;
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
        parseManualBreakdownTotal(normalizedAnswer as ExpenseBreakdown) ?? 0
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
        (normalizedAnswer as FinancialFreedomTargetAnswer).label
      }`;
    case OnboardingStep.ASK_GOAL_EXPENSE_STRATEGY:
      return `cara lanjutnya ${findOptionLabel(
        GOAL_EXPENSE_STRATEGY_OPTIONS,
        normalizedAnswer as string
      ).toLowerCase()}`;
    case OnboardingStep.ASK_GOAL_EXPENSE_TOTAL:
      return `total pengeluaran bulanan sekitar ${formatMoney(normalizedAnswer as number)}`;
    case OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE: {
      const planningAnswer = normalizedAnswer as FinancialFreedomPlanningAnswer;
      if (!planningAnswer.target) {
        return "target Financial Freedom dihapus dari daftar target untuk sekarang";
      }
      return `target waktu financial freedom di ${planningAnswer.target.label}`;
    }
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
    case OnboardingStep.ASK_ASSET_CRYPTO_SYMBOL:
      return `crypto yang mau dipantau "${normalizedAnswer as string}"`;
    case OnboardingStep.ASK_ASSET_CRYPTO_QUANTITY: {
      const symbol =
        getLatestAnswerValue<string>(context, OnboardingQuestionKey.ASSET_CRYPTO_SYMBOL) ?? "crypto ini";
      return isNumericRangeAnswer(normalizedAnswer)
        ? `jumlah ${symbol} di kisaran ${formatCryptoQuantity(normalizedAnswer.low)} sampai ${formatCryptoQuantity(normalizedAnswer.high)} coin`
        : `jumlah ${symbol} sekitar ${formatCryptoQuantity(normalizedAnswer as number)} coin`;
    }
    case OnboardingStep.ASK_ASSET_MUTUAL_FUND_SYMBOL:
      return `reksa dana yang mau dipantau "${normalizedAnswer as string}"`;
    case OnboardingStep.ASK_ASSET_MUTUAL_FUND_UNITS:
      return isNumericRangeAnswer(normalizedAnswer)
        ? `unit reksa dananya di kisaran ${formatNumericRange(normalizedAnswer)} unit`
        : `unit reksa dananya sekitar ${formatQuantityValue(normalizedAnswer as number)} unit`;
    case OnboardingStep.ASK_ASSET_PROPERTY_NAME:
      return `nama propertinya "${normalizedAnswer as string}"`;
    case OnboardingStep.ASK_ASSET_PROPERTY_ESTIMATED_VALUE:
      return `estimasi nilai propertinya sekitar ${formatMoney(normalizedAnswer as number)}`;
    case OnboardingStep.ASK_ASSET_NAME:
      return `nama asetnya "${normalizedAnswer as string}"`;
    case OnboardingStep.ASK_ASSET_ESTIMATED_VALUE:
      if (shouldAskManualMutualFundEstimatedValue(context)) {
        return `estimasi nilai reksa dananya sekitar ${formatMoney(normalizedAnswer as number)}`;
      }
      if (context.currentAssetType === AssetType.STOCK) {
        const symbol =
          getLatestAnswerValue<string>(context, OnboardingQuestionKey.ASSET_STOCK_SYMBOL) ?? "saham ini";
        return isNumericRangeAnswer(normalizedAnswer)
          ? `jumlah ${symbol} di kisaran ${formatNumericRange(normalizedAnswer)} lot`
          : `jumlah ${symbol} sekitar ${formatQuantityValue(normalizedAnswer as number)} lot`;
      }
      if (context.currentAssetType === AssetType.CRYPTO) {
        const symbol =
          getLatestAnswerValue<string>(context, OnboardingQuestionKey.ASSET_CRYPTO_SYMBOL) ?? "crypto ini";
        return isNumericRangeAnswer(normalizedAnswer)
          ? `jumlah ${symbol} di kisaran ${formatCryptoQuantity(normalizedAnswer.low)} sampai ${formatCryptoQuantity(normalizedAnswer.high)} coin`
          : `jumlah ${symbol} sekitar ${formatCryptoQuantity(normalizedAnswer as number)} coin`;
      }
      if (context.currentAssetType === AssetType.MUTUAL_FUND) {
        return isNumericRangeAnswer(normalizedAnswer)
          ? `unit reksa dananya di kisaran ${formatNumericRange(normalizedAnswer)} unit`
          : `unit reksa dananya sekitar ${formatQuantityValue(normalizedAnswer as number)} unit`;
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

const buildGoalTargetConfirmationReplyTexts = (
  context: RuntimeContext,
  targetAnswer: FinancialFreedomTargetAnswer
) => {
  const summary = buildGoalTargetConfirmationSummary(context, targetAnswer);
  const roadmapText = buildGoalTimelineRoadmapText(context, targetAnswer);
  const summaryLines = [
    summary.targetAmount && summary.targetAmount > 0
      ? `Saya catat target ${summary.goalName} sebesar ${formatMoney(summary.targetAmount)}, target ${targetAnswer.label}.`
      : `Saya catat target ${summary.goalName} dengan target waktu ${targetAnswer.label}.`
  ];
  if (summary.targetEvaluation) {
    const evaluationCopy = generateShortTargetEvaluationCopy({
      evaluation: summary.targetEvaluation,
      monthlySurplus: summary.requestedParallelPreview?.availableMonthly ?? summary.monthlySurplus,
      previousGoalNames: summary.previousGoalNames
    });
    if (evaluationCopy) {
      summaryLines.push(evaluationCopy);
    }
  }

  if (summary.deadlineMissedBeforeStart || (summary.gap ?? 0) > 0) {
    const decisionLines = [
      `Kalau Boss tetap mau pegang target ${targetAnswer.label}, saya simpan seperti itu.`
    ];
    if (summary.suggestedTarget) {
      decisionLines.push(
        `Kalau mau saya pakai versi yang lebih realistis, saya bisa geser ke ${summary.suggestedTarget.label}.`
      );
    }
    decisionLines.push("Kalau ada bulan dan tahun lain yang lebih cocok, langsung kirim aja.");
    return [summaryLines.join("\n"), roadmapText, decisionLines.join("\n")].filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    );
  }

  return [
    summaryLines.join("\n"),
    roadmapText,
    "Kalau catatan ini sudah pas, saya lanjut pakai target ini. Kalau ada yang mau diubah, bilang aja dari nominal atau target waktunya."
  ].filter((item): item is string => typeof item === "string" && item.trim().length > 0);
};

const buildConfirmationReplyTexts = (
  context: RuntimeContext,
  normalizedAnswer: SessionAnswerValue
) => {
  if (context.user.onboardingStep === OnboardingStep.ASK_GOAL_TARGET_DATE) {
    const targetAnswer = normalizedAnswer as FinancialFreedomTargetAnswer;
    return buildGoalTargetConfirmationReplyTexts(
      context,
      targetAnswer
    ).filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    );
  }

  if (context.user.onboardingStep === OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE) {
    const planningAnswer = normalizedAnswer as FinancialFreedomPlanningAnswer;
    const confirmationText = planningAnswer.target
      ? buildFinancialFreedomPlanningConfirmationLines(context, planningAnswer).join("\n")
      : [
          "Oke, untuk sekarang target Financial Freedom saya keluarkan dulu dari daftar prioritas."
        ].join("\n");
    const decisionText = buildFinancialFreedomPlanningDecisionText(context, planningAnswer);

    return [confirmationText, decisionText].filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    );
  }

  return [[
    `Saya pakai catatan ${describeStoredAnswer(context, normalizedAnswer)}.`,
    "Kalau ini sudah pas, saya lanjut. Kalau masih ada yang mau diubah, bilang aja."
  ].join("\n")];
};

const buildGoalTargetOverrideAcceptedTexts = (
  context: RuntimeContext,
  targetAnswer: FinancialFreedomTargetAnswer
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

const getTimelineOverallInsight = (
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

  return "📌 Overall aman, karena target-target ini masih masuk dalam kapasitas tabungan kamu sekarang.";
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
  targetAnswer: FinancialFreedomTargetAnswer
) => {
  const summary = buildGoalTargetConfirmationSummary(context, targetAnswer);
  const storedTargetAnswers = getStoredCompletedGoalTargetAnswers(context.sessions);
  const roadmapGoals =
    summary.planningAnalysis?.goalSummaries.filter(
      (goal) =>
        goal.targetAmount !== null &&
        (goal.goalType !== FinancialGoalType.FINANCIAL_FREEDOM || goal.targetDateLabel !== null)
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

  const lines = ["🎯 Timeline Keuangan Boss:", ""];

  if (confirmedLines.length) {
    lines.push(...confirmedLines, "");
  }

  if (pendingLines.length) {
    lines.push(...pendingLines, "");
  }

  lines.push(
    pendingGapSummaryLine ??
      getTimelineOverallInsight(roadmapGoals, {
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
    step === OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE && pendingConfirmation
      ? [
          buildFinancialFreedomPlanningDecisionText(
            context,
            getStoredFinancialFreedomPlanningAnswer(pendingConfirmation.normalizedAnswerJson) ?? {
              target: null,
              expenseMode: "CURRENT",
              monthlyExpense: null
            }
          )
        ]
      : [
          step === OnboardingStep.ASK_GOAL_TARGET_DATE &&
          pendingConfirmation &&
          isAggressiveGoalTargetConfirmation(
            context,
            getStoredGoalTargetSessionAnswer(pendingConfirmation.normalizedAnswerJson)?.target ??
              (pendingConfirmation.normalizedAnswerJson as FinancialFreedomTargetAnswer)
          )
            ? "Kalau mau tetap pakai target yang sekarang, tinggal bilang lanjut dengan target ini."
            : step === OnboardingStep.ASK_GOAL_TARGET_DATE
              ? "Kalau target ini sudah pas, saya lanjut dari sini."
            : "Kalau catatan ini sudah pas, saya lanjut pakai yang ini.",
          step === OnboardingStep.ASK_GOAL_TARGET_DATE &&
          pendingConfirmation &&
          isAggressiveGoalTargetConfirmation(
            context,
            getStoredGoalTargetSessionAnswer(pendingConfirmation.normalizedAnswerJson)?.target ??
              (pendingConfirmation.normalizedAnswerJson as FinancialFreedomTargetAnswer)
          )
            ? "Kalau lebih cocok pakai saran saya atau mau geser lagi bulannya, tinggal bilang aja. Kalau nominalnya yang mau dibenerin, bilang juga."
            : step === OnboardingStep.ASK_GOAL_TARGET_DATE
              ? "Kalau belum pas, bilang aja bagian mana yang mau diubah. Saya bisa ulang dari nominal atau target waktunya."
              : "Kalau belum sesuai, bilang aja yang mau diubah dan saya bantu ulang dari bagian itu.",
        ]
  );

const CONFIRMATION_STEPS = new Set<OnboardingStep>([
  OnboardingStep.ASK_GOAL_TARGET_DATE,
  OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE
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
  OnboardingStep.ASK_GOAL_EXPENSE_TOTAL,
  OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE
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
    case OnboardingStep.ASK_ACTIVE_INCOME:
    case OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME:
    case OnboardingStep.ASK_GUIDED_EXPENSE_FOOD:
    case OnboardingStep.ASK_GUIDED_EXPENSE_TRANSPORT:
    case OnboardingStep.ASK_GUIDED_EXPENSE_BILLS:
    case OnboardingStep.ASK_GUIDED_EXPENSE_ENTERTAINMENT:
    case OnboardingStep.ASK_GOAL_EXPENSE_TOTAL:
    case OnboardingStep.ASK_ASSET_SAVINGS_BALANCE:
    case OnboardingStep.ASK_ASSET_PROPERTY_ESTIMATED_VALUE: {
      const parsed = parseMoneyInput(rawAnswer);
      return parsed === null
        ? buildValidationReply(prompt, "Nominalnya belum valid. Coba kirim angka rupiah ya Boss.")
        : { value: parsed };
    }
    case OnboardingStep.ASK_GOAL_TARGET_AMOUNT: {
      if (parseMonthYearInput(rawAnswer)) {
        return buildValidationReply(
          prompt,
          "Itu kebaca sebagai target waktu. Untuk langkah ini, kirim nominal dana dulu ya Boss. Contohnya `50jt` atau `Rp50.000.000`."
        );
      }

      const parsed = parseMoneyInput(rawAnswer);
      return parsed === null
        ? buildValidationReply(prompt, "Nominalnya belum valid. Coba kirim angka rupiah ya Boss.")
        : { value: parsed };
    }
    case OnboardingStep.ASK_PASSIVE_INCOME: {
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
      const parsed = typeof rawAnswer === "string" ? parseManualExpenseBreakdown(rawAnswer) : null;
      return parsed && parseManualBreakdownTotal(parsed) !== null
        ? { value: parsed }
        : buildValidationReply(
            prompt,
            "Pengeluaran bulanannya belum kebayang dari jawaban ini Boss. Coba tulis kategori dan angkanya ya, nanti saya bantu rapihin."
          );
    }
    case OnboardingStep.ASK_PRIMARY_GOAL:
    case OnboardingStep.ASK_GOAL_SELECTION: {
      const conflict = parseGoalSelectionConflict(rawAnswer);
      if (conflict) {
        const suggestedTargets = joinNaturalLabels(
          conflict.nonExclusiveOptions.map((value) => findOptionLabel(GOAL_OPTIONS, value))
        );
        return buildValidationReply(
          prompt,
          suggestedTargets
            ? `Boss, pilihan "Belum ada target" nggak bisa digabung dengan target lain. Mau saya catat ${suggestedTargets} aja, atau pilih Belum ada target?`
            : 'Boss, pilihan "Belum ada target" nggak bisa digabung dengan target lain. Pilih salah satu arah dulu ya.'
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
      const parsed = parseDecimalInputPreservingRange(rawAnswer);
      return parsed ? { value: parsed } : buildValidationReply(prompt, "Jumlah lot saham belum valid ya Boss.");
    }
    case OnboardingStep.ASK_ASSET_CRYPTO_SYMBOL: {
      const parsed = parseCryptoSymbolInput(rawAnswer);
      return parsed
        ? { value: parsed }
        : buildValidationReply(
            prompt,
            "Saya belum nangkep crypto yang dimaksud. Coba pakai simbol seperti `BTC`, `ETH`, atau `SOL` ya Boss."
          );
    }
    case OnboardingStep.ASK_ASSET_CRYPTO_QUANTITY: {
      const parsed = parseDecimalInputPreservingRange(rawAnswer);
      return parsed ? { value: parsed } : buildValidationReply(prompt, "Jumlah crypto belum valid ya Boss.");
    }
    case OnboardingStep.ASK_ASSET_MUTUAL_FUND_SYMBOL: {
      const parsed = parseMutualFundSymbolInput(rawAnswer);
      return parsed
        ? { value: parsed }
        : buildValidationReply(prompt, "Saya belum nangkep nama atau kode reksa dananya ya Boss.");
    }
    case OnboardingStep.ASK_ASSET_MUTUAL_FUND_UNITS: {
      const parsed = parseDecimalInputPreservingRange(rawAnswer);
      return parsed ? { value: parsed } : buildValidationReply(prompt, "Jumlah unit reksa dana belum valid ya Boss.");
    }
    case OnboardingStep.ASK_ASSET_NAME: {
      if (context.currentAssetType === AssetType.STOCK) {
        const parsed = parseStockSymbolInput(rawAnswer);
        return parsed
          ? { value: parsed }
          : buildValidationReply(prompt, "Kode sahamnya belum valid. Coba kirim kode seperti `BBRI` atau `BBCA` ya Boss.");
      }
      if (context.currentAssetType === AssetType.CRYPTO) {
        const parsed = parseCryptoSymbolInput(rawAnswer);
        return parsed
          ? { value: parsed }
          : buildValidationReply(
              prompt,
              "Saya belum nangkep crypto yang dimaksud. Coba pakai simbol seperti `BTC`, `ETH`, atau `SOL` ya Boss."
            );
      }
      if (context.currentAssetType === AssetType.MUTUAL_FUND) {
        const parsed = parseMutualFundSymbolInput(rawAnswer);
        return parsed
          ? { value: parsed }
          : buildValidationReply(prompt, "Saya belum nangkep nama atau kode reksa dananya ya Boss.");
      }
      return parseAssetFreeText(rawAnswer)
        ? { value: parseAssetFreeText(rawAnswer)! }
        : buildValidationReply(prompt, "Jawabannya masih terlalu pendek, coba lebih spesifik ya Boss.");
    }
    case OnboardingStep.ASK_GOAL_EXPENSE_STRATEGY: {
      const parsed = parseGoalExpenseStrategy(rawAnswer);
      return parsed ? { value: parsed } : buildValidationReply(prompt, "Pilih salah satu opsi dulu ya Boss.");
    }
    case OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE: {
      const parsed = parseFinancialFreedomPlanningAnswer(rawAnswer);
      return parsed === undefined
        ? buildValidationReply(
            prompt,
            "Target financial freedom belum valid. Pilih target bulan-tahun yang valid, dan kalau pakai expense custom isi nominalnya juga."
          )
        : { value: parsed };
    }
    case OnboardingStep.ASK_ASSET_SELECTION: {
      const conflict = parseAssetSelectionConflict(rawAnswer);
      if (conflict) {
        const suggestedAssets = joinNaturalLabels(
          conflict.nonExclusiveOptions.map((value) => findOptionLabel(ASSET_OPTIONS, value))
        );
        return buildValidationReply(
          prompt,
          suggestedAssets
            ? `Boss, pilihan "Belum punya" nggak bisa digabung dengan aset lain. Mau saya catat ${suggestedAssets} aja, atau pilih Belum punya?`
            : 'Boss, kalau memang belum punya aset, pilih "Belum punya" aja ya.'
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
      const parsed = parseDecimalInputPreservingRange(rawAnswer);
      return parsed ? { value: parsed } : buildValidationReply(prompt, "Jumlah gram emas belum valid ya Boss.");
    }
    case OnboardingStep.ASK_ASSET_ESTIMATED_VALUE: {
      if (
        context.currentAssetType === AssetType.STOCK ||
        context.currentAssetType === AssetType.CRYPTO ||
        (context.currentAssetType === AssetType.MUTUAL_FUND &&
          !shouldAskManualMutualFundEstimatedValue(context))
      ) {
        const parsed = parseDecimalInputPreservingRange(rawAnswer);
        return parsed ? { value: parsed } : buildValidationReply(prompt, "Jumlah unitnya belum valid ya Boss.");
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
      await upsertIncomeProfile({ userId: context.user.id, activeIncomeMonthly: normalizedAnswer as number });
      break;
    case OnboardingStep.ASK_SALARY_DATE:
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
    case OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN:
      await replaceExpensePlan({ userId: context.user.id, source: ExpensePlanSource.MANUAL_USER_PLAN, breakdown: normalizedAnswer as ExpenseBreakdown });
      break;
    case OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS: {
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
        normalizedAnswer.kind === "category_amount" ||
        (normalizedAnswer.kind === "add_more" && normalizedAnswer.addMore === false)
      ) {
        await replaceExpensePlan({
          userId: context.user.id,
          source: ExpensePlanSource.GUIDED_ONBOARDING_PLAN,
          breakdown
        });
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
          Boolean(item) && item !== GOAL_NONE_VALUE
      );

      for (const goalType of selectedGoalTypes) {
        await createOrUpdateFinancialGoal({
          userId: context.user.id,
          goalType,
          goalName: goalNameByType(goalType, goalType === FinancialGoalType.CUSTOM ? "Custom Target" : null),
          targetAmount: null,
          calculationType:
            goalType === FinancialGoalType.EMERGENCY_FUND ||
            goalType === FinancialGoalType.FINANCIAL_FREEDOM
              ? GoalCalculationType.FORMULA_BASED
              : GoalCalculationType.MANUAL,
          status:
            goalType === FinancialGoalType.EMERGENCY_FUND ||
            goalType === FinancialGoalType.FINANCIAL_FREEDOM
              ? context.expenseAvailable
                ? FinancialGoalStatus.ACTIVE
                : FinancialGoalStatus.PENDING_CALCULATION
              : FinancialGoalStatus.ACTIVE,
          targetAge: goalType === FinancialGoalType.FINANCIAL_FREEDOM ? null : undefined
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
          (normalizedAnswer as FinancialFreedomTargetAnswer);
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
            status: FinancialGoalStatus.PENDING_CALCULATION,
            targetAge: goalType === FinancialGoalType.FINANCIAL_FREEDOM ? null : undefined
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
    case OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE:
      await prisma.user.update({
        where: { id: context.user.id },
        data: { targetFinancialFreedomAge: null }
      });
      const planningPreference = normalizedAnswer as FinancialFreedomPlanningAnswer;
      const targetPreference = planningPreference.target as FinancialFreedomTargetAnswer | null;
      if (!targetPreference) {
        await prisma.financialFreedomProfile.upsert({
          where: { userId: context.user.id },
          update: {
            enabled: false
          },
          create: {
            userId: context.user.id,
            enabled: false,
            monthlyExpense: 0,
            targetYears: 15,
            safeWithdrawalRate: getDefaultFinancialFreedomSafeWithdrawalRate()
          }
        });
        const financialGoalModel = getFinancialGoalModel();
        if (financialGoalModel?.updateMany) {
          await financialGoalModel.updateMany({
            where: {
              userId: context.user.id,
              goalType: FinancialGoalType.FINANCIAL_FREEDOM,
              status: { not: FinancialGoalStatus.ARCHIVED }
            },
            data: {
              status: FinancialGoalStatus.ARCHIVED
            }
          });
        }
        break;
      }
      await prisma.financialFreedomProfile.upsert({
        where: { userId: context.user.id },
        update: {
          enabled: true,
          monthlyExpense:
            planningPreference.expenseMode === "CUSTOM"
              ? planningPreference.monthlyExpense ?? 0
              : 0,
          targetYears: Math.max(1, Math.ceil(targetPreference.monthsFromNow / 12))
        },
        create: {
          userId: context.user.id,
          enabled: true,
          monthlyExpense:
            planningPreference.expenseMode === "CUSTOM"
              ? planningPreference.monthlyExpense ?? 0
              : 0,
          targetYears: Math.max(1, Math.ceil(targetPreference.monthsFromNow / 12)),
          safeWithdrawalRate: getDefaultFinancialFreedomSafeWithdrawalRate()
        }
      });
      await createOrUpdateFinancialGoal({
        userId: context.user.id,
        goalType: FinancialGoalType.FINANCIAL_FREEDOM,
        goalName: goalNameByType(FinancialGoalType.FINANCIAL_FREEDOM, null),
        targetAmount: null,
        calculationType: GoalCalculationType.FORMULA_BASED,
        status: context.expenseAvailable ? FinancialGoalStatus.ACTIVE : FinancialGoalStatus.PENDING_CALCULATION,
        targetAge: null
      });
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
    case OnboardingStep.ASK_ASSET_CRYPTO_QUANTITY:
    case OnboardingStep.ASK_ASSET_MUTUAL_FUND_UNITS:
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
  const lines = ["📊 Ringkasan Keuangan Boss", ""];

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
  lines.push("Insight detailnya lagi saya rapihin, tapi data onboarding Boss sudah aman tersimpan.");

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

const buildCompletedTimelineText = async (userId: string) => {
  const context = await buildRuntimeContext(userId);
  if (!context.activeGoals.length) return null;

  const goalsForSequentialPlanning =
    context.user.priorityGoalType === FinancialGoalType.FINANCIAL_FREEDOM
      ? context.activeGoals
      : [
          ...context.activeGoals.filter((goal) => goal.goalType !== FinancialGoalType.FINANCIAL_FREEDOM),
          ...context.activeGoals.filter((goal) => goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM)
        ];
  const latestFinancialFreedomPlanningAnswer = getStoredFinancialFreedomPlanningAnswer(
    [...context.sessions]
      .reverse()
      .find(
        (session) =>
          session.questionKey === OnboardingQuestionKey.GOAL_FINANCIAL_FREEDOM_AGE &&
          session.isCompleted === true
      )?.normalizedAnswerJson
  );
  const toMonthYearReference = (value: FinancialFreedomTargetAnswer | null | undefined) =>
    value
      ? {
          month: value.month,
          year: value.year,
          monthsFromNow: value.monthsFromNow,
          label: value.label
        }
      : null;
  const parseMonthYearReferenceLabel = (value: string | null | undefined) =>
    value ? toMonthYearReference(parseMonthYearInput(value)) : null;

  const planningAnalysis = buildOnboardingPlanningAnalysis({
    incomeStability: context.user.incomeStability,
    monthlyIncomeTotal: context.monthlyIncomeTotal,
    monthlyExpenseTotal: context.monthlyExpenseTotal,
    goalExecutionMode: context.user.goalExecutionMode,
    priorityGoalType: context.user.priorityGoalType,
    goals: goalsForSequentialPlanning,
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
    const financialFreedomPreview =
      goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM && latestFinancialFreedomPlanningAnswer?.target
        ? buildFinancialFreedomPlanningPreview(context, latestFinancialFreedomPlanningAnswer)
        : null;
    const financialFreedomDesiredDate = toMonthYearReference(
      financialFreedomPreview?.planningAnswer.target ?? null
    );
    const baseEvaluation = evaluateTargetAgainstCurrentPlan({
      goal,
      desiredDate:
        financialFreedomDesiredDate ??
        (storedTargetAnswer?.userDecision === "original" && storedTargetAnswer.desiredDate
          ? {
              month: storedTargetAnswer.desiredDate.month,
              year: storedTargetAnswer.desiredDate.year,
              monthsFromNow: storedTargetAnswer.desiredDate.monthsFromNow,
              label: storedTargetAnswer.desiredDate.label
            }
          : undefined),
      userDecision:
        financialFreedomPreview
          ? "realistic"
          : goal.goalType === FinancialGoalType.EMERGENCY_FUND ||
              goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM
          ? "original"
          : storedTargetAnswer?.userDecision ?? "original"
    });

    if (financialFreedomPreview && financialFreedomDesiredDate) {
      const gapMonthly = financialFreedomPreview.plan.gapMonthly ?? 0;
      const needsAdjustment =
        gapMonthly > 0 || !financialFreedomPreview.timeline.feasibleWithinRequestedTarget;

      return {
        ...baseEvaluation,
        amount: financialFreedomPreview.targetAmount,
        desiredDate: financialFreedomDesiredDate,
        realisticStartDate:
          parseMonthYearReferenceLabel(financialFreedomPreview.periodStartLabel) ??
          baseEvaluation.realisticStartDate,
        realisticEndDate:
          parseMonthYearReferenceLabel(financialFreedomPreview.realisticCompletionLabel) ??
          baseEvaluation.realisticEndDate,
        requiredMonthlyForDesiredDate:
          financialFreedomPreview.plan.requiredMonthlyContribution ??
          baseEvaluation.requiredMonthlyForDesiredDate,
        allocatedMonthly: Math.max(
          0,
          financialFreedomPreview.plan.availableMonthlyContribution ??
            financialFreedomPreview.timeline.availableMonthlyCapacity ??
            baseEvaluation.allocatedMonthly
        ),
        gapMonthly,
        status: needsAdjustment ? "needs_parallel" : "feasible",
        userDecision: needsAdjustment ? "realistic" : "original",
        targetAmount: financialFreedomPreview.targetAmount,
        basis: needsAdjustment ? "PARALLEL_RESIDUAL" : baseEvaluation.basis,
        insight: needsAdjustment
          ? "Deadline Financial Freedom versi Boss perlu tambahan setoran atau target lain dibuat paralel."
          : baseEvaluation.insight
      } satisfies TargetEvaluation;
    }

    return applyStoredGoalTargetDecisionToEvaluation({
      evaluation: baseEvaluation,
      storedTargetAnswer,
      commitment: commitments[index]
    });
  });

  return generateFinalTimelineCopy({
    evaluations
  });
};

const buildSafeCompletedTimelineText = async (userId: string) => {
  try {
    return await buildCompletedTimelineText(userId);
  } catch (error) {
    logger.error({ err: error, userId }, "Failed to generate onboarding timeline");
    return null;
  }
};

const finalizeOnboarding = async (userId: string) => {
  await buildInitialFinancialProfile(userId);
  await activateSubscription(userId);
  const [analysisText, timelineText] = await Promise.all([
    buildSafeCompletedAnalysisText(userId),
    buildSafeCompletedTimelineText(userId)
  ]);
  const user = await prisma.user.update({ where: { id: userId }, data: { registrationStatus: RegistrationStatus.COMPLETED, onboardingStatus: OnboardingStatus.COMPLETED, onboardingStep: OnboardingStep.COMPLETED, onboardingCompletedAt: new Date(), analysisReady: true } });
  return createState({ user, prompt: null, analysisText, timelineText });
};

const buildPostOnboardingActiveText = () =>
  [
    "💼 Mulai sekarang fitur otomatis sudah aktif:",
    "- pantau cashflow bulanan",
    "- reminder pengeluaran via WhatsApp",
    "- progress target yang update otomatis",
    "- insight mingguan langsung ke chat"
  ].join("\n");

const buildCompletedReplyTexts = (state: OnboardingState) =>
  [
    state.analysisText ?? "Onboarding selesai.",
    state.timelineText,
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
            normalizedAnswer as FinancialFreedomTargetAnswer
          ),
          target: normalizedAnswer as FinancialFreedomTargetAnswer,
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

const continueWithoutConfirmation = async (
  context: RuntimeContext,
  normalizedAnswer: SessionAnswerValue,
  rawAnswer: unknown
): Promise<OnboardingResult> => {
  const prompt = resolvePrompt(context);
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
    (normalizedAnswer as FinancialFreedomTargetAnswer);
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

const advanceOnboarding = async (user: User, rawAnswer: unknown): Promise<OnboardingResult> => {
  const initialStep = user.onboardingStep;
  const currentUser = await migrateLegacyGoalDecisionStepIfNeeded(user);
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

  if (
    pendingConfirmation &&
    context.user.onboardingStep === OnboardingStep.ASK_GOAL_TARGET_DATE
  ) {
    const decision = parseGoalTargetPendingDecision(context, pendingConfirmation, rawAnswer);

    if (decision.kind === "confirm_original") {
      const pendingTargetAnswer =
        getStoredGoalTargetSessionAnswer(pendingConfirmation.normalizedAnswerJson)?.target ??
        (pendingConfirmation.normalizedAnswerJson as FinancialFreedomTargetAnswer);
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
    context.user.onboardingStep === OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE
  ) {
    const decision = parseFinancialFreedomPendingDecision(context, pendingConfirmation, rawAnswer);

    if (decision.kind === "confirm_pending") {
      return completePendingConfirmation({
        context,
        pendingConfirmation,
        prefixTexts: ["Oke, saya lanjut pakai versi ini."]
      });
    }

    if (decision.kind === "confirm_original") {
      return completePendingConfirmation({
        context,
        pendingConfirmation,
        normalizedAnswerOverride: decision.planningAnswer,
        rawAnswerOverride: rawAnswer,
        prefixTexts: buildFinancialFreedomPlanningAcceptedTexts(
          context,
          decision.planningAnswer,
          "Oke, saya balik pakai versi awal Financial Freedom."
        )
      });
    }

    if (decision.kind === "replace_pending") {
      return requestAnswerConfirmation(
        context,
        decision.planningAnswer,
        rawAnswer,
        pendingConfirmation
      );
    }

    if (decision.kind === "restart_requested") {
      return buildMessageWithPromptReply(
        prompt,
        [
          "Siap, kirim lagi bulan dan tahun target Financial Freedom yang Boss mau, atau sekalian target hasil pasif bulanan yang diinginkan."
        ],
        createState({ user: context.user, prompt })
      );
    }

    return buildPendingConfirmationReminder(
      context,
      prompt,
      context.user.onboardingStep,
      pendingConfirmation
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
      [
        context.user.onboardingStep === OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE
          ? "Siap Boss, berarti timeline ini belum pas. Balas lagi bulan dan tahun yang kamu mau buat Financial Freedom ya."
          : "Siap Boss, jawab ulang pertanyaan yang ini ya."
      ],
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
  const context = await buildRuntimeContext(params.userId, user);
  if (context.user.onboardingStatus === OnboardingStatus.COMPLETED) {
    const [analysisText, timelineText] = await Promise.all([
      context.user.analysisReady ? buildSafeCompletedAnalysisText(params.userId) : Promise.resolve(null),
      buildSafeCompletedTimelineText(params.userId)
    ]);
    await activateSubscription(params.userId);
    return createState({ user: context.user, prompt: null, analysisText, timelineText });
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
    return { handled: false, replyText: "" };
  }

  const initialStep = params.user.onboardingStep;
  const currentUser = await migrateLegacyGoalDecisionStepIfNeeded(params.user);
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
    const timelineText = await buildSafeCompletedTimelineText(context.user.id);
    if (timelineText) {
      return buildReplyResult(
        [timelineText, ...getPromptReplyTexts(prompt)],
        createState({ user: context.user, prompt }),
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
