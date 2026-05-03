import {
  AssetType,
  BudgetMode,
  EmploymentType,
  ExpensePlanSource,
  FinancialGoalStatus,
  FinancialGoalType,
  GoalCalculationType,
  GoalExecutionMode,
  IncomeStability,
  OnboardingQuestionKey,
  PortfolioAssetType,
  Prisma
} from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { TROY_OUNCE_TO_GRAM } from "@/lib/services/market/market-price-service";
import { formatMoney, formatPercent } from "@/lib/services/shared/money-format";

export type ExpenseBreakdown = {
  food: number;
  transport: number;
  bills: number;
  entertainment: number;
  others: number;
};

const EMPTY_EXPENSE_BREAKDOWN: ExpenseBreakdown = {
  food: 0,
  transport: 0,
  bills: 0,
  entertainment: 0,
  others: 0
};

const EXPENSE_CATEGORY_TO_BUDGET: Record<keyof ExpenseBreakdown, string> = {
  food: "Food & Drink",
  transport: "Transport",
  bills: "Bills",
  entertainment: "Entertainment",
  others: "Others"
};

const ONBOARDING_EXPENSE_BUCKET_LABELS: Record<keyof ExpenseBreakdown, string> = {
  food: "Makan & kebutuhan harian",
  transport: "Transport",
  bills: "Tagihan & kewajiban rutin",
  entertainment: "Hiburan & lifestyle",
  others: "Lainnya"
};

const ONBOARDING_EXPENSE_BUCKET_EXPLANATIONS: Record<keyof ExpenseBreakdown, string> = {
  food: "makan/minum, kopi, restoran, sembako, belanja dapur, dan konsumsi harian",
  transport: "bensin, parkir, tol, ojol, taksi, kereta, bus, dan perjalanan rutin",
  bills: "listrik, air, internet, pulsa, cicilan, asuransi, BPJS, sekolah/kuliah/les, dan kewajiban rutin lain",
  entertainment: "nongkrong, streaming, game, bioskop, konser, hobi, dan pengeluaran lifestyle serupa",
  others: "kebutuhan keluarga, rumah tangga, donasi, pet, hadiah, dan item lain yang tidak masuk kategori utama"
};

const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta"
});
const DEFAULT_FINANCIAL_GOAL_PRIORITY_ORDER = 999;

const getCurrentJakartaMonthYear = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jakarta"
  }).formatToParts(new Date());

  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "1970");

  return { month, year };
};

const toBigIntAmount = (value: number | bigint | null | undefined) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value;
  if (!Number.isFinite(value)) return null;
  return BigInt(Math.max(0, Math.round(value)));
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const toDecimal = (value: number | null) =>
  value === null || !Number.isFinite(value) ? null : new Prisma.Decimal(value.toFixed(2));

const getMonthYearLabelFromNow = (monthsFromNow: number) => {
  const now = new Date();
  const totalMonths = now.getUTCFullYear() * 12 + now.getUTCMonth() + Math.max(1, monthsFromNow);
  const year = Math.floor(totalMonths / 12);
  const monthIndex = totalMonths % 12;
  return MONTH_YEAR_FORMATTER.format(new Date(Date.UTC(year, monthIndex, 1, 12)));
};

const getMonthYearReferenceFromOffset = (monthsFromNow: number | null): MonthYearReference | null => {
  if (monthsFromNow === null || !Number.isFinite(monthsFromNow) || monthsFromNow <= 0) return null;

  const { month: currentMonth, year: currentYear } = getCurrentJakartaMonthYear();
  const absoluteMonthIndex = currentYear * 12 + (currentMonth - 1) + Math.max(1, Math.ceil(monthsFromNow));
  const year = Math.floor(absoluteMonthIndex / 12);
  const month = (absoluteMonthIndex % 12) + 1;

  return {
    month,
    year,
    monthsFromNow: Math.max(1, Math.ceil(monthsFromNow)),
    label: MONTH_YEAR_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1, 12)))
  };
};

const getMonthYearReference = (
  month: number | null | undefined,
  year: number | null | undefined
): MonthYearReference | null => {
  if (!month || !year || month < 1 || month > 12) return null;
  const { month: currentMonth, year: currentYear } = getCurrentJakartaMonthYear();
  const currentIndex = currentYear * 12 + (currentMonth - 1);
  const targetIndex = year * 12 + (month - 1);

  return {
    month,
    year,
    monthsFromNow: targetIndex - currentIndex,
    label: MONTH_YEAR_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1, 12)))
  };
};

const compareMonthYearReferences = (left: MonthYearReference, right: MonthYearReference) =>
  left.year === right.year ? left.month - right.month : left.year - right.year;

const isFinancialFreedomTargetAnswer = (
  value: unknown
): value is {
  month: number;
  year: number;
  monthsFromNow: number;
  label: string;
} => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.month === "number" &&
    typeof candidate.year === "number" &&
    typeof candidate.monthsFromNow === "number" &&
    typeof candidate.label === "string"
  );
};

const getFinancialFreedomTargetFromSession = (value: unknown) => {
  if (isFinancialFreedomTargetAnswer(value)) return value;
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  return isFinancialFreedomTargetAnswer(candidate.target) ? candidate.target : null;
};

const hasKnownExpenseBreakdown = (breakdown: ExpenseBreakdown) =>
  Object.values(breakdown).some((value) => value > 0);

const sumBreakdown = (breakdown: ExpenseBreakdown) =>
  breakdown.food + breakdown.transport + breakdown.bills + breakdown.entertainment + breakdown.others;

const toExpenseBreakdownFromPlanItems = (
  items: Array<{ categoryKey: string; amount: bigint | number | string | null }> | null | undefined
): ExpenseBreakdown | null => {
  if (!items?.length) return null;

  const breakdown = { ...EMPTY_EXPENSE_BREAKDOWN };
  for (const item of items) {
    const key = item.categoryKey as keyof ExpenseBreakdown;
    if (!(key in breakdown)) continue;
    breakdown[key] += toNumber(item.amount ?? 0);
  }

  return hasKnownExpenseBreakdown(breakdown) ? breakdown : null;
};

export const buildExpenseBreakdownSummaryLines = (breakdown: ExpenseBreakdown | null) => {
  if (!breakdown || !hasKnownExpenseBreakdown(breakdown)) return [];

  const lines = ["", "Rincian pengeluaran bulanan yang saya catat:"];
  for (const key of Object.keys(ONBOARDING_EXPENSE_BUCKET_LABELS) as Array<keyof ExpenseBreakdown>) {
    const amount = breakdown[key];
    if (amount <= 0) continue;
    lines.push(`- ${ONBOARDING_EXPENSE_BUCKET_LABELS[key]}: ${formatMoney(amount)}`);
  }

  lines.push("");
  lines.push("Pengelompokan kategori yang saya pakai:");
  for (const key of Object.keys(ONBOARDING_EXPENSE_BUCKET_EXPLANATIONS) as Array<
    keyof ExpenseBreakdown
  >) {
    lines.push(`- ${ONBOARDING_EXPENSE_BUCKET_LABELS[key]}: ${ONBOARDING_EXPENSE_BUCKET_EXPLANATIONS[key]}.`);
  }

  return lines;
};

const getEmergencyFundMultiplier = (incomeStability: IncomeStability | null | undefined) => {
  if (incomeStability === IncomeStability.STABLE) {
    return env.EMERGENCY_FUND_STABLE_MULTIPLIER;
  }
  return env.EMERGENCY_FUND_UNSTABLE_MULTIPLIER;
};

export type FinancialFreedomProjectionBasis =
  | "FULL_SURPLUS"
  | "RESIDUAL_AFTER_PRIORITY"
  | "AFTER_PRIORITY_GOAL"
  | "BLOCKED_BY_PRIORITY"
  | "NO_SURPLUS"
  | "UNKNOWN";

export type FinancialFreedomAllocationPlan = {
  monthlyAllocation: number | null;
  projectionBasis: FinancialFreedomProjectionBasis;
  priorityGoalName: string | null;
  estimatedMonthsToGoal: number | null;
};

const joinGoalNames = (goalNames: string[]) => {
  if (goalNames.length <= 1) return goalNames[0] ?? null;
  if (goalNames.length === 2) return `${goalNames[0]} dan ${goalNames[1]}`;
  return `${goalNames.slice(0, -1).join(", ")}, dan ${goalNames.at(-1)}`;
};

type AllocationGoalInput = {
  goalType: FinancialGoalType;
  goalName: string;
  targetAmount: bigint | number | string | null;
  targetMonth?: number | null;
  targetYear?: number | null;
  status?: FinancialGoalStatus;
};

const getMonthsUntilGoalTargetDate = (
  targetMonth: number | null | undefined,
  targetYear: number | null | undefined
) => {
  if (!targetMonth || !targetYear) return null;
  if (targetMonth < 1 || targetMonth > 12) return null;

  const { month: currentMonth, year: currentYear } = getCurrentJakartaMonthYear();
  const currentIndex = currentYear * 12 + (currentMonth - 1);
  const targetIndex = targetYear * 12 + (targetMonth - 1);
  return Math.max(1, targetIndex - currentIndex);
};

export type TargetFeasibilityResult = {
  targetAmount: number;
  currentSavedAmount: number;
  remainingAmount: number;
  monthsUntilTarget: number | null;
  requiredMonthly: number | null;
  monthlySurplus: number;
  gap: number | null;
  feasible: boolean | null;
  realisticMonths: number | null;
  realisticTargetLabel: string | null;
};

const getMonthYearLabelFromMonthOffset = (monthsFromNow: number | null) => {
  if (monthsFromNow === null || !Number.isFinite(monthsFromNow) || monthsFromNow <= 0) return null;
  return getMonthYearLabelFromNow(Math.max(1, Math.ceil(monthsFromNow)));
};

export const calculateTargetFeasibility = (params: {
  targetAmount: number;
  currentSavedAmount?: number | null;
  targetDate?: { month: number; year: number } | null;
  monthlySurplus: number | null;
}): TargetFeasibilityResult => {
  const targetAmount = Math.max(0, params.targetAmount);
  const currentSavedAmount = Math.max(0, params.currentSavedAmount ?? 0);
  const remainingAmount = Math.max(0, targetAmount - currentSavedAmount);
  const monthlySurplus = Math.max(0, params.monthlySurplus ?? 0);
  const monthsUntilTarget =
    params.targetDate?.month && params.targetDate?.year
      ? getMonthsUntilGoalTargetDate(params.targetDate.month, params.targetDate.year)
      : null;
  const requiredMonthly =
    monthsUntilTarget !== null ? Math.ceil(remainingAmount / Math.max(1, monthsUntilTarget)) : null;
  const gap =
    requiredMonthly !== null ? Math.max(0, requiredMonthly - monthlySurplus) : null;
  const feasible = requiredMonthly !== null ? gap === 0 : null;
  const realisticMonths =
    remainingAmount <= 0
      ? 0
      : monthlySurplus > 0
        ? Math.ceil(remainingAmount / monthlySurplus)
        : null;

  return {
    targetAmount,
    currentSavedAmount,
    remainingAmount,
    monthsUntilTarget,
    requiredMonthly,
    monthlySurplus,
    gap,
    feasible,
    realisticMonths,
    realisticTargetLabel: getMonthYearLabelFromMonthOffset(realisticMonths)
  };
};

export type FinancialFreedomPlanResult = TargetFeasibilityResult & {
  requiredMonthlyContribution: number | null;
  availableMonthlyContribution: number;
  gapMonthly: number | null;
};

export type MonthYearReference = {
  month: number;
  year: number;
  label: string;
  monthsFromNow: number;
};

export type TargetEvaluationStatus =
  | "feasible"
  | "aggressive"
  | "impossible_sequential"
  | "needs_parallel";

export type TargetUserDecision =
  | "original"
  | "realistic"
  | "skipped"
  | "pending";

export type TargetEvaluation = {
  goalType: FinancialGoalType;
  name: string;
  amount: number | null;
  desiredDate: MonthYearReference | null;
  realisticStartDate: MonthYearReference | null;
  realisticEndDate: MonthYearReference | null;
  requiredMonthlyForDesiredDate: number | null;
  allocatedMonthly: number;
  gapMonthly: number | null;
  status: TargetEvaluationStatus;
  userDecision: TargetUserDecision;
  targetAmount: number | null;
  targetDateLabel: string | null;
  basis: GoalPlanningBasis | null;
  insight: string;
};

export type TimelinePeriod = {
  goalType: FinancialGoalType;
  goalName: string;
  startDate: MonthYearReference;
  endDate: MonthYearReference;
  desiredDate: MonthYearReference | null;
  realisticEndDate: MonthYearReference | null;
  monthlyAllocation: number;
  gapMonthly: number | null;
  status: TargetEvaluationStatus;
  targetAmount: number | null;
  insight: string;
  userDecision: TargetUserDecision;
};

export const calculateFinancialFreedomPlan = (params: {
  targetAmount: number;
  targetDate?: { month: number; year: number } | null;
  monthlySurplus: number | null;
  currentSavedAmount?: number | null;
}): FinancialFreedomPlanResult => {
  const feasibility = calculateTargetFeasibility({
    targetAmount: params.targetAmount,
    currentSavedAmount: params.currentSavedAmount,
    targetDate: params.targetDate,
    monthlySurplus: params.monthlySurplus
  });

  return {
    ...feasibility,
    requiredMonthlyContribution: feasibility.requiredMonthly,
    availableMonthlyContribution: feasibility.monthlySurplus,
    gapMonthly: feasibility.gap
  };
};

export type GoalPlanningBasis =
  | "FULL_SURPLUS"
  | "SEQUENTIAL_AFTER_PREVIOUS"
  | "PARALLEL_PRIORITY"
  | "PARALLEL_RESIDUAL";

export type PlanningGoalSummary = {
  goalType: FinancialGoalType;
  goalName: string;
  targetAmount: number | null;
  currentSavedAmount: number;
  remainingAmount: number | null;
  targetMonth: number | null;
  targetYear: number | null;
  targetDateLabel: string | null;
  monthsUntilTarget: number | null;
  startOffsetMonths: number;
  startMonth: number | null;
  startYear: number | null;
  startLabel: string | null;
  effectiveMonthsUntilTarget: number | null;
  deadlineMissedBeforeStart: boolean;
  requiredMonthlyAllocation: number | null;
  availableMonthlyAllocation: number;
  gapMonthly: number | null;
  feasible: boolean | null;
  realisticTargetMonth: number | null;
  realisticTargetYear: number | null;
  realisticTargetLabel: string | null;
  basis: GoalPlanningBasis | null;
  portfolioRequiredMonthlyAllocation: number | null;
  portfolioGapMonthly: number | null;
};

export type OnboardingPlanningAnalysis = {
  activeGoalCount: number;
  recommendedPriorityOrder: string[];
  recommendedAllocationMode: GoalExecutionMode | null;
  selectedPriorityGoalType: FinancialGoalType | null;
  canFinancialFreedomBeCalculatedFinal: boolean;
  financialFreedomResidualMonthlyAllocation: number | null;
  portfolioRequiredMonthlyAllocation: number | null;
  portfolioGapMonthly: number | null;
  suggestedNextQuestion: string | null;
  emergencyFund: {
    minimumTarget: number;
    recommendedTarget: number;
    mappedProgressAmount: number;
  };
  assetMapping: Array<{
    assetName: string;
    assetType: AssetType;
    estimatedValue: number | null;
    mappedUse: "EMERGENCY_BUFFER" | "LONG_TERM_BUFFER";
  }>;
  goalSummaries: PlanningGoalSummary[];
};

const calculateTargetFeasibilityForMonths = (params: {
  targetAmount: number;
  currentSavedAmount?: number | null;
  monthsUntilTarget: number | null;
  monthlySurplus: number | null;
  monthOffsetForRealisticLabel?: number;
}): TargetFeasibilityResult => {
  const targetAmount = Math.max(0, params.targetAmount);
  const currentSavedAmount = Math.max(0, params.currentSavedAmount ?? 0);
  const remainingAmount = Math.max(0, targetAmount - currentSavedAmount);
  const monthlySurplus = Math.max(0, params.monthlySurplus ?? 0);
  const hasExplicitTimeline = params.monthsUntilTarget !== null;
  const normalizedMonthsUntilTarget =
    params.monthsUntilTarget === null
      ? null
      : params.monthsUntilTarget <= 0
        ? 0
        : Math.ceil(params.monthsUntilTarget);
  const requiredMonthly =
    normalizedMonthsUntilTarget !== null && normalizedMonthsUntilTarget > 0
      ? Math.ceil(remainingAmount / normalizedMonthsUntilTarget)
      : null;
  const gap =
    requiredMonthly !== null ? Math.max(0, requiredMonthly - monthlySurplus) : null;
  const realisticMonths =
    remainingAmount <= 0
      ? 0
      : monthlySurplus > 0
        ? Math.ceil(remainingAmount / monthlySurplus)
        : null;
  const realisticMonthOffset =
    realisticMonths !== null ? Math.max(0, params.monthOffsetForRealisticLabel ?? 0) + realisticMonths : null;

  return {
    targetAmount,
    currentSavedAmount,
    remainingAmount,
    monthsUntilTarget: normalizedMonthsUntilTarget,
    requiredMonthly,
    monthlySurplus,
    gap,
    feasible:
      normalizedMonthsUntilTarget === 0
        ? false
        : requiredMonthly !== null
        ? gap === 0 && (!hasExplicitTimeline || (params.monthsUntilTarget ?? 0) > 0)
        : hasExplicitTimeline
          ? false
          : null,
    realisticMonths,
    realisticTargetLabel: getMonthYearLabelFromMonthOffset(realisticMonthOffset)
  };
};

const isActivePlanningGoal = (goal: AllocationGoalInput) =>
  goal.status === undefined ||
  goal.status === FinancialGoalStatus.ACTIVE ||
  goal.status === FinancialGoalStatus.PENDING_CALCULATION;

const resolveGoalTargetAmount = (params: {
  goal: AllocationGoalInput;
  emergencyFundTarget: number | null;
  financialFreedomTarget: number | null;
}) => {
  if (params.goal.goalType === FinancialGoalType.EMERGENCY_FUND) {
    return params.emergencyFundTarget;
  }
  if (params.goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM) {
    return params.financialFreedomTarget;
  }

  const amount = toNumber(params.goal.targetAmount ?? 0);
  return amount > 0 ? amount : null;
};

const getRequiredMonthlyAllocationForPriorityGoal = (params: {
  goal: AllocationGoalInput;
  targetAmount: number | null;
  monthlyExpenseTotal: number | null;
}) => {
  if (!params.targetAmount || params.targetAmount <= 0) return null;

  if (params.goal.goalType === FinancialGoalType.EMERGENCY_FUND) {
    return Math.ceil(params.targetAmount / 12);
  }

  const monthsToTarget = getMonthsUntilGoalTargetDate(
    params.goal.targetMonth,
    params.goal.targetYear
  );
  if (!monthsToTarget) return null;

  return Math.ceil(params.targetAmount / monthsToTarget);
};

export const buildFinancialFreedomAllocationPlan = (params: {
  goals: AllocationGoalInput[];
  potentialMonthlySaving: number | null;
  financialFreedomTarget: number | null;
  emergencyFundTarget: number | null;
  monthlyExpenseTotal: number | null;
  goalExecutionMode: GoalExecutionMode | null | undefined;
  priorityGoalType: FinancialGoalType | null | undefined;
}): FinancialFreedomAllocationPlan => {
  const surplus = Math.max(0, params.potentialMonthlySaving ?? 0);
  const financialFreedomTarget = Math.max(0, params.financialFreedomTarget ?? 0);
  const activeGoals = params.goals.filter(isActivePlanningGoal);
  const financialFreedomGoalIndex = activeGoals.findIndex(
    (goal) => goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM
  );
  const goalsBeforeFreedom =
    financialFreedomGoalIndex >= 0
      ? activeGoals
          .slice(0, financialFreedomGoalIndex)
          .filter((goal) => goal.goalType !== FinancialGoalType.FINANCIAL_FREEDOM)
      : activeGoals.filter((goal) => goal.goalType !== FinancialGoalType.FINANCIAL_FREEDOM);
  const hasOtherGoal = goalsBeforeFreedom.length > 0;
  const blockingGoalName = joinGoalNames(goalsBeforeFreedom.map((goal) => goal.goalName));

  if (financialFreedomTarget <= 0) {
    return {
      monthlyAllocation: null,
      projectionBasis: "UNKNOWN",
      priorityGoalName: null,
      estimatedMonthsToGoal: null
    };
  }

  if (surplus <= 0) {
    return {
      monthlyAllocation: 0,
      projectionBasis: "NO_SURPLUS",
      priorityGoalName: null,
      estimatedMonthsToGoal: null
    };
  }

  if (!hasOtherGoal) {
    return {
      monthlyAllocation: surplus,
      projectionBasis: "FULL_SURPLUS",
      priorityGoalName: null,
      estimatedMonthsToGoal: financialFreedomTarget / surplus
    };
  }

  if (params.goalExecutionMode === GoalExecutionMode.PARALLEL) {
    const requiredAllocations = goalsBeforeFreedom.map((goal) => {
      const targetAmount = resolveGoalTargetAmount({
        goal,
        emergencyFundTarget: params.emergencyFundTarget,
        financialFreedomTarget: params.financialFreedomTarget
      });
      return getRequiredMonthlyAllocationForPriorityGoal({
        goal,
        targetAmount,
        monthlyExpenseTotal: params.monthlyExpenseTotal
      });
    });

    if (requiredAllocations.some((allocation) => allocation === null)) {
      return {
        monthlyAllocation: null,
        projectionBasis: "BLOCKED_BY_PRIORITY",
        priorityGoalName: blockingGoalName,
        estimatedMonthsToGoal: null
      };
    }

    const totalRequiredAllocation = requiredAllocations.reduce<number>(
      (sum, allocation) => sum + Math.max(0, allocation ?? 0),
      0
    );
    const residual = Math.max(0, surplus - totalRequiredAllocation);
    return {
      monthlyAllocation: residual,
      projectionBasis: residual > 0 ? "RESIDUAL_AFTER_PRIORITY" : "BLOCKED_BY_PRIORITY",
      priorityGoalName: blockingGoalName,
      estimatedMonthsToGoal: residual > 0 ? financialFreedomTarget / residual : null
    };
  }

  const delayMonths = goalsBeforeFreedom.reduce((sum, goal) => {
    const targetAmount = resolveGoalTargetAmount({
      goal,
      emergencyFundTarget: params.emergencyFundTarget,
      financialFreedomTarget: params.financialFreedomTarget
    });

    if (!targetAmount || targetAmount <= 0) {
      return sum;
    }

    const realisticMonths =
      calculateTargetFeasibilityForMonths({
        targetAmount,
        currentSavedAmount: 0,
        monthsUntilTarget: null,
        monthlySurplus: surplus
      }).realisticMonths ?? 0;

    return sum + Math.max(0, realisticMonths);
  }, 0);

  return {
    monthlyAllocation: 0,
    projectionBasis: "AFTER_PRIORITY_GOAL",
    priorityGoalName: blockingGoalName,
    estimatedMonthsToGoal:
      delayMonths > 0 ? delayMonths + financialFreedomTarget / surplus : financialFreedomTarget / surplus
  };
};

const normalizeSymbol = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 20) || "ASSET";

const normalizeGoalName = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const GOLD_OUNCE_PRICE_THRESHOLD_IDR = 20_000_000;

export const normalizeStoredOnboardingAssetValue = (asset: {
  assetType: AssetType;
  quantity?: unknown;
  unit?: string | null;
  unitPrice?: unknown;
  estimatedValue?: unknown;
}) => {
  const estimatedValue = toNumber(asset.estimatedValue ?? 0);
  const unitPrice = toNumber(asset.unitPrice ?? 0);
  const quantity = Math.max(1, toNumber(asset.quantity ?? 1));
  const isLegacyGoldOunceValue =
    asset.assetType === AssetType.GOLD &&
    asset.unit?.toLowerCase() === "gram" &&
    (unitPrice >= GOLD_OUNCE_PRICE_THRESHOLD_IDR ||
      estimatedValue / quantity >= GOLD_OUNCE_PRICE_THRESHOLD_IDR);

  return isLegacyGoldOunceValue ? estimatedValue / TROY_OUNCE_TO_GRAM : estimatedValue;
};

export const upsertIncomeProfile = async (params: {
  userId: string;
  activeIncomeMonthly?: number | null;
  passiveIncomeMonthly?: number | null;
  estimatedMonthlyIncome?: number | null;
}) =>
  prisma.financialProfile.upsert({
    where: { userId: params.userId },
    update: {
      ...(params.activeIncomeMonthly !== undefined
        ? { activeIncomeMonthly: toBigIntAmount(params.activeIncomeMonthly) }
        : {}),
      ...(params.passiveIncomeMonthly !== undefined
        ? { passiveIncomeMonthly: toBigIntAmount(params.passiveIncomeMonthly) }
        : {}),
      ...(params.estimatedMonthlyIncome !== undefined
        ? { estimatedMonthlyIncome: toBigIntAmount(params.estimatedMonthlyIncome) }
        : {})
    },
    create: {
      userId: params.userId,
      activeIncomeMonthly: toBigIntAmount(params.activeIncomeMonthly ?? null),
      passiveIncomeMonthly: toBigIntAmount(params.passiveIncomeMonthly ?? null),
      estimatedMonthlyIncome: toBigIntAmount(params.estimatedMonthlyIncome ?? null)
    }
  });

export const replaceExpensePlan = async (params: {
  userId: string;
  source: ExpensePlanSource;
  breakdown: ExpenseBreakdown;
}) => {
  const total = sumBreakdown(params.breakdown);

  return prisma.$transaction(async (tx) => {
    await tx.expensePlan.updateMany({
      where: { userId: params.userId, isActive: true },
      data: { isActive: false }
    });

    const plan = await tx.expensePlan.create({
      data: {
        userId: params.userId,
        source: params.source,
        totalMonthlyExpense: BigInt(total),
        isActive: true,
        items: {
          create: [
            { categoryKey: "food", amount: BigInt(params.breakdown.food) },
            { categoryKey: "transport", amount: BigInt(params.breakdown.transport) },
            { categoryKey: "bills", amount: BigInt(params.breakdown.bills) },
            { categoryKey: "entertainment", amount: BigInt(params.breakdown.entertainment) },
            { categoryKey: "others", amount: BigInt(params.breakdown.others) }
          ]
        }
      },
      include: { items: true }
    });

    await tx.user.update({
      where: { id: params.userId },
      data: { monthlyBudget: total }
    });

    for (const [categoryKey, amount] of Object.entries(params.breakdown) as Array<
      [keyof ExpenseBreakdown, number]
    >) {
      await tx.budget.upsert({
        where: {
          userId_category: {
            userId: params.userId,
            category: EXPENSE_CATEGORY_TO_BUDGET[categoryKey]
          }
        },
        update: { monthlyLimit: amount },
        create: {
          userId: params.userId,
          category: EXPENSE_CATEGORY_TO_BUDGET[categoryKey],
          monthlyLimit: amount
        }
      });
    }

    await tx.financialProfile.upsert({
      where: { userId: params.userId },
      update: { monthlyExpenseTotal: BigInt(total) },
      create: { userId: params.userId, monthlyExpenseTotal: BigInt(total) }
    });

    return plan;
  });
};

export const setMonthlyExpenseTotal = async (userId: string, amount: number) =>
  prisma.financialProfile.upsert({
    where: { userId },
    update: { monthlyExpenseTotal: BigInt(Math.max(0, Math.round(amount))) },
    create: { userId, monthlyExpenseTotal: BigInt(Math.max(0, Math.round(amount))) }
  });

export const createOrUpdateFinancialGoal = async (params: {
  userId: string;
  goalType: FinancialGoalType;
  goalName: string;
  targetAmount: number | null;
  calculationType: GoalCalculationType;
  status: FinancialGoalStatus;
  targetAge?: number | null;
  targetMonth?: number | null;
  targetYear?: number | null;
}) => {
  const existing =
    params.goalType === FinancialGoalType.CUSTOM
      ? await prisma.financialGoal.findFirst({
          where: {
            userId: params.userId,
            goalType: FinancialGoalType.CUSTOM,
            status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] },
            OR: [
              { goalName: params.goalName },
              { goalName: "Custom Target" },
              {
                AND: [
                  { targetAmount: null },
                  { targetMonth: null },
                  { targetYear: null }
                ]
              }
            ]
          },
          orderBy: { createdAt: "desc" }
        })
      : await prisma.financialGoal.findFirst({
          where: {
            userId: params.userId,
            goalType: params.goalType,
            status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] }
          },
          orderBy: { createdAt: "desc" }
        });

  if (!existing) {
    return prisma.financialGoal.create({
      data: {
        userId: params.userId,
        goalType: params.goalType,
        goalName: params.goalName,
        targetAmount: toBigIntAmount(params.targetAmount),
        targetAge: params.targetAge ?? null,
        targetMonth: params.targetMonth ?? null,
        targetYear: params.targetYear ?? null,
        calculationType: params.calculationType,
        status: params.status
      }
    });
  }

  return prisma.financialGoal.update({
    where: { id: existing.id },
    data: {
      goalName: params.goalName,
      targetAmount: toBigIntAmount(params.targetAmount),
      targetAge: params.targetAge ?? existing.targetAge,
      targetMonth: params.targetMonth ?? existing.targetMonth,
      targetYear: params.targetYear ?? existing.targetYear,
      calculationType: params.calculationType,
      status: params.status
    }
  });
};

export const syncFinancialGoalPriorities = async (params: {
  userId: string;
  goals: Array<{
    goalType: FinancialGoalType;
    goalName: string;
  }>;
}) => {
  const activeStatuses = [
    FinancialGoalStatus.ACTIVE,
    FinancialGoalStatus.PENDING_CALCULATION,
    FinancialGoalStatus.COMPLETED
  ];

  const existingGoals = await prisma.financialGoal.findMany({
    where: {
      userId: params.userId,
      status: { in: activeStatuses }
    },
    orderBy: [{ priorityOrder: "asc" }, { createdAt: "asc" }]
  });

  if (!existingGoals.length) {
    return [];
  }

  const usedGoalIds = new Set<string>();
  const matchedGoalIds = params.goals
    .map((goal) => {
      const match =
        goal.goalType === FinancialGoalType.CUSTOM
          ? existingGoals.find(
              (candidate) =>
                !usedGoalIds.has(candidate.id) &&
                candidate.goalType === FinancialGoalType.CUSTOM &&
                normalizeGoalName(candidate.goalName) === normalizeGoalName(goal.goalName)
            ) ??
            existingGoals.find(
              (candidate) =>
                !usedGoalIds.has(candidate.id) &&
                candidate.goalType === FinancialGoalType.CUSTOM &&
                normalizeGoalName(candidate.goalName).includes(normalizeGoalName(goal.goalName))
            )
          : existingGoals.find(
              (candidate) =>
                !usedGoalIds.has(candidate.id) && candidate.goalType === goal.goalType
            );

      if (!match) return null;
      usedGoalIds.add(match.id);
      return match.id;
    })
    .filter((goalId): goalId is string => Boolean(goalId));

  await prisma.$transaction([
    prisma.financialGoal.updateMany({
      where: {
        userId: params.userId,
        status: { in: activeStatuses }
      },
      data: { priorityOrder: DEFAULT_FINANCIAL_GOAL_PRIORITY_ORDER }
    }),
    ...matchedGoalIds.map((goalId, index) =>
      prisma.financialGoal.update({
        where: { id: goalId },
        data: { priorityOrder: index }
      })
    )
  ]);

  return prisma.financialGoal.findMany({
    where: {
      userId: params.userId,
      status: { in: activeStatuses }
    },
    orderBy: [{ priorityOrder: "asc" }, { createdAt: "asc" }]
  });
};

export const createOnboardingAsset = async (params: {
  userId: string;
  assetType: AssetType;
  assetName: string;
  symbol?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  estimatedValue?: number | null;
  notes?: string | null;
}) => {
  const quantity = params.quantity && params.quantity > 0 ? params.quantity : 1;
  const estimatedValue =
    params.estimatedValue ??
    (params.unitPrice != null && quantity > 0 ? Math.round(params.unitPrice * quantity) : null);
  const averageBuyPrice =
    params.unitPrice != null
      ? params.unitPrice
      : estimatedValue != null && quantity > 0
        ? estimatedValue / quantity
        : 0;

  const asset = await prisma.asset.create({
    data: {
      userId: params.userId,
      assetType: params.assetType,
      assetName: params.assetName,
      quantity: params.quantity ?? null,
      unit: params.unit ?? null,
      unitPrice: toBigIntAmount(params.unitPrice ?? averageBuyPrice),
      estimatedValue: toBigIntAmount(estimatedValue),
      notes: params.notes ?? null
    }
  });

  const portfolioTypeMap: Record<AssetType, PortfolioAssetType> = {
    CASH: PortfolioAssetType.DEPOSIT,
    SAVINGS: PortfolioAssetType.DEPOSIT,
    GOLD: PortfolioAssetType.GOLD,
    STOCK: PortfolioAssetType.STOCK,
    CRYPTO: PortfolioAssetType.CRYPTO,
    MUTUAL_FUND: PortfolioAssetType.MUTUAL_FUND,
    PROPERTY: PortfolioAssetType.PROPERTY,
    OTHER: PortfolioAssetType.OTHER
  };

  const symbol =
    params.symbol?.trim() ||
    (params.assetType === AssetType.GOLD ? "XAU" : normalizeSymbol(params.assetName));

  await prisma.portfolioAsset.upsert({
    where: {
      userId_assetType_symbol: {
        userId: params.userId,
        assetType: portfolioTypeMap[params.assetType],
        symbol
      }
    },
    update: {
      displayName: params.assetName,
      quantity,
      unit: params.unit ?? "unit",
      averageBuyPrice
    },
    create: {
      userId: params.userId,
      assetType: portfolioTypeMap[params.assetType],
      symbol,
      displayName: params.assetName,
      quantity,
      unit: params.unit ?? "unit",
      averageBuyPrice,
      currency: "IDR"
    }
  });

  await prisma.user.update({
    where: { id: params.userId },
    data: { hasAssets: true }
  });

  return asset;
};

const selectPrimaryGoalForLegacySavings = async (userId: string) => {
  const goals = await prisma.financialGoal.findMany({
    where: {
      userId,
      status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] },
      targetAmount: { not: null }
    },
    orderBy: [{ priorityOrder: "asc" }, { createdAt: "asc" }]
  });

  const priority = [
    FinancialGoalType.EMERGENCY_FUND,
    FinancialGoalType.HOUSE,
    FinancialGoalType.VEHICLE,
    FinancialGoalType.VACATION,
    FinancialGoalType.CUSTOM,
    FinancialGoalType.FINANCIAL_FREEDOM
  ];

  for (const goalType of priority) {
    const match = goals.find((goal) => goal.goalType === goalType && goal.targetAmount !== null);
    if (match) return match;
  }

  return null;
};

export const buildInitialFinancialProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      financialProfile: true,
      expensePlans: {
        where: { isActive: true },
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: 1
      },
      financialGoals: true,
      assets: true,
      financialFreedom: true
    }
  });

  if (!user) {
    throw new Error("User not found");
  }

  const existingProfile = user.financialProfile;
  const activeIncome = toNumber(existingProfile?.activeIncomeMonthly ?? 0);
  const passiveIncome = toNumber(existingProfile?.passiveIncomeMonthly ?? 0);
  const estimatedIncome = toNumber(existingProfile?.estimatedMonthlyIncome ?? 0);
  const monthlyIncomeTotal = activeIncome + passiveIncome > 0 ? activeIncome + passiveIncome : estimatedIncome || null;

  const activePlan = user.expensePlans[0] ?? null;
  const planExpense = activePlan ? toNumber(activePlan.totalMonthlyExpense) : null;
  const directExpense = toNumber(existingProfile?.monthlyExpenseTotal ?? 0) || null;
  const monthlyExpenseTotal = planExpense ?? directExpense;
  const financialFreedomExpenseOverride = toNumber(user.financialFreedom?.monthlyExpense ?? 0);
  const financialFreedomMonthlyExpense =
    financialFreedomExpenseOverride > 0 ? financialFreedomExpenseOverride : monthlyExpenseTotal;

  const potentialMonthlySaving =
    monthlyIncomeTotal !== null && monthlyExpenseTotal !== null
      ? monthlyIncomeTotal - monthlyExpenseTotal
      : null;

  const savingRate =
    monthlyIncomeTotal && monthlyExpenseTotal !== null
      ? (potentialMonthlySaving ?? 0) / monthlyIncomeTotal * 100
      : null;

  const emergencyFundTarget =
    monthlyExpenseTotal !== null
      ? monthlyExpenseTotal * getEmergencyFundMultiplier(user.incomeStability)
      : null;

  const annualExpense = monthlyExpenseTotal !== null ? monthlyExpenseTotal * 12 : null;
  const financialFreedomAnnualExpense =
    financialFreedomMonthlyExpense !== null ? financialFreedomMonthlyExpense * 12 : null;
  const financialFreedomTarget =
    financialFreedomAnnualExpense !== null
      ? financialFreedomAnnualExpense * env.FINANCIAL_FREEDOM_EXPENSE_MULTIPLIER
      : null;
  const financialFreedomAllocationPlan = buildFinancialFreedomAllocationPlan({
    goals: user.financialGoals,
    potentialMonthlySaving,
    financialFreedomTarget,
    emergencyFundTarget,
    monthlyExpenseTotal,
    goalExecutionMode: user.goalExecutionMode,
    priorityGoalType: user.priorityGoalType
  });

  const profile = await prisma.financialProfile.upsert({
    where: { userId },
    update: {
      monthlyIncomeTotal: toBigIntAmount(monthlyIncomeTotal),
      monthlyExpenseTotal: toBigIntAmount(monthlyExpenseTotal),
      potentialMonthlySaving: toBigIntAmount(potentialMonthlySaving),
      savingRate: toDecimal(savingRate),
      emergencyFundTarget: toBigIntAmount(emergencyFundTarget),
      financialFreedomTarget: toBigIntAmount(financialFreedomTarget),
      annualExpense: toBigIntAmount(annualExpense)
    },
    create: {
      userId,
      activeIncomeMonthly: existingProfile?.activeIncomeMonthly ?? null,
      passiveIncomeMonthly: existingProfile?.passiveIncomeMonthly ?? null,
      estimatedMonthlyIncome: existingProfile?.estimatedMonthlyIncome ?? null,
      monthlyIncomeTotal: toBigIntAmount(monthlyIncomeTotal),
      monthlyExpenseTotal: toBigIntAmount(monthlyExpenseTotal),
      potentialMonthlySaving: toBigIntAmount(potentialMonthlySaving),
      savingRate: toDecimal(savingRate),
      emergencyFundTarget: toBigIntAmount(emergencyFundTarget),
      financialFreedomTarget: toBigIntAmount(financialFreedomTarget),
      annualExpense: toBigIntAmount(annualExpense)
    }
  });

  for (const goal of user.financialGoals) {
    let targetAmount = goal.targetAmount;
    let status = goal.status;

    if (goal.goalType === FinancialGoalType.EMERGENCY_FUND) {
      if (emergencyFundTarget !== null) {
        targetAmount = BigInt(emergencyFundTarget);
        status = FinancialGoalStatus.ACTIVE;
      } else {
        targetAmount = null;
        status = FinancialGoalStatus.PENDING_CALCULATION;
      }
    }

    if (goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM) {
      if (financialFreedomTarget !== null) {
        targetAmount = BigInt(financialFreedomTarget);
        status = FinancialGoalStatus.ACTIVE;
      } else {
        targetAmount = null;
        status = FinancialGoalStatus.PENDING_CALCULATION;
      }
    }

    const estimatedMonthsToGoal =
      goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM
        ? financialFreedomAllocationPlan.estimatedMonthsToGoal
        : targetAmount !== null && potentialMonthlySaving && potentialMonthlySaving > 0
          ? Number(targetAmount) / potentialMonthlySaving
          : null;

    await prisma.financialGoal.update({
      where: { id: goal.id },
      data: {
        targetAmount,
        status,
        estimatedMonthsToGoal: toDecimal(estimatedMonthsToGoal)
      }
    });
  }

  if (user.financialGoals.some((goal) => goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM)) {
    await prisma.financialFreedomProfile.upsert({
      where: { userId },
      update: {
        enabled: true
      },
      create: {
        userId,
        enabled: true,
        monthlyExpense: financialFreedomExpenseOverride > 0 ? financialFreedomExpenseOverride : 0,
        targetYears: 15,
        safeWithdrawalRate: 0.04
      }
    });
  }

  const legacyGoal = await selectPrimaryGoalForLegacySavings(userId);
  if (legacyGoal && legacyGoal.targetAmount !== null) {
    const legacyTargetAmount = Number(legacyGoal.targetAmount);
    await prisma.savingsGoal.upsert({
      where: { userId },
      update: { targetAmount: legacyTargetAmount },
      create: {
        userId,
        targetAmount: legacyTargetAmount,
        currentProgress: 0
      }
    });
  }

  return profile;
};

export const getOnboardingAnalysisData = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      financialProfile: true,
      expensePlans: {
        where: { isActive: true },
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: 1
      },
      financialGoals: {
        where: { status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] } },
        orderBy: [{ priorityOrder: "asc" }, { createdAt: "asc" }]
      },
      assets: true,
      financialFreedom: true
    }
  });

  if (!user || !user.financialProfile) {
    throw new Error("Financial profile not ready");
  }

  const profile = user.financialProfile;
  const activePlan = user.expensePlans[0] ?? null;
  const expenseBreakdown = toExpenseBreakdownFromPlanItems(activePlan?.items);
  const totalAssetValue = user.assets.reduce(
    (sum, asset) => sum + normalizeStoredOnboardingAssetValue(asset),
    0
  );

  return {
    user,
    incomeTotal: toNumber(profile.monthlyIncomeTotal ?? 0),
    expenseTotal: profile.monthlyExpenseTotal !== null ? toNumber(profile.monthlyExpenseTotal) : null,
    potentialSaving:
      profile.potentialMonthlySaving !== null ? toNumber(profile.potentialMonthlySaving) : null,
    savingRate: profile.savingRate !== null ? toNumber(profile.savingRate) : null,
    emergencyFundTarget:
      profile.emergencyFundTarget !== null ? toNumber(profile.emergencyFundTarget) : null,
    financialFreedomTarget:
      profile.financialFreedomTarget !== null ? toNumber(profile.financialFreedomTarget) : null,
    financialFreedomMonthlyExpense:
      user.financialFreedom?.monthlyExpense != null ? toNumber(user.financialFreedom.monthlyExpense) : null,
    financialFreedomSafeWithdrawalRate:
      user.financialFreedom?.safeWithdrawalRate != null
        ? toNumber(user.financialFreedom.safeWithdrawalRate)
        : null,
    annualExpense: profile.annualExpense !== null ? toNumber(profile.annualExpense) : null,
    expenseBreakdown,
    totalAssetValue,
    goals: user.financialGoals.map((goal) => ({
      id: goal.id,
      goalType: goal.goalType,
      goalName: goal.goalName,
      priorityOrder: goal.priorityOrder,
      targetAmount: goal.targetAmount !== null ? toNumber(goal.targetAmount) : null,
      targetMonth: goal.targetMonth,
      targetYear: goal.targetYear,
      status: goal.status,
      estimatedMonthsToGoal:
        goal.estimatedMonthsToGoal !== null ? toNumber(goal.estimatedMonthsToGoal) : null
    })),
    assets: user.assets.map((asset) => ({
      id: asset.id,
      assetType: asset.assetType,
      assetName: asset.assetName,
      estimatedValue:
        asset.estimatedValue !== null ? normalizeStoredOnboardingAssetValue(asset) : null
    }))
  };
};

export const generateOnboardingAnalysis = async (userId: string) => {
  const data = await getOnboardingAnalysisData(userId);
  const onboardingSessionModel = (prisma as { onboardingSession?: any }).onboardingSession;
  const latestFreedomTargetSession = onboardingSessionModel
    ? await onboardingSessionModel.findFirst({
        where: {
          userId,
          questionKey: OnboardingQuestionKey.GOAL_FINANCIAL_FREEDOM_AGE,
          isCompleted: true
        },
        orderBy: { createdAt: "desc" }
      })
    : null;
  const desiredFreedomTarget = getFinancialFreedomTargetFromSession(
    latestFreedomTargetSession?.normalizedAnswerJson
  );
  const lines = ["📊 Ringkasan Keuangan Boss", ""];
  const monthlySurplus = Math.max(data.potentialSaving ?? 0, 0);
  const emergencyGoal = data.goals.find((goal) => goal.goalType === FinancialGoalType.EMERGENCY_FUND);
  const freedomGoal = data.goals.find((goal) => goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM);
  const manualGoals = data.goals.filter(
    (goal) =>
      goal.goalType !== FinancialGoalType.EMERGENCY_FUND &&
      goal.goalType !== FinancialGoalType.FINANCIAL_FREEDOM
  );
  const goalsForSequentialPlanning =
    data.user.priorityGoalType === FinancialGoalType.FINANCIAL_FREEDOM
      ? data.goals
      : [
          ...data.goals.filter((goal) => goal.goalType !== FinancialGoalType.FINANCIAL_FREEDOM),
          ...data.goals.filter((goal) => goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM)
        ];
  const planningAnalysis = buildOnboardingPlanningAnalysis({
    incomeStability: data.user.incomeStability,
    monthlyIncomeTotal: data.incomeTotal,
    monthlyExpenseTotal: data.expenseTotal,
    goalExecutionMode: data.user.goalExecutionMode,
    priorityGoalType: data.user.priorityGoalType,
    goals: goalsForSequentialPlanning,
    assets: data.assets
  });

  lines.push(`Income: ${formatMoney(data.incomeTotal)}/bulan`);
  lines.push(
    `Pengeluaran: ${
      data.expenseTotal !== null ? `${formatMoney(data.expenseTotal)}/bulan` : "belum lengkap"
    }`
  );
  lines.push(
    `Ruang nabung: ${
      data.potentialSaving !== null ? `${formatMoney(data.potentialSaving)}/bulan` : "belum kebaca"
    }`
  );

  if (data.savingRate !== null && Number.isFinite(data.savingRate)) {
    lines.push(`Saving rate: ${formatPercent(data.savingRate, 1)}`);
  }

  if (emergencyGoal) {
    lines.push(
      `Dana darurat ideal: ${
        emergencyGoal.targetAmount !== null
          ? formatMoney(emergencyGoal.targetAmount)
          : "masih menunggu data pengeluaran"
      }`
    );
  }

  lines.push(
    `Aset terdata: ${
      data.assets.length ? formatMoney(data.totalAssetValue) : "belum ditambahkan"
    }`
  );
  if (planningAnalysis.recommendedAllocationMode) {
    lines.push(
      `Mode target: ${
        planningAnalysis.recommendedAllocationMode === GoalExecutionMode.PARALLEL
          ? "Paralel"
          : "Berurutan"
      }`
    );
  }

  const statusLines: string[] = [];

  if (data.potentialSaving === null) {
    statusLines.push("📝 Cashflow belum lengkap, jadi beberapa proyeksi masih kasar.");
  } else if (data.potentialSaving > 0) {
    statusLines.push("✅ Cashflow sehat dan masih ada ruang tabung bulanan.");
  } else {
    statusLines.push("⚠️ Cashflow masih ketat. Fokus utama sekarang rapihin pengeluaran rutin dulu.");
  }

  if (freedomGoal?.targetAmount != null && desiredFreedomTarget) {
    const freedomTargetAmount = freedomGoal.targetAmount;
    const allocationPlan = buildFinancialFreedomAllocationPlan({
      goals: goalsForSequentialPlanning,
      potentialMonthlySaving: data.potentialSaving,
      financialFreedomTarget: freedomTargetAmount,
      emergencyFundTarget: data.emergencyFundTarget,
      monthlyExpenseTotal: data.expenseTotal,
      goalExecutionMode: data.user.goalExecutionMode,
      priorityGoalType: data.user.priorityGoalType
    });
    const availableForFreedom =
      allocationPlan.monthlyAllocation !== null
        ? Math.max(allocationPlan.monthlyAllocation, 0)
        : monthlySurplus;
    const freedomPlan = calculateFinancialFreedomPlan({
      targetAmount: freedomTargetAmount,
      targetDate: {
        month: desiredFreedomTarget.month,
        year: desiredFreedomTarget.year
      },
      monthlySurplus: availableForFreedom
    });
    const priorityNote =
      allocationPlan.priorityGoalName && allocationPlan.projectionBasis !== "FULL_SURPLUS"
        ? ` karena ${allocationPlan.priorityGoalName} masih ambil porsi dulu`
        : "";

    if (freedomPlan.feasible) {
      statusLines.push(
        `✅ Financial Freedom masih realistis. Setoran perlu ${formatMoney(
          freedomPlan.requiredMonthlyContribution ?? 0
        )}/bulan${priorityNote}.`
      );
    } else if (freedomPlan.requiredMonthlyContribution !== null) {
      statusLines.push(
        `⚠️ Financial Freedom perlu setoran ${formatMoney(
          freedomPlan.requiredMonthlyContribution
        )}/bulan; ruang realistis sekarang ${formatMoney(
          freedomPlan.availableMonthlyContribution
        )}/bulan, gap ${formatMoney(freedomPlan.gapMonthly ?? 0)}/bulan${priorityNote}.`
      );
    }
  } else if (freedomGoal && data.potentialSaving !== null && data.potentialSaving <= 0) {
    statusLines.push("⚠️ Financial Freedom belum realistis dihitung detail karena ruang tabungnya belum positif.");
  } else if (freedomGoal) {
    statusLines.push("📝 Financial Freedom masih perlu timeline target supaya proyeksinya bisa saya kunci.");
  }

  const manualGoalSummaries = planningAnalysis.goalSummaries.filter(
    (goal) =>
      goal.goalType !== FinancialGoalType.EMERGENCY_FUND &&
      goal.goalType !== FinancialGoalType.FINANCIAL_FREEDOM
  );

  for (const goal of manualGoalSummaries.slice(0, 3)) {
    if (goal.targetAmount === null || goal.targetDateLabel === null) {
      statusLines.push(`📝 ${goal.goalName} masih perlu nominal atau tanggal target yang lebih lengkap.`);
      continue;
    }

    const startNote =
      goal.basis === "SEQUENTIAL_AFTER_PREVIOUS" && goal.startLabel
        ? ` Mulai realistis sekitar ${goal.startLabel}.`
        : goal.basis === "PARALLEL_RESIDUAL" &&
            goal.portfolioRequiredMonthlyAllocation !== null &&
            goal.portfolioGapMonthly !== null
          ? ` Kalau dikejar paralel, total kebutuhan semua target sekitar ${formatMoney(
              goal.portfolioRequiredMonthlyAllocation
            )}/bulan dengan gap portofolio ${formatMoney(goal.portfolioGapMonthly)}/bulan.`
          : "";

    if (goal.feasible) {
      statusLines.push(
        `✅ ${goal.goalName} masih realistis. Butuh sekitar ${formatMoney(
          goal.requiredMonthlyAllocation ?? 0
        )}/bulan sampai ${goal.targetDateLabel}.${startNote}`
      );
      continue;
    }

    if (goal.deadlineMissedBeforeStart) {
      statusLines.push(
        `âš ï¸ ${goal.goalName} belum keburu dengan urutan sekarang. Alokasi realistisnya baru mulai sekitar ${goal.startLabel ?? "setelah target sebelumnya selesai"}${
          goal.realisticTargetLabel ? `, jadi lebih masuk akal kalau targetnya digeser ke sekitar ${goal.realisticTargetLabel}` : ""
        }.`
      );
      continue;
    }

    if (goal.requiredMonthlyAllocation !== null) {
      statusLines.push(
        `⚠️ ${goal.goalName} cukup agresif. Butuh ${formatMoney(
          goal.requiredMonthlyAllocation
        )}/bulan; ruang sekarang ${formatMoney(
          goal.availableMonthlyAllocation
        )}/bulan, gap ${formatMoney(goal.gapMonthly ?? 0)}/bulan${
          goal.realisticTargetLabel ? `, realistisnya sekitar ${goal.realisticTargetLabel}` : ""
        }.${startNote}`
      );
    }
  }

  const recommendationLines: string[] = [];
  if (data.potentialSaving !== null && data.potentialSaving <= 0) {
    recommendationLines.push("Rapihin pengeluaran rutin dulu sampai ruang nabung balik positif.");
  }
  if (emergencyGoal?.targetAmount && monthlySurplus > 0) {
    recommendationLines.push("Selesaikan dana darurat dulu sebagai bantalan utama sebelum ngebut ke target besar.");
  }
  if (manualGoals.some((goal) => goal.targetAmount && goal.targetMonth && goal.targetYear)) {
    recommendationLines.push("Turunkan deadline target yang agresif atau tambah setoran bulanan pada target itu.");
  }
  if ((data.goals.length ?? 0) > 1) {
    recommendationLines.push(
      data.user.goalExecutionMode === GoalExecutionMode.PARALLEL
        ? "Jaga pembagian target paralel tetap realistis supaya prioritas utamanya tidak kekurangan dana."
        : "Kejar target satu per satu dulu biar surplus bulanan tidak pecah terlalu tipis."
    );
  }
  if (
    planningAnalysis.portfolioGapMonthly !== null &&
    planningAnalysis.portfolioGapMonthly > 0
  ) {
    recommendationLines.push(
      `Total kebutuhan target paralel saat ini lebih tinggi sekitar ${formatMoney(planningAnalysis.portfolioGapMonthly)}/bulan dari ruang tabung yang kebaca.`
    );
  }
  recommendationLines.push(
    data.user.budgetMode === BudgetMode.AUTO_FROM_TRANSACTIONS
      ? "Kirim catatan transaksi rutin supaya insight mingguan bisa makin presisi."
      : "Pantau pengeluaran tiap minggu supaya surplus bulanan tidak bocor."
  );
  if (!data.assets.length) {
    recommendationLines.push("Tambahkan aset nanti di dashboard biar progres target dan net worth lebih akurat.");
  }

  lines.push("", "Status:");
  for (const status of statusLines.slice(0, 4)) {
    lines.push(status);
  }

  lines.push("", "Saran awal:");
  recommendationLines
    .filter((line, index, items) => items.indexOf(line) === index)
    .slice(0, 3)
    .forEach((recommendation, index) => {
      lines.push(`${index + 1}. ${recommendation}`);
    });

  if (!data.assets.length) {
    lines.push("", "📌 Kalau aset ditambah nanti di dashboard, proyeksi target bisa saya rapihin lagi.");
  }

  return lines.join("\n").trim();
};

const buildPlanningGoalSummaries = (params: {
  orderedGoals: Array<{
    goalType: FinancialGoalType;
    goalName: string;
    targetAmount: number | null;
    targetMonth: number | null;
    targetYear: number | null;
    status: FinancialGoalStatus;
  }>;
  monthlySurplus: number | null;
  goalExecutionMode: GoalExecutionMode | null | undefined;
  priorityGoalType: FinancialGoalType | null | undefined;
  emergencyFundMappedProgress: number;
  emergencyFundTarget: number | null;
  financialFreedomTarget: number | null;
}) => {
  const monthlySurplus = Math.max(0, params.monthlySurplus ?? 0);
  const recommendedAllocationMode =
    params.goalExecutionMode ??
    (params.orderedGoals.length > 1 ? GoalExecutionMode.SEQUENTIAL : null);
  const priorityGoalType =
    params.priorityGoalType ?? params.orderedGoals[0]?.goalType ?? null;

  const standaloneSummaries = params.orderedGoals.map((goal) => {
    const resolvedTargetAmount = resolveGoalTargetAmount({
      goal,
      emergencyFundTarget: params.emergencyFundTarget,
      financialFreedomTarget: params.financialFreedomTarget
    });
    const currentSavedAmount =
      goal.goalType === FinancialGoalType.EMERGENCY_FUND ? params.emergencyFundMappedProgress : 0;
    const monthsUntilTarget = getMonthsUntilGoalTargetDate(goal.targetMonth, goal.targetYear);
    const targetDateLabel =
      goal.targetMonth && goal.targetYear
        ? MONTH_YEAR_FORMATTER.format(new Date(Date.UTC(goal.targetYear, goal.targetMonth - 1, 1, 12)))
        : null;
    const feasibility =
      resolvedTargetAmount !== null
        ? calculateTargetFeasibility({
            targetAmount: resolvedTargetAmount,
            currentSavedAmount,
            targetDate:
              goal.targetMonth && goal.targetYear
                ? {
                    month: goal.targetMonth,
                    year: goal.targetYear
                  }
                : null,
            monthlySurplus
          })
        : null;

    return {
      goal,
      resolvedTargetAmount,
      targetDateLabel,
      monthsUntilTarget,
      currentSavedAmount,
      feasibility
    };
  });

  const resolveStandaloneRequiredMonthly = (summary: (typeof standaloneSummaries)[number]) =>
    summary.feasibility?.requiredMonthly ??
    (summary.resolvedTargetAmount !== null
      ? getRequiredMonthlyAllocationForPriorityGoal({
          goal: summary.goal,
          targetAmount: Math.max(0, summary.resolvedTargetAmount - summary.currentSavedAmount),
          monthlyExpenseTotal: null
        })
      : null);

  const portfolioRequiredMonthlyAllocation =
    recommendedAllocationMode === GoalExecutionMode.PARALLEL
      ? standaloneSummaries.reduce((sum, summary) => sum + (resolveStandaloneRequiredMonthly(summary) ?? 0), 0)
      : null;
  const portfolioGapMonthly =
    portfolioRequiredMonthlyAllocation !== null
      ? Math.max(0, portfolioRequiredMonthlyAllocation - monthlySurplus)
      : null;
  const priorityStandaloneSummary =
    recommendedAllocationMode === GoalExecutionMode.PARALLEL && priorityGoalType
      ? standaloneSummaries.find((summary) => summary.goal.goalType === priorityGoalType) ?? null
      : null;
  const priorityGoalRequiredMonthly =
    (priorityStandaloneSummary ? resolveStandaloneRequiredMonthly(priorityStandaloneSummary) : null) ??
    (priorityStandaloneSummary
      ? getRequiredMonthlyAllocationForPriorityGoal({
          goal: priorityStandaloneSummary.goal,
          targetAmount: priorityStandaloneSummary.resolvedTargetAmount,
          monthlyExpenseTotal: null
        })
      : null);

  let sequentialStartOffsetMonths = 0;

  return standaloneSummaries.map((summary) => {
    const { goal, resolvedTargetAmount, targetDateLabel, monthsUntilTarget, currentSavedAmount, feasibility } = summary;
    const basis =
      recommendedAllocationMode === GoalExecutionMode.PARALLEL
        ? goal.goalType === priorityGoalType
          ? "PARALLEL_PRIORITY"
          : "PARALLEL_RESIDUAL"
        : sequentialStartOffsetMonths > 0
          ? "SEQUENTIAL_AFTER_PREVIOUS"
          : "FULL_SURPLUS";
    const startOffsetMonths =
      recommendedAllocationMode === GoalExecutionMode.PARALLEL ? 0 : sequentialStartOffsetMonths;
    const startLabel =
      startOffsetMonths > 0 ? getMonthYearLabelFromMonthOffset(startOffsetMonths + 1) : null;
    const availableMonthlyAllocation =
      recommendedAllocationMode === GoalExecutionMode.PARALLEL
        ? goal.goalType === priorityGoalType
          ? monthlySurplus
          : Math.max(0, monthlySurplus - Math.max(0, priorityGoalRequiredMonthly ?? 0))
        : monthlySurplus;
    const effectiveMonthsUntilTarget =
      monthsUntilTarget === null
        ? null
        : recommendedAllocationMode === GoalExecutionMode.PARALLEL
          ? monthsUntilTarget
          : monthsUntilTarget - startOffsetMonths;
    const evaluation =
      resolvedTargetAmount !== null
        ? calculateTargetFeasibilityForMonths({
            targetAmount: resolvedTargetAmount,
            currentSavedAmount,
            monthsUntilTarget: effectiveMonthsUntilTarget,
            monthlySurplus: availableMonthlyAllocation,
            monthOffsetForRealisticLabel: startOffsetMonths
          })
        : null;
    const deadlineMissedBeforeStart =
      effectiveMonthsUntilTarget !== null && effectiveMonthsUntilTarget <= 0;
    const evaluationRealisticMonths = evaluation?.realisticMonths ?? null;
    const realisticTargetRef =
      evaluationRealisticMonths !== null
        ? getMonthYearReferenceFromOffset(
            Math.max(0, startOffsetMonths) + evaluationRealisticMonths
          )
        : null;
    const startDateRef = getMonthYearReferenceFromOffset(
      startOffsetMonths > 0 ? startOffsetMonths + 1 : 1
    );

    const realisticDurationMonths =
      resolvedTargetAmount !== null
        ? calculateTargetFeasibilityForMonths({
            targetAmount: resolvedTargetAmount,
            currentSavedAmount,
            monthsUntilTarget: null,
            monthlySurplus,
            monthOffsetForRealisticLabel: 0
          }).realisticMonths
        : null;

    if (
      recommendedAllocationMode !== GoalExecutionMode.PARALLEL &&
      realisticDurationMonths !== null
    ) {
      sequentialStartOffsetMonths += realisticDurationMonths;
    }

    return {
      goalType: goal.goalType,
      goalName: goal.goalName,
      targetAmount: resolvedTargetAmount,
      currentSavedAmount,
      remainingAmount: evaluation?.remainingAmount ?? null,
      targetMonth: goal.targetMonth ?? null,
      targetYear: goal.targetYear ?? null,
      targetDateLabel,
      monthsUntilTarget,
      startOffsetMonths,
      startMonth: startDateRef?.month ?? null,
      startYear: startDateRef?.year ?? null,
      startLabel: startDateRef?.label ?? startLabel,
      effectiveMonthsUntilTarget:
        effectiveMonthsUntilTarget === null ? null : Math.max(0, Math.ceil(effectiveMonthsUntilTarget)),
      deadlineMissedBeforeStart,
      requiredMonthlyAllocation:
        evaluation !== null ? evaluation.requiredMonthly : feasibility?.requiredMonthly ?? null,
      availableMonthlyAllocation,
      gapMonthly: evaluation !== null ? evaluation.gap : null,
      feasible: evaluation !== null ? evaluation.feasible : null,
      realisticTargetMonth: realisticTargetRef?.month ?? null,
      realisticTargetYear: realisticTargetRef?.year ?? null,
      realisticTargetLabel: realisticTargetRef?.label ?? evaluation?.realisticTargetLabel ?? null,
      basis,
      portfolioRequiredMonthlyAllocation,
      portfolioGapMonthly
    } satisfies PlanningGoalSummary;
  });
};

export const evaluateTargetAgainstCurrentPlan = (params: {
  goal: PlanningGoalSummary;
  desiredDate?: MonthYearReference | null;
  userDecision?: TargetUserDecision;
}): TargetEvaluation => {
  const desiredDate =
    params.desiredDate ?? getMonthYearReference(params.goal.targetMonth, params.goal.targetYear);
  const realisticStartDate =
    getMonthYearReference(params.goal.startMonth, params.goal.startYear) ??
    getMonthYearReferenceFromOffset(1);
  const realisticEndDate =
    getMonthYearReference(params.goal.realisticTargetMonth, params.goal.realisticTargetYear) ??
    desiredDate;
  const userDecision = params.userDecision ?? "pending";

  let status: TargetEvaluationStatus = "feasible";
  if (params.goal.deadlineMissedBeforeStart) {
    status = "impossible_sequential";
  } else if ((params.goal.gapMonthly ?? 0) > 0) {
    status =
      params.goal.basis === "PARALLEL_PRIORITY" || params.goal.basis === "PARALLEL_RESIDUAL"
        ? "needs_parallel"
        : "aggressive";
  }

  const insight =
    status === "feasible"
      ? "Target ini masih aman di ritme sekarang."
      : status === "aggressive"
        ? "Agak ketat. Deadline atau setoran bulanannya masih perlu dirapikan."
        : status === "needs_parallel"
          ? "Perlu jalan paralel atau tambah setoran kalau deadline ini mau dipertahankan."
          : "Tidak feasible dalam mode berurutan. Target ini baru bisa mulai setelah prioritas sebelumnya beres.";

  return {
    goalType: params.goal.goalType,
    name: params.goal.goalName,
    amount: params.goal.targetAmount,
    desiredDate,
    realisticStartDate,
    realisticEndDate,
    requiredMonthlyForDesiredDate: params.goal.requiredMonthlyAllocation,
    allocatedMonthly: Math.max(0, params.goal.availableMonthlyAllocation),
    gapMonthly: params.goal.gapMonthly,
    status,
    userDecision,
    targetAmount: params.goal.targetAmount,
    targetDateLabel: params.goal.targetDateLabel,
    basis: params.goal.basis,
    insight
  };
};

export const buildSequentialTimeline = (evaluations: TargetEvaluation[]): TimelinePeriod[] => {
  const periods = evaluations.flatMap((evaluation) => {
    const startDate = evaluation.realisticStartDate;
    const desiredDate = evaluation.desiredDate;
    const realisticEndDate = evaluation.realisticEndDate;
    if (!startDate) return [];

    const endDate =
      evaluation.userDecision === "original"
        ? desiredDate ?? realisticEndDate
        : evaluation.status === "impossible_sequential"
          ? realisticEndDate
          : evaluation.userDecision === "realistic" && realisticEndDate
            ? realisticEndDate
            : desiredDate ?? realisticEndDate;

    if (!endDate) return [];

    const monthlyAllocation =
      evaluation.status === "aggressive" || evaluation.status === "needs_parallel"
        ? Math.max(
            0,
            evaluation.requiredMonthlyForDesiredDate ?? evaluation.allocatedMonthly
          )
        : Math.max(
            0,
            evaluation.userDecision === "realistic"
              ? evaluation.allocatedMonthly
              : evaluation.requiredMonthlyForDesiredDate ?? evaluation.allocatedMonthly
          );

    return [
      {
        goalType: evaluation.goalType,
        goalName: evaluation.name,
        startDate,
        endDate,
        desiredDate,
        realisticEndDate,
        monthlyAllocation,
        gapMonthly: evaluation.gapMonthly,
        status: evaluation.status,
        targetAmount: evaluation.amount,
        insight: evaluation.insight,
        userDecision: evaluation.userDecision
      } satisfies TimelinePeriod
    ];
  });

  return validateTimelinePeriods(periods);
};

export const validateTimelinePeriods = (periods: TimelinePeriod[]) =>
  periods.filter((period) => compareMonthYearReferences(period.startDate, period.endDate) <= 0);

export const generateShortTargetEvaluationCopy = (params: {
  evaluation: TargetEvaluation;
  monthlySurplus: number;
  previousGoalNames?: string[];
}): string => {
  const { evaluation } = params;
  const lines: string[] = [];

  if (params.previousGoalNames?.length) {
    lines.push(
      `Karena target sebelumnya masih ${joinGoalNames(params.previousGoalNames) ?? "ada target lain"}, proyeksi ${evaluation.name} ini saya hitung sambil mempertimbangkan target yang sudah ada.`
    );
  }

  if (evaluation.status === "impossible_sequential") {
    lines.push(
      `Dengan urutan sekarang, target ini belum masuk kalau dikejar satu per satu. Alokasi realistisnya baru kebuka sekitar ${evaluation.realisticStartDate?.label ?? "setelah target sebelumnya selesai"}.`
    );
    lines.push(`Ruang tabung sekarang sekitar ${formatMoney(params.monthlySurplus)}/bulan.`);
    if (evaluation.realisticEndDate?.label) {
      lines.push(`Versi realistisnya sekitar ${evaluation.realisticEndDate.label}.`);
    }
    lines.push(
      "Kalau tetap mau deadline ini, target perlu dibuat paralel atau nominalnya disesuaikan."
    );
    return lines.join("\n");
  }

  if (evaluation.status === "aggressive" || evaluation.status === "needs_parallel") {
    if (evaluation.requiredMonthlyForDesiredDate !== null) {
      lines.push(
        `Target ini cukup agresif. Kalau mau tetap ${evaluation.desiredDate?.label ?? "dengan target ini"}, perlu sekitar ${formatMoney(evaluation.requiredMonthlyForDesiredDate)}/bulan.`
      );
    }
    lines.push(
      `Ruang tabung sekarang sekitar ${formatMoney(params.monthlySurplus)}/bulan, jadi masih ada gap ${formatMoney(evaluation.gapMonthly ?? 0)}/bulan.`
    );
    if (evaluation.realisticEndDate?.label) {
      lines.push(`Versi realistisnya sekitar ${evaluation.realisticEndDate.label}.`);
    }
    return lines.join("\n");
  }

  if (evaluation.requiredMonthlyForDesiredDate !== null) {
    lines.push(
      `Dengan ruang tabung sekarang sekitar ${formatMoney(params.monthlySurplus)}/bulan, target ini masih realistis.`
    );
    lines.push(
      `Kebutuhan setoran bulanannya sekitar ${formatMoney(evaluation.requiredMonthlyForDesiredDate)}/bulan.`
    );
  }

  return lines.join("\n");
};

export const generateFinalTimelineCopy = (params: {
  evaluations: TargetEvaluation[];
  title?: string;
}) => {
  const periods = buildSequentialTimeline(params.evaluations);
  if (!periods.length) return null;

  const lines = [params.title ?? "🎯 Timeline Keuangan Boss:", ""];

  for (const period of periods) {
    const gapMonthly = period.gapMonthly ?? 0;
    const needsDeadlineWarning =
      period.desiredDate?.label &&
      (gapMonthly > 0 ||
        period.status === "aggressive" ||
        period.status === "needs_parallel" ||
        period.status === "impossible_sequential");

    lines.push(`📍 ${period.startDate.label} - ${period.endDate.label}`);
    lines.push(`Fokus: ${period.goalName}`);
    lines.push(`Nabung sekitar: ${formatMoney(period.monthlyAllocation)}/bulan`);
    if (period.targetAmount !== null) {
      lines.push(`Target tercapai: ${formatMoney(period.targetAmount)}`);
    }
    if (needsDeadlineWarning && period.desiredDate?.label) {
      lines.push(`Deadline versi Boss: ${period.desiredDate.label}`);
    }
    if (
      needsDeadlineWarning &&
      period.realisticEndDate?.label &&
      compareMonthYearReferences(period.realisticEndDate, period.endDate) !== 0
    ) {
      lines.push(`Versi realistis berurutan: ${period.realisticEndDate.label}`);
    }
    if (gapMonthly > 0) {
      lines.push(`Gap: ${formatMoney(gapMonthly)}/bulan`);
    }
    lines.push(
      `Insight: ${
        needsDeadlineWarning
          ? "Deadline ini saya simpan sebagai versi Boss, tapi perlu jalan paralel atau tambah setoran. Kalau benar-benar berurutan, target ini mengikuti prioritas sebelumnya."
          : period.insight
      }`
    );
    lines.push("");
  }

  if (periods.some((period) => period.status === "impossible_sequential")) {
    lines.push(
      "📌 Overall masih perlu penyesuaian, karena ada target yang tidak feasible kalau dikejar berurutan."
    );
  } else if (periods.some((period) => (period.gapMonthly ?? 0) > 0)) {
    lines.push(
      "📌 Overall agak ketat, karena masih ada target yang butuh deadline lebih longgar atau setoran tambahan."
    );
  } else {
    lines.push("📌 Overall aman, karena target-target ini masih masuk dalam kapasitas tabungan kamu.");
  }

  return lines.join("\n").trim();
};

export const buildOnboardingPlanningAnalysis = (params: {
  incomeStability: IncomeStability | null;
  monthlyIncomeTotal: number | null;
  monthlyExpenseTotal: number | null;
  goalExecutionMode?: GoalExecutionMode | null;
  priorityGoalType?: FinancialGoalType | null;
  goals: Array<{
    goalType: FinancialGoalType;
    goalName: string;
    targetAmount: number | null;
    targetMonth: number | null;
    targetYear: number | null;
    status: FinancialGoalStatus;
  }>;
  assets: Array<{
    assetType: AssetType;
    assetName: string;
    estimatedValue: number | null;
  }>;
}): OnboardingPlanningAnalysis => {
  const monthlyExpenseTotal = Math.max(0, params.monthlyExpenseTotal ?? 0);
  const monthlyIncomeTotal = Math.max(0, params.monthlyIncomeTotal ?? 0);
  const potentialMonthlySaving =
    params.monthlyIncomeTotal !== null && params.monthlyExpenseTotal !== null
      ? monthlyIncomeTotal - monthlyExpenseTotal
      : null;
  const emergencyMinimumTarget = monthlyExpenseTotal * 6;
  const emergencyRecommendedTarget =
    monthlyExpenseTotal * getEmergencyFundMultiplier(params.incomeStability);
  const activeGoals = params.goals.filter(
    (goal) =>
      goal.status === FinancialGoalStatus.ACTIVE ||
      goal.status === FinancialGoalStatus.PENDING_CALCULATION
  );
  const orderedGoals = [...activeGoals];
  const freedomGoal = activeGoals.find(
    (goal) => goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM
  );
  const allocationPlan =
    params.goalExecutionMode && params.priorityGoalType
      ? buildFinancialFreedomAllocationPlan({
          goals: activeGoals,
          potentialMonthlySaving,
          financialFreedomTarget: freedomGoal?.targetAmount ?? null,
          emergencyFundTarget: emergencyRecommendedTarget || null,
          monthlyExpenseTotal,
          goalExecutionMode: params.goalExecutionMode,
          priorityGoalType: params.priorityGoalType
        })
      : null;

  const assetMapping: OnboardingPlanningAnalysis["assetMapping"] = params.assets.map((asset) => ({
    assetName: asset.assetName,
    assetType: asset.assetType,
    estimatedValue: asset.estimatedValue,
    mappedUse:
      asset.assetType === AssetType.SAVINGS || asset.assetType === AssetType.CASH
        ? "EMERGENCY_BUFFER"
        : "LONG_TERM_BUFFER"
  }));

  const mappedEmergencyProgress = assetMapping
    .filter((asset) => asset.mappedUse === "EMERGENCY_BUFFER")
    .reduce((sum, asset) => sum + Math.max(0, asset.estimatedValue ?? 0), 0);

  const goalSummaries = buildPlanningGoalSummaries({
    orderedGoals,
    monthlySurplus: potentialMonthlySaving,
    goalExecutionMode: params.goalExecutionMode,
    priorityGoalType: params.priorityGoalType,
    emergencyFundMappedProgress: mappedEmergencyProgress,
    emergencyFundTarget: emergencyRecommendedTarget || null,
    financialFreedomTarget: freedomGoal?.targetAmount ?? null
  });

  return {
    activeGoalCount: activeGoals.length,
    recommendedPriorityOrder: orderedGoals.map((goal) => goal.goalName),
    recommendedAllocationMode:
      params.goalExecutionMode ?? (activeGoals.length > 1 ? GoalExecutionMode.SEQUENTIAL : null),
    selectedPriorityGoalType: params.priorityGoalType ?? orderedGoals[0]?.goalType ?? null,
    canFinancialFreedomBeCalculatedFinal:
      allocationPlan !== null &&
      (allocationPlan.projectionBasis === "FULL_SURPLUS" ||
        allocationPlan.projectionBasis === "RESIDUAL_AFTER_PRIORITY"),
    financialFreedomResidualMonthlyAllocation:
      allocationPlan?.projectionBasis === "RESIDUAL_AFTER_PRIORITY"
        ? allocationPlan.monthlyAllocation
        : null,
    portfolioRequiredMonthlyAllocation:
      goalSummaries[0]?.portfolioRequiredMonthlyAllocation ?? null,
    portfolioGapMonthly: goalSummaries[0]?.portfolioGapMonthly ?? null,
    suggestedNextQuestion: null,
    emergencyFund: {
      minimumTarget: emergencyMinimumTarget,
      recommendedTarget: emergencyRecommendedTarget,
      mappedProgressAmount: mappedEmergencyProgress
    },
    assetMapping,
    goalSummaries
  };
};

export const deriveEmploymentSummary = (employmentTypes: EmploymentType[]) => {
  if (!employmentTypes.length) {
    return {
      employmentType: null,
      incomeStability: null
    };
  }

  if (employmentTypes.length === 1) {
    const [only] = employmentTypes;
    return {
      employmentType: only,
      incomeStability:
        only === EmploymentType.EMPLOYEE
          ? IncomeStability.STABLE
          : only === EmploymentType.FREELANCER || only === EmploymentType.ENTREPRENEUR
            ? IncomeStability.UNSTABLE
            : IncomeStability.MIXED
    };
  }

  const hasStable = employmentTypes.includes(EmploymentType.EMPLOYEE);
  return {
    employmentType: EmploymentType.MIXED,
    incomeStability: hasStable ? IncomeStability.MIXED : IncomeStability.UNSTABLE
  };
};

export const parseManualBreakdownTotal = (breakdown: ExpenseBreakdown) => {
  if (!hasKnownExpenseBreakdown(breakdown)) return null;
  return sumBreakdown(breakdown);
};
