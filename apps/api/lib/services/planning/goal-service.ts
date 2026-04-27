import {
  FinancialGoalStatus,
  FinancialGoalType,
  GoalCalculationType
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

type GoalStatusItem = {
  goalId: string | null;
  goalName: string;
  goalType: FinancialGoalType | null;
  targetAmount: number;
  currentProgress: number;
  remainingAmount: number;
  progressPercent: number;
  estimatedMonthsToGoal: number | null;
  monthlyContributionPace: number | null;
  recommendedMonthlyContribution: number | null;
  recommendedAllocationShare: number | null;
  recentContributionTotal: number;
  lastContributionAt: Date | null;
  contributionActiveMonths: number;
  contributionMonthStreak: number;
  trackingStatus: "ON_TRACK" | "WATCH" | "OFF_TRACK";
  status: FinancialGoalStatus | "LEGACY";
  isPrimary: boolean;
  progressSource: "GOAL_CONTRIBUTIONS" | "NET_SAVINGS_PROXY";
};

type GoalRecommendationItem = {
  goalId: string | null;
  goalName: string;
  goalType: FinancialGoalType | null;
  recommendedMonthlyContribution: number;
  sharePercent: number;
};

export type GoalStatusSummary = {
  goalName: string | null;
  goalType: FinancialGoalType | null;
  targetAmount: number;
  currentProgress: number;
  remainingAmount: number;
  progressPercent: number;
  estimatedMonthsToGoal: number | null;
  monthlyContributionPace: number | null;
  totalGoals: number;
  goals: GoalStatusItem[];
  monthlySavingCapacity: number | null;
  recommendedPlan: GoalRecommendationItem[];
  goalNotFoundQuery?: string | null;
  progressSource: "GOAL_CONTRIBUTIONS" | "NET_SAVINGS_PROXY";
  contributionActiveMonths: number;
  contributionMonthStreak: number;
  trackingStatus: "ON_TRACK" | "WATCH" | "OFF_TRACK";
};

type GoalSelection = {
  goalName?: string | null;
  goalType?: FinancialGoalType | null;
  goalQuery?: string | null;
};

const SUPPORTED_FINANCIAL_GOAL_TYPES = [
  FinancialGoalType.EMERGENCY_FUND,
  FinancialGoalType.HOUSE,
  FinancialGoalType.VEHICLE,
  FinancialGoalType.VACATION,
  FinancialGoalType.CUSTOM
] as const;

const isSupportedFinancialGoalType = (
  goalType: FinancialGoalType | null | undefined
): goalType is (typeof SUPPORTED_FINANCIAL_GOAL_TYPES)[number] =>
  goalType != null &&
  SUPPORTED_FINANCIAL_GOAL_TYPES.includes(
    goalType as (typeof SUPPORTED_FINANCIAL_GOAL_TYPES)[number]
  );

const PRIMARY_GOAL_ORDER: FinancialGoalType[] = [
  FinancialGoalType.EMERGENCY_FUND,
  FinancialGoalType.HOUSE,
  FinancialGoalType.VEHICLE,
  FinancialGoalType.VACATION,
  FinancialGoalType.CUSTOM
];

const GOAL_PRIORITY_BASELINE: Partial<Record<FinancialGoalType, number>> = {
  EMERGENCY_FUND: 100,
  HOUSE: 85,
  VEHICLE: 72,
  VACATION: 60,
  CUSTOM: 65
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");
const normalizeGoalToken = (value: string) => normalizeText(value).toLowerCase();

const clampProgressPercent = (targetAmount: number, currentProgress: number) => {
  if (targetAmount <= 0) return 0;
  const value = (currentProgress / targetAmount) * 100;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

const getFinancialGoalModel = () => (prisma as { financialGoal?: any }).financialGoal;
const getSavingsGoalModel = () => (prisma as { savingsGoal?: any }).savingsGoal;
const getFinancialProfileModel = () => (prisma as { financialProfile?: any }).financialProfile;
const getGoalContributionModel = () => (prisma as { goalContribution?: any }).goalContribution;

const buildGoalStatus = (params: {
  goalName: string | null;
  goalType: FinancialGoalType | null;
  targetAmount: number;
  currentProgress: number;
  estimatedMonthsToGoal?: number | null;
  monthlyContributionPace?: number | null;
  totalGoals?: number;
  goals?: GoalStatusItem[];
  monthlySavingCapacity?: number | null;
  recommendedPlan?: GoalRecommendationItem[];
  goalNotFoundQuery?: string | null;
  progressSource?: "GOAL_CONTRIBUTIONS" | "NET_SAVINGS_PROXY";
  contributionActiveMonths?: number;
  contributionMonthStreak?: number;
  trackingStatus?: "ON_TRACK" | "WATCH" | "OFF_TRACK";
}): GoalStatusSummary => {
  const target = Math.max(0, params.targetAmount);
  const progress = Math.max(0, params.currentProgress);

  return {
    goalName: params.goalName ?? null,
    goalType: params.goalType ?? null,
    targetAmount: target,
    currentProgress: progress,
    remainingAmount: Math.max(0, target - progress),
    progressPercent: clampProgressPercent(target, progress),
    estimatedMonthsToGoal:
      params.estimatedMonthsToGoal != null && Number.isFinite(params.estimatedMonthsToGoal)
        ? Math.max(0, params.estimatedMonthsToGoal)
        : null,
    monthlyContributionPace:
      params.monthlyContributionPace != null && Number.isFinite(params.monthlyContributionPace)
        ? Math.max(0, params.monthlyContributionPace)
        : null,
    totalGoals: params.totalGoals ?? params.goals?.length ?? 0,
    goals: params.goals ?? [],
    monthlySavingCapacity:
      params.monthlySavingCapacity != null && Number.isFinite(params.monthlySavingCapacity)
        ? Math.max(0, params.monthlySavingCapacity)
        : null,
    recommendedPlan: params.recommendedPlan ?? [],
    goalNotFoundQuery: params.goalNotFoundQuery ?? null,
    progressSource: params.progressSource ?? "NET_SAVINGS_PROXY",
    contributionActiveMonths: params.contributionActiveMonths ?? 0,
    contributionMonthStreak: params.contributionMonthStreak ?? 0,
    trackingStatus: params.trackingStatus ?? "WATCH"
  };
};

const calculateNetSavings = async (userId: string) => {
  const [incomeAgg, expenseAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { userId, type: "INCOME" },
      _sum: { amount: true }
    }),
    prisma.transaction.aggregate({
      where: { userId, type: "EXPENSE" },
      _sum: { amount: true }
    })
  ]);

  const income = toNumber(incomeAgg._sum.amount ?? 0);
  const expense = toNumber(expenseAgg._sum.amount ?? 0);
  return Math.max(0, income - expense);
};

const calculateRecordedSavingTotal = async (userId: string) => {
  const savingAgg = await prisma.transaction.aggregate({
    where: { userId, type: "SAVING" },
    _sum: { amount: true }
  });

  return Math.max(0, toNumber(savingAgg._sum.amount ?? 0));
};

const GOAL_PACE_WINDOW_DAYS = 90;
const GOAL_RECENT_WINDOW_DAYS = 30;

const getGoalContributionProgress = async (userId: string) => {
  const goalContributionModel = getGoalContributionModel();
  if (!goalContributionModel) {
    return {
      hasAnyContributions: false,
      totalByGoal: new Map<string, number>(),
      monthlyPaceByGoal: new Map<string, number>(),
      recentTotalByGoal: new Map<string, number>(),
      lastContributionAtByGoal: new Map<string, Date>(),
      activeMonthsByGoal: new Map<string, number>(),
      monthStreakByGoal: new Map<string, number>()
    };
  }

  const contributions = await goalContributionModel.findMany({
    where: { userId },
    select: {
      goalId: true,
      amount: true,
      occurredAt: true
    }
  });

  const totalByGoal = new Map<string, number>();
  const monthlyPaceByGoal = new Map<string, number>();
  const recentTotalByGoal = new Map<string, number>();
  const lastContributionAtByGoal = new Map<string, Date>();
  const monthKeysByGoal = new Map<string, Set<string>>();
  const windowStart = new Date();
  windowStart.setUTCDate(windowStart.getUTCDate() - GOAL_PACE_WINDOW_DAYS);
  const recentWindowStart = new Date();
  recentWindowStart.setUTCDate(recentWindowStart.getUTCDate() - GOAL_RECENT_WINDOW_DAYS);

  for (const contribution of contributions) {
    const amount = Math.max(0, toNumber(contribution.amount));
    if (amount <= 0) continue;

    totalByGoal.set(contribution.goalId, (totalByGoal.get(contribution.goalId) ?? 0) + amount);

    if (contribution.occurredAt >= windowStart) {
      monthlyPaceByGoal.set(
        contribution.goalId,
        (monthlyPaceByGoal.get(contribution.goalId) ?? 0) + amount
      );
    }
    if (contribution.occurredAt >= recentWindowStart) {
      recentTotalByGoal.set(
        contribution.goalId,
        (recentTotalByGoal.get(contribution.goalId) ?? 0) + amount
      );
    }
    const latestContribution = lastContributionAtByGoal.get(contribution.goalId);
    if (!latestContribution || contribution.occurredAt > latestContribution) {
      lastContributionAtByGoal.set(contribution.goalId, contribution.occurredAt);
    }
    const monthKey = `${contribution.occurredAt.getUTCFullYear()}-${String(
      contribution.occurredAt.getUTCMonth() + 1
    ).padStart(2, "0")}`;
    const goalMonthSet = monthKeysByGoal.get(contribution.goalId) ?? new Set<string>();
    goalMonthSet.add(monthKey);
    monthKeysByGoal.set(contribution.goalId, goalMonthSet);
  }

  for (const [goalId, rollingAmount] of monthlyPaceByGoal.entries()) {
    monthlyPaceByGoal.set(goalId, (rollingAmount / GOAL_PACE_WINDOW_DAYS) * 30);
  }

  const activeMonthsByGoal = new Map<string, number>();
  const monthStreakByGoal = new Map<string, number>();
  const currentMonthIndex = new Date().getUTCFullYear() * 12 + new Date().getUTCMonth();
  for (const [goalId, monthKeys] of monthKeysByGoal.entries()) {
    activeMonthsByGoal.set(goalId, monthKeys.size);
    let streak = 0;
    for (let offset = 0; offset < 6; offset += 1) {
      const monthIndex = currentMonthIndex - offset;
      const year = Math.floor(monthIndex / 12);
      const month = monthIndex % 12;
      const key = `${year}-${String(month + 1).padStart(2, "0")}`;
      if (monthKeys.has(key)) {
        streak += 1;
        continue;
      }
      if (offset === 0) {
        break;
      }
      if (streak > 0) {
        break;
      }
    }
    monthStreakByGoal.set(goalId, streak);
  }

  return {
    hasAnyContributions: contributions.length > 0,
    totalByGoal,
    monthlyPaceByGoal,
    recentTotalByGoal,
    lastContributionAtByGoal,
    activeMonthsByGoal,
    monthStreakByGoal
  };
};

export const getMonthlySavingCapacity = async (userId: string) => {
  const financialProfileModel = getFinancialProfileModel();
  const profile = financialProfileModel
    ? await financialProfileModel.findUnique({
        where: { userId },
        select: { potentialMonthlySaving: true }
      })
    : null;

  const profileSaving = toNumber(profile?.potentialMonthlySaving ?? 0);
  if (profileSaving > 0) return profileSaving;

  return calculateNetSavings(userId);
};

const pickPrimaryGoal = <T extends { goalType: FinancialGoalType | null; id?: string }>(goals: T[]) => {
  for (const goalType of PRIMARY_GOAL_ORDER) {
    const match = goals.find((goal) => goal.goalType === goalType);
    if (match) return match;
  }

  return goals[0] ?? null;
};

const defaultGoalNameByType = (goalType: FinancialGoalType | null) => {
  if (goalType === FinancialGoalType.EMERGENCY_FUND) return "Dana Darurat";
  if (goalType === FinancialGoalType.HOUSE) return "Beli Rumah";
  if (goalType === FinancialGoalType.VEHICLE) return "Beli Kendaraan";
  if (goalType === FinancialGoalType.VACATION) return "Liburan";
  return "Target Tabungan";
};

const buildGoalItem = (params: {
  goalId?: string | null;
  goalName: string;
  goalType: FinancialGoalType | null;
  targetAmount: number;
  currentProgress: number;
  estimatedMonthsToGoal: number | null;
  monthlyContributionPace: number | null;
  recommendedMonthlyContribution?: number | null;
  recommendedAllocationShare?: number | null;
  recentContributionTotal?: number;
  lastContributionAt?: Date | null;
  status: FinancialGoalStatus | "LEGACY";
  isPrimary: boolean;
  progressSource: "GOAL_CONTRIBUTIONS" | "NET_SAVINGS_PROXY";
  contributionActiveMonths?: number;
  contributionMonthStreak?: number;
  trackingStatus?: "ON_TRACK" | "WATCH" | "OFF_TRACK";
}): GoalStatusItem => ({
  goalId: params.goalId ?? null,
  goalName: params.goalName,
  goalType: params.goalType,
  targetAmount: params.targetAmount,
  currentProgress: Math.max(0, params.currentProgress),
  remainingAmount: Math.max(0, params.targetAmount - params.currentProgress),
  progressPercent: clampProgressPercent(params.targetAmount, params.currentProgress),
  estimatedMonthsToGoal:
    params.estimatedMonthsToGoal != null && Number.isFinite(params.estimatedMonthsToGoal)
      ? Math.max(0, params.estimatedMonthsToGoal)
      : null,
  monthlyContributionPace:
    params.monthlyContributionPace != null && Number.isFinite(params.monthlyContributionPace)
      ? Math.max(0, params.monthlyContributionPace)
      : null,
  recommendedMonthlyContribution:
    params.recommendedMonthlyContribution != null && Number.isFinite(params.recommendedMonthlyContribution)
      ? Math.max(0, params.recommendedMonthlyContribution)
      : null,
  recommendedAllocationShare:
    params.recommendedAllocationShare != null && Number.isFinite(params.recommendedAllocationShare)
      ? Math.max(0, Math.min(100, params.recommendedAllocationShare))
      : null,
  recentContributionTotal: Math.max(0, params.recentContributionTotal ?? 0),
  lastContributionAt: params.lastContributionAt ?? null,
  contributionActiveMonths: Math.max(0, params.contributionActiveMonths ?? 0),
  contributionMonthStreak: Math.max(0, params.contributionMonthStreak ?? 0),
  trackingStatus: params.trackingStatus ?? "WATCH",
  status: params.status,
  isPrimary: params.isPrimary,
  progressSource: params.progressSource
});

const buildGoalPriorityWeight = (goal: GoalStatusItem) => {
  const typeWeight = goal.goalType ? GOAL_PRIORITY_BASELINE[goal.goalType] ?? 50 : 50;
  const remainingWeight = goal.remainingAmount > 0 ? Math.max(0, 20 - goal.remainingAmount / 50_000_000) : 25;
  const etaWeight =
    goal.estimatedMonthsToGoal != null
      ? Math.max(0, 18 - Math.min(goal.estimatedMonthsToGoal, 36) / 2)
      : 6;
  const progressWeight = goal.progressPercent >= 70 ? 10 : goal.progressPercent >= 40 ? 6 : 2;
  return Number((typeWeight + remainingWeight + etaWeight + progressWeight).toFixed(2));
};

const buildGoalRecommendationPlan = (
  goals: GoalStatusItem[],
  monthlySavingCapacity: number
): GoalRecommendationItem[] => {
  const eligibleGoals = goals.filter(
    (goal) => goal.targetAmount > 0 && goal.remainingAmount > 0 && goal.status !== FinancialGoalStatus.COMPLETED
  );
  if (!eligibleGoals.length || monthlySavingCapacity <= 0) return [];

  const weightedGoals = eligibleGoals.map((goal) => ({
    goal,
    weight: buildGoalPriorityWeight(goal)
  }));
  const totalWeight = weightedGoals.reduce((sum, item) => sum + item.weight, 0) || weightedGoals.length;

  let allocatedSoFar = 0;
  return weightedGoals.map((item, index) => {
    const recommendedMonthlyContribution =
      index === weightedGoals.length - 1
        ? Math.max(0, monthlySavingCapacity - allocatedSoFar)
        : Math.max(0, Math.round((monthlySavingCapacity * item.weight) / totalWeight));
    allocatedSoFar += recommendedMonthlyContribution;
    const sharePercent = monthlySavingCapacity > 0 ? (recommendedMonthlyContribution / monthlySavingCapacity) * 100 : 0;
    return {
      goalId: item.goal.goalId,
      goalName: item.goal.goalName,
      goalType: item.goal.goalType,
      recommendedMonthlyContribution,
      sharePercent: Number(sharePercent.toFixed(1))
    };
  });
};

const resolveGoalTrackingStatus = (goal: GoalStatusItem) => {
  if (goal.progressSource === "NET_SAVINGS_PROXY") return "WATCH" as const;
  if (goal.progressPercent >= 100) return "ON_TRACK" as const;

  const recommendedMonthlyContribution = goal.recommendedMonthlyContribution ?? 0;
  const monthlyContributionPace = goal.monthlyContributionPace ?? 0;
  const paceRatio =
    recommendedMonthlyContribution > 0
      ? monthlyContributionPace / recommendedMonthlyContribution
      : 0;

  if (goal.contributionMonthStreak >= 3 || paceRatio >= 0.9) {
    return "ON_TRACK" as const;
  }
  if (
    goal.recentContributionTotal > 0 ||
    goal.contributionMonthStreak >= 1 ||
    paceRatio >= 0.45 ||
    goal.contributionActiveMonths >= 2
  ) {
    return "WATCH" as const;
  }
  return "OFF_TRACK" as const;
};

const matchesGoalSelection = (
  goal: { goalName: string; goalType: FinancialGoalType | null },
  selection?: GoalSelection
) => {
  if (!selection?.goalQuery && !selection?.goalName && !selection?.goalType) return true;
  if (selection.goalType && goal.goalType === selection.goalType) return true;

  const candidateTokens = [
    goal.goalName,
    defaultGoalNameByType(goal.goalType)
  ]
    .filter(Boolean)
    .map(normalizeGoalToken);

  const queryTokens = [selection.goalQuery, selection.goalName]
    .filter(Boolean)
    .map((value) => normalizeGoalToken(value as string));

  return queryTokens.some((queryToken) =>
    candidateTokens.some(
      (candidateToken) => candidateToken.includes(queryToken) || queryToken.includes(candidateToken)
    )
  );
};

const syncLegacySavingsGoal = async (userId: string, primaryGoal: GoalStatusItem | null) => {
  const savingsGoalModel = getSavingsGoalModel();
  if (!savingsGoalModel || !primaryGoal || primaryGoal.targetAmount <= 0) return;

  await savingsGoalModel.upsert({
    where: { userId },
    update: {
      targetAmount: primaryGoal.targetAmount,
      currentProgress: primaryGoal.currentProgress
    },
    create: {
      userId,
      targetAmount: primaryGoal.targetAmount,
      currentProgress: primaryGoal.currentProgress
    }
  });
};

const syncFinancialGoalEstimates = async (userId: string, monthlySavingCapacity: number) => {
  const financialGoalModel = getFinancialGoalModel();
  if (!financialGoalModel) return;

  const [goals, contributionProgress] = await Promise.all([
    financialGoalModel.findMany({
      where: {
        userId,
        status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] }
      }
    }),
    getGoalContributionProgress(userId)
  ]);

  await Promise.all(
    goals
      .filter((goal: any) => isSupportedFinancialGoalType(goal.goalType as FinancialGoalType))
      .map((goal: any) => {
        const targetAmount = toNumber(goal.targetAmount ?? 0);
        const goalCurrentProgress = contributionProgress.hasAnyContributions
          ? contributionProgress.totalByGoal.get(goal.id) ?? 0
          : 0;
        const remainingAmount = contributionProgress.hasAnyContributions
          ? Math.max(0, targetAmount - goalCurrentProgress)
          : targetAmount;
        const goalMonthlyPace =
          contributionProgress.monthlyPaceByGoal.get(goal.id) ??
          (contributionProgress.hasAnyContributions ? null : monthlySavingCapacity);
        const estimatedMonthsToGoal =
          remainingAmount > 0 && goalMonthlyPace && goalMonthlyPace > 0
            ? Number((remainingAmount / goalMonthlyPace).toFixed(2))
            : null;

        return financialGoalModel.update({
          where: { id: goal.id },
          data: {
            estimatedMonthsToGoal
          }
        });
      })
  );
};

const getFinancialGoalStatuses = async (userId: string) => {
  const financialGoalModel = getFinancialGoalModel();
  if (!financialGoalModel) return [];

  const [goals, netSavings, monthlySavingCapacity, contributionProgress] = await Promise.all([
    financialGoalModel.findMany({
      where: {
        userId,
        status: {
          in: [
            FinancialGoalStatus.ACTIVE,
            FinancialGoalStatus.PENDING_CALCULATION,
            FinancialGoalStatus.COMPLETED
          ]
        }
      },
      orderBy: { createdAt: "asc" }
    }),
    calculateNetSavings(userId),
    getMonthlySavingCapacity(userId),
    getGoalContributionProgress(userId)
  ]);

  const eligibleGoals = goals.filter(
    (goal: any) =>
      isSupportedFinancialGoalType(goal.goalType as FinancialGoalType) &&
      toNumber(goal.targetAmount ?? 0) > 0
  );
  if (!eligibleGoals.length) return [];

  const primary = pickPrimaryGoal(eligibleGoals);
  const singleGoalMode = eligibleGoals.length === 1;

  const rawItems = eligibleGoals.map((goal: any) => {
    const targetAmount = toNumber(goal.targetAmount);
    const contributionProgressValue = contributionProgress.totalByGoal.get(goal.id) ?? 0;
    const currentProgress = contributionProgress.hasAnyContributions
      ? contributionProgressValue
      : netSavings;
    const monthlyContributionPace =
      contributionProgress.monthlyPaceByGoal.get(goal.id) ??
      (contributionProgress.hasAnyContributions
        ? singleGoalMode
          ? monthlySavingCapacity
          : null
        : monthlySavingCapacity);
    const remainingAmount = Math.max(0, targetAmount - currentProgress);
    const estimatedMonthsToGoal =
      goal.estimatedMonthsToGoal !== null
        ? toNumber(goal.estimatedMonthsToGoal)
        : monthlyContributionPace && monthlyContributionPace > 0
          ? Number((remainingAmount / monthlyContributionPace).toFixed(2))
          : null;

    return buildGoalItem({
      goalId: goal.id,
      goalName: goal.goalName,
      goalType: goal.goalType as FinancialGoalType,
      targetAmount,
      currentProgress,
      estimatedMonthsToGoal,
      monthlyContributionPace,
      recentContributionTotal: contributionProgress.recentTotalByGoal.get(goal.id) ?? 0,
      lastContributionAt: contributionProgress.lastContributionAtByGoal.get(goal.id) ?? null,
      contributionActiveMonths: contributionProgress.activeMonthsByGoal.get(goal.id) ?? 0,
      contributionMonthStreak: contributionProgress.monthStreakByGoal.get(goal.id) ?? 0,
      status: goal.status,
      isPrimary: primary?.id === goal.id,
      progressSource: contributionProgress.hasAnyContributions
        ? "GOAL_CONTRIBUTIONS"
        : "NET_SAVINGS_PROXY"
    });
  });

  const recommendationPlan = buildGoalRecommendationPlan(rawItems, monthlySavingCapacity);
  const recommendationByGoalId = new Map(
    recommendationPlan.map((item: GoalRecommendationItem) => [item.goalId ?? item.goalName, item])
  );

  return rawItems.map((item: GoalStatusItem) => {
    const recommendation =
      recommendationByGoalId.get(item.goalId ?? item.goalName) ?? null;
    return {
      ...item,
      recommendedMonthlyContribution: recommendation?.recommendedMonthlyContribution ?? null,
      recommendedAllocationShare: recommendation?.sharePercent ?? null,
      trackingStatus: resolveGoalTrackingStatus({
        ...item,
        recommendedMonthlyContribution: recommendation?.recommendedMonthlyContribution ?? null,
        recommendedAllocationShare: recommendation?.sharePercent ?? null
      })
    };
  });
};

const getLegacyGoalStatus = async (userId: string): Promise<GoalStatusSummary> => {
  const savingsGoalModel = getSavingsGoalModel();
  const [netSavings, monthlySavingCapacity, recordedSavingTotal] = await Promise.all([
    calculateNetSavings(userId),
    getMonthlySavingCapacity(userId),
    calculateRecordedSavingTotal(userId)
  ]);
  const existingLegacyGoal =
    savingsGoalModel?.findUnique != null
      ? await savingsGoalModel.findUnique({
          where: { userId },
          select: {
            targetAmount: true,
            currentProgress: true
          }
        })
      : null;
  const explicitLegacyProgress = Math.max(
    toNumber(existingLegacyGoal?.currentProgress ?? 0),
    recordedSavingTotal
  );
  const resolvedLegacyProgress = explicitLegacyProgress > 0 ? explicitLegacyProgress : netSavings;

  if (!savingsGoalModel) {
    return buildGoalStatus({
      goalName: null,
      goalType: null,
      targetAmount: 0,
      currentProgress: resolvedLegacyProgress,
      monthlyContributionPace: monthlySavingCapacity,
      monthlySavingCapacity,
      progressSource: "NET_SAVINGS_PROXY"
    });
  }

  const goal = await savingsGoalModel.upsert({
    where: { userId },
    update: {
      currentProgress: resolvedLegacyProgress
    },
    create: {
      userId,
      targetAmount: 0,
      currentProgress: resolvedLegacyProgress
    }
  });

  const goalItem = buildGoalItem({
    goalId: null,
    goalName: "Target Tabungan",
    goalType: null,
    targetAmount: toNumber(goal.targetAmount),
    currentProgress: toNumber(goal.currentProgress),
    estimatedMonthsToGoal: null,
    monthlyContributionPace: monthlySavingCapacity,
    recommendedMonthlyContribution: monthlySavingCapacity > 0 ? monthlySavingCapacity : null,
    recommendedAllocationShare: monthlySavingCapacity > 0 ? 100 : null,
    status: "LEGACY",
    isPrimary: true,
    progressSource: "NET_SAVINGS_PROXY",
    contributionActiveMonths: 0,
    contributionMonthStreak: 0,
    trackingStatus: "WATCH"
  });

  return buildGoalStatus({
    goalName: goalItem.goalName,
    goalType: goalItem.goalType,
    targetAmount: goalItem.targetAmount,
    currentProgress: goalItem.currentProgress,
    estimatedMonthsToGoal: goalItem.estimatedMonthsToGoal,
    monthlyContributionPace: goalItem.monthlyContributionPace,
    totalGoals: 1,
    monthlySavingCapacity,
    goals: [goalItem],
    recommendedPlan:
      monthlySavingCapacity > 0
        ? [
            {
              goalId: null,
              goalName: goalItem.goalName,
              goalType: goalItem.goalType,
              recommendedMonthlyContribution: monthlySavingCapacity,
              sharePercent: 100
            }
          ]
        : [],
    progressSource: "NET_SAVINGS_PROXY",
    contributionActiveMonths: goalItem.contributionActiveMonths,
    contributionMonthStreak: goalItem.contributionMonthStreak,
    trackingStatus: goalItem.trackingStatus
  });
};

const summarizeGoalStatuses = (
  goalItems: GoalStatusItem[],
  selection?: GoalSelection,
  monthlySavingCapacity?: number | null
): GoalStatusSummary => {
  const filteredGoals = goalItems.filter((goal) => matchesGoalSelection(goal, selection));
  const selectedGoals = filteredGoals.length ? filteredGoals : goalItems;
  const primary = pickPrimaryGoal(
    selectedGoals.map((goal) => ({
      ...goal,
      goalType: goal.goalType
    }))
  );
  const selectedPrimary =
    selectedGoals.find((goal) => goal.goalName === primary?.goalName && goal.goalType === primary?.goalType) ??
    selectedGoals[0];

  return buildGoalStatus({
    goalName: selectedPrimary?.goalName ?? null,
    goalType: selectedPrimary?.goalType ?? null,
    targetAmount: selectedPrimary?.targetAmount ?? 0,
    currentProgress: selectedPrimary?.currentProgress ?? 0,
    estimatedMonthsToGoal: selectedPrimary?.estimatedMonthsToGoal ?? null,
    monthlyContributionPace: selectedPrimary?.monthlyContributionPace ?? null,
    totalGoals: selectedGoals.length,
    monthlySavingCapacity: monthlySavingCapacity ?? null,
    goals: selectedGoals,
    recommendedPlan: selectedGoals
      .filter((goal) => (goal.recommendedMonthlyContribution ?? 0) > 0)
      .map((goal) => ({
        goalId: goal.goalId,
        goalName: goal.goalName,
        goalType: goal.goalType,
        recommendedMonthlyContribution: goal.recommendedMonthlyContribution ?? 0,
        sharePercent: goal.recommendedAllocationShare ?? 0
      })),
    goalNotFoundQuery:
      filteredGoals.length === 0 && (selection?.goalQuery || selection?.goalName)
        ? selection.goalQuery ?? selection.goalName ?? null
        : null,
    progressSource: selectedPrimary?.progressSource ?? "NET_SAVINGS_PROXY",
    contributionActiveMonths: selectedPrimary?.contributionActiveMonths ?? 0,
    contributionMonthStreak: selectedPrimary?.contributionMonthStreak ?? 0,
    trackingStatus: selectedPrimary?.trackingStatus ?? "WATCH"
  });
};

const findExistingGoalForSet = async (params: {
  userId: string;
  goalType: FinancialGoalType | null;
  goalName: string | null;
}) => {
  const financialGoalModel = getFinancialGoalModel();
  if (!financialGoalModel) return null;
  const normalizedGoalType = isSupportedFinancialGoalType(params.goalType) ? params.goalType : null;

  if (normalizedGoalType && normalizedGoalType !== FinancialGoalType.CUSTOM) {
    return financialGoalModel.findFirst({
      where: {
        userId: params.userId,
        goalType: normalizedGoalType,
        status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  if (!params.goalName) return null;
  const queryToken = normalizeGoalToken(params.goalName);
  const goals = await financialGoalModel.findMany({
    where: {
      userId: params.userId,
      goalType: FinancialGoalType.CUSTOM,
      status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] }
    },
    orderBy: { createdAt: "desc" }
  });

  return (
    goals.find((goal: any) => normalizeGoalToken(goal.goalName) === queryToken) ??
    goals.find((goal: any) => normalizeGoalToken(goal.goalName).includes(queryToken)) ??
    null
  );
};

const findGoalForSelection = async (params: {
  userId: string;
  selection?: GoalSelection;
}) => {
  const financialGoalModel = getFinancialGoalModel();
  if (!financialGoalModel) return null;

  const goals = await financialGoalModel.findMany({
    where: {
      userId: params.userId,
      status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] }
    },
    orderBy: { createdAt: "asc" }
  });

  if (!goals.length) return null;

  const filteredGoals = goals.filter(
    (goal: any) =>
      isSupportedFinancialGoalType(goal.goalType as FinancialGoalType) &&
      matchesGoalSelection(
        {
          goalName: goal.goalName,
          goalType: goal.goalType as FinancialGoalType
        },
        params.selection
      )
  );

  if (filteredGoals.length === 1) return filteredGoals[0];
  if (filteredGoals.length > 1) {
    return pickPrimaryGoal(filteredGoals) ?? filteredGoals[0];
  }

  return null;
};

const hasAnyActiveFinancialGoal = async (userId: string) => {
  const financialGoalModel = getFinancialGoalModel();
  if (!financialGoalModel) return false;

  const goals = await financialGoalModel.findMany({
    where: {
      userId,
      status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] }
    },
    orderBy: { createdAt: "asc" }
  });

  return goals.some((goal: any) =>
    isSupportedFinancialGoalType(goal.goalType as FinancialGoalType)
  );
};

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

export const setSavingsGoalTarget = async (
  userId: string,
  targetAmount: number,
  selection?: GoalSelection
) => {
  const financialGoalModel = getFinancialGoalModel();
  const normalizedTarget = Math.max(0, Math.round(targetAmount));
  const selectedGoalType = isSupportedFinancialGoalType(selection?.goalType)
    ? (selection?.goalType ?? null)
    : null;
  const goalType = selectedGoalType ?? FinancialGoalType.CUSTOM;
  const goalName = selection?.goalName ?? defaultGoalNameByType(selectedGoalType);
  const netSavings = await calculateNetSavings(userId);

  if (financialGoalModel) {
    const existingGoal = await findExistingGoalForSet({
      userId,
      goalType,
      goalName
    });

    if (existingGoal) {
      await financialGoalModel.update({
        where: { id: existingGoal.id },
        data: {
          goalName,
          targetAmount: normalizedTarget,
          status: FinancialGoalStatus.ACTIVE,
          calculationType: GoalCalculationType.MANUAL
        }
      });
    } else {
      await financialGoalModel.create({
        data: {
          userId,
          goalType,
          goalName,
          targetAmount: normalizedTarget,
          calculationType: GoalCalculationType.MANUAL,
          status: FinancialGoalStatus.ACTIVE
        }
      });
    }
  }

  const savingsGoalModel = getSavingsGoalModel();
  if (savingsGoalModel) {
    await savingsGoalModel.upsert({
      where: { userId },
      update: {
        targetAmount: normalizedTarget,
        currentProgress: netSavings
      },
      create: {
        userId,
        targetAmount: normalizedTarget,
        currentProgress: netSavings
      }
    });
  }

  return getSavingsGoalStatus(userId, {
    goalName,
    goalType,
    goalQuery: selection?.goalQuery ?? goalName
  });
};

export const addGoalContribution = async (
  userId: string,
  amount: number,
  selection?: GoalSelection
) => {
  const financialGoalModel = getFinancialGoalModel();
  const goalContributionModel = getGoalContributionModel();
  const normalizedAmount = Math.max(0, Math.round(amount));
  if (normalizedAmount <= 0) {
    return {
      contributionAmount: 0,
      goalStatus: await getSavingsGoalStatus(userId, selection)
    };
  }

  if (!financialGoalModel || !goalContributionModel) {
    const savingsGoalModel = getSavingsGoalModel();
    if (savingsGoalModel) {
      await savingsGoalModel.upsert({
        where: { userId },
        update: {
          currentProgress: {
            increment: normalizedAmount
          }
        },
        create: {
          userId,
          targetAmount: 0,
          currentProgress: normalizedAmount
        }
      });
    }

    return {
      contributionAmount: normalizedAmount,
      goalStatus: await getSavingsGoalStatus(userId, selection)
    };
  }

  const goal = await findGoalForSelection({
    userId,
    selection
  });

  if (!goal) {
    const hasActiveGoals = await hasAnyActiveFinancialGoal(userId);
    if (!hasActiveGoals) {
      const savingsGoalModel = getSavingsGoalModel();
      if (savingsGoalModel) {
        await savingsGoalModel.upsert({
          where: { userId },
          update: {
            currentProgress: {
              increment: normalizedAmount
            }
          },
          create: {
            userId,
            targetAmount: 0,
            currentProgress: normalizedAmount
          }
        });
      }

      return {
        contributionAmount: normalizedAmount,
        goalStatus: await getSavingsGoalStatus(userId, selection),
        goalCompleted: false
      };
    }

    const goalStatus = await getSavingsGoalStatus(userId);
    return {
      contributionAmount: normalizedAmount,
      goalStatus: {
        ...goalStatus,
        goalNotFoundQuery: selection?.goalQuery ?? selection?.goalName ?? null
      },
      goalCompleted: false
    };
  }

  await goalContributionModel.create({
    data: {
      userId,
      goalId: goal.id,
      amount: normalizedAmount,
      note: selection?.goalQuery ?? selection?.goalName ?? null
    }
  });

  const goalStatus = await getSavingsGoalStatus(userId, {
    goalName: goal.goalName,
    goalType: goal.goalType as FinancialGoalType,
    goalQuery: selection?.goalQuery ?? goal.goalName
  });

  if (goalStatus.targetAmount > 0 && goalStatus.currentProgress >= goalStatus.targetAmount) {
    await financialGoalModel.update({
      where: { id: goal.id },
      data: {
        status: FinancialGoalStatus.COMPLETED,
        estimatedMonthsToGoal: 0
      }
    });

    return {
      contributionAmount: normalizedAmount,
      goalStatus: {
        ...goalStatus,
        estimatedMonthsToGoal: 0
      },
      goalCompleted: true
    };
  }

  return {
    contributionAmount: normalizedAmount,
    goalStatus,
    goalCompleted: false
  };
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
