import { FinancialGoalType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getMonthlySavingCapacity,
  getSavingsGoalStatus,
  type GoalStatusSummary
} from "@/lib/services/planning/goal-service";
import { formatMoney } from "@/lib/services/shared/money-format";
import { formatDurationFromMonths } from "@/lib/services/shared/projection-math-service";

export type GoalPlannerMode =
  | "FOCUS"
  | "SPLIT"
  | "PRIORITY"
  | "FOCUS_DURATION"
  | "SPLIT_RATIO"
  | "EXPENSE_GROWTH";

type GoalPlannerInput = {
  userId: string;
  mode: GoalPlannerMode;
  goalQuery?: string | null;
  goalType?: FinancialGoalType | null;
  focusMonths?: number | null;
  splitRatio?: { primary: number; secondary: number } | null;
  annualExpenseGrowthRate?: number | null;
};

type GoalPlanCandidate = GoalStatusSummary["goals"][number] & {
  priorityScore: number;
  recommendedAllocation: number;
  projectedEtaMonths: number | null;
};

const PRIORITY_BASELINE: Partial<Record<FinancialGoalType, number>> = {
  EMERGENCY_FUND: 100,
  HOUSE: 85,
  VEHICLE: 72,
  VACATION: 60,
  CUSTOM: 65
};

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

const toNumber = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const roundToTwoDecimals = (value: number) => Math.round(value * 100) / 100;

const buildGoalPriorityScore = (goal: GoalStatusSummary["goals"][number]) => {
  const typeScore = goal.goalType ? PRIORITY_BASELINE[goal.goalType] ?? 50 : 50;
  const remainingWeight = goal.remainingAmount > 0 ? Math.max(0, 20 - goal.remainingAmount / 50_000_000) : 25;
  const etaWeight =
    goal.estimatedMonthsToGoal != null
      ? Math.max(0, 18 - Math.min(goal.estimatedMonthsToGoal, 36) / 2)
      : 6;
  const progressWeight = goal.progressPercent >= 70 ? 10 : goal.progressPercent >= 40 ? 6 : 2;

  return Number((typeScore + remainingWeight + etaWeight + progressWeight).toFixed(2));
};

const buildEqualSplitAllocation = (monthlySavingCapacity: number, goals: GoalPlanCandidate[]) => {
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

const buildRatioAllocation = (
  monthlySavingCapacity: number,
  goals: GoalPlanCandidate[],
  splitRatio: { primary: number; secondary: number }
) => {
  if (!goals.length || monthlySavingCapacity <= 0) return goals;
  const primaryGoal = goals[0];
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

const buildFocusedAllocation = (
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

const selectGoalCandidates = async (params: GoalPlannerInput) => {
  const allGoalsSummary = await getSavingsGoalStatus(params.userId);
  const activeGoals = allGoalsSummary.goals.filter((goal) => goal.targetAmount > 0 && goal.remainingAmount > 0);

  const monthlySavingCapacity = await getMonthlySavingCapacity(params.userId);

  const candidates = activeGoals.map((goal) => ({
    ...goal,
    priorityScore: buildGoalPriorityScore(goal),
    recommendedAllocation: 0,
    projectedEtaMonths: goal.estimatedMonthsToGoal
  }));

  return {
    summary: allGoalsSummary,
    candidates,
    monthlySavingCapacity
  };
};

const getFinancialProfileModel = () => (prisma as { financialProfile?: any }).financialProfile;

const buildPriorityReason = (goal: GoalPlanCandidate) => {
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

const simulateExpenseGrowthEta = async (params: {
  userId: string;
  goal: GoalPlanCandidate;
  annualExpenseGrowthRate: number;
  fallbackMonthlySavingCapacity: number;
}) => {
  const financialProfileModel = getFinancialProfileModel();
  const profile = financialProfileModel
    ? await financialProfileModel.findUnique({
        where: { userId: params.userId },
        select: {
          monthlyIncomeTotal: true,
          monthlyExpenseTotal: true
        }
      })
    : null;

  const monthlyExpense = toNumber(profile?.monthlyExpenseTotal ?? 0);
  const monthlyIncome = toNumber(profile?.monthlyIncomeTotal ?? 0);
  const incomeBaseline =
    monthlyIncome > 0 ? monthlyIncome : monthlyExpense + params.fallbackMonthlySavingCapacity;

  if (incomeBaseline <= 0 || monthlyExpense <= 0) {
    return null;
  }

  const monthlyGrowthFactor = Math.pow(1 + params.annualExpenseGrowthRate / 100, 1 / 12);
  let currentExpense = monthlyExpense;
  let progress = 0;
  let month = 0;

  while (progress < params.goal.remainingAmount && month < 600) {
    const monthlySaving = Math.max(0, incomeBaseline - currentExpense);
    if (monthlySaving <= 0) return null;
    progress += monthlySaving;
    currentExpense *= monthlyGrowthFactor;
    month += 1;
  }

  if (progress < params.goal.remainingAmount) return null;
  return month;
};

export const buildGoalPlannerReply = async (params: GoalPlannerInput) => {
  const { summary, candidates, monthlySavingCapacity } = await selectGoalCandidates(params);

  if (!candidates.length) {
    return "Belum ada goal aktif yang bisa direncanakan. Set goal dulu, baru saya bantu urutkan prioritas dan pembagian tabungannya.";
  }

  if (monthlySavingCapacity <= 0) {
    return "Saya belum melihat ruang tabungan bulanan yang cukup untuk menyusun rencana goal. Rapikan cashflow atau lengkapi profil penghasilan dan pengeluaran dulu ya.";
  }

  const sortedByPriority = [...candidates].sort(
    (left, right) => right.priorityScore - left.priorityScore || left.remainingAmount - right.remainingAmount
  );
  const focusedGoal =
    params.goalQuery || params.goalType
      ? sortedByPriority.find((goal) => {
          const goalTokens = [goal.goalName, goal.goalType ?? ""].map((item) => normalizeText(String(item)));
          const queryTokens = [params.goalQuery ?? "", params.goalType ?? ""]
            .map((item) => normalizeText(String(item)))
            .filter(Boolean);
          return queryTokens.some((queryToken) =>
            goalTokens.some(
              (goalToken) => goalToken.includes(queryToken) || queryToken.includes(goalToken)
            )
          );
        }) ?? null
      : sortedByPriority[0] ?? null;

  if ((params.goalQuery || params.goalType) && !focusedGoal) {
    return `Saya belum menemukan goal yang cocok dengan "${params.goalQuery ?? params.goalType}". Coba cek status goal aktif dulu ya Boss.`;
  }

  if (params.mode === "FOCUS_DURATION" && focusedGoal) {
    const focusMonths = Math.max(1, Math.min(24, params.focusMonths ?? 6));
    const focusProgress = Math.min(focusedGoal.remainingAmount, monthlySavingCapacity * focusMonths);
    const remainingAfterFocus = Math.max(0, focusedGoal.remainingAmount - focusProgress);
    const splitPlan = buildEqualSplitAllocation(monthlySavingCapacity, sortedByPriority);
    const focusedSplitAllocation =
      splitPlan.find((goal) => goal.goalName === focusedGoal.goalName)?.recommendedAllocation ?? 0;
    const focusedEtaAfterDuration =
      remainingAfterFocus <= 0
        ? roundToTwoDecimals(focusedGoal.remainingAmount / monthlySavingCapacity)
        : focusedSplitAllocation > 0
          ? roundToTwoDecimals(focusMonths + remainingAfterFocus / focusedSplitAllocation)
          : null;

    return [
      `Kalau fokus ${focusedGoal.goalName} selama ${focusMonths} bulan dulu:`,
      `- Kapasitas tabungan bulanan: ${formatMoney(monthlySavingCapacity)}`,
      `- Dana yang masuk ke ${focusedGoal.goalName} selama fase fokus: ${formatMoney(focusProgress)}`,
      ...(focusedEtaAfterDuration != null
        ? [`- ETA ${focusedGoal.goalName}: ${formatDurationFromMonths(focusedEtaAfterDuration)}`]
        : []),
      "- Setelah fase fokus, pembagian balik ke mode split normal:",
      ...splitPlan
        .slice(0, 4)
        .map(
          (goal) =>
            `${goal.goalName} | alokasi ${formatMoney(goal.recommendedAllocation)}${
              goal.projectedEtaMonths != null ? ` | eta ${formatDurationFromMonths(goal.projectedEtaMonths)}` : ""
            }`
        )
    ].join("\n");
  }

  if (params.mode === "SPLIT_RATIO") {
    const splitRatio = params.splitRatio ?? { primary: 60, secondary: 40 };
    const ratioPlan = buildRatioAllocation(monthlySavingCapacity, sortedByPriority, splitRatio);
    const pausedGoals = ratioPlan.filter((goal, index) => index >= 2);

    return [
      `Kalau tabungan dibagi ${splitRatio.primary}:${splitRatio.secondary}, simulasi paling aman sekarang begini:`,
      `- Kapasitas tabungan bulanan: ${formatMoney(monthlySavingCapacity)}`,
      ...ratioPlan.slice(0, 2).map(
        (goal, index) =>
          `${index + 1}. ${goal.goalName} | alokasi ${formatMoney(goal.recommendedAllocation)}${
            goal.projectedEtaMonths != null ? ` | eta ${formatDurationFromMonths(goal.projectedEtaMonths)}` : ""
          }`
      ),
      ...(pausedGoals.length
        ? [
            `- Goal lain sementara ditahan dulu: ${pausedGoals
              .slice(0, 3)
              .map((goal) => goal.goalName)
              .join(", ")}`
          ]
        : [])
    ].join("\n");
  }

  if (params.mode === "EXPENSE_GROWTH") {
    const targetGoal = focusedGoal ?? sortedByPriority[0];
    const annualExpenseGrowthRate = Math.max(1, Math.min(30, params.annualExpenseGrowthRate ?? 5));
    const simulatedEta = await simulateExpenseGrowthEta({
      userId: params.userId,
      goal: targetGoal,
      annualExpenseGrowthRate,
      fallbackMonthlySavingCapacity: monthlySavingCapacity
    });
    const baselineEta = targetGoal.projectedEtaMonths ?? targetGoal.estimatedMonthsToGoal;

    if (simulatedEta == null || baselineEta == null) {
      return `Saya belum punya cukup data income/expense untuk simulasi saat pengeluaran naik ${annualExpenseGrowthRate}% per tahun. Lengkapi profil bulanan dulu ya Boss.`;
    }

    const delay = Math.max(0, simulatedEta - baselineEta);
    return [
      `Kalau pengeluaran naik ${annualExpenseGrowthRate}% per tahun, target ${targetGoal.goalName} akan berubah seperti ini:`,
      `- ETA baseline: ${formatDurationFromMonths(baselineEta)}`,
      `- ETA setelah simulasi kenaikan expense: ${formatDurationFromMonths(simulatedEta)}`,
      `- Perkiraan mundur: ${formatDurationFromMonths(delay)}`,
      `- Implikasi: ruang tabungan bulanan akan makin tertekan kalau income tidak ikut naik.`
    ].join("\n");
  }

  const plannedGoals =
    params.mode === "FOCUS"
      ? buildFocusedAllocation(monthlySavingCapacity, sortedByPriority, focusedGoal)
      : buildEqualSplitAllocation(monthlySavingCapacity, sortedByPriority);

  if (params.mode === "PRIORITY") {
    return [
      "Urutan goal yang paling realistis/prioritas sekarang:",
      ...sortedByPriority.slice(0, 5).map(
        (goal, index) =>
          `${index + 1}. ${goal.goalName} | sisa ${formatMoney(goal.remainingAmount)}${
            goal.estimatedMonthsToGoal != null ? ` | eta ${formatDurationFromMonths(goal.estimatedMonthsToGoal)}` : ""
          } | alasan: ${buildPriorityReason(goal)}`
      )
    ].join("\n");
  }

  if (params.mode === "FOCUS" && focusedGoal) {
    const focusedPlan = plannedGoals.find((goal) => goal.goalName === focusedGoal.goalName) ?? focusedGoal;
    const baselinePlan = buildEqualSplitAllocation(monthlySavingCapacity, sortedByPriority).find(
      (goal) => goal.goalName === focusedGoal.goalName
    );

    return [
      `Kalau fokus ${focusedGoal.goalName} dulu, pembagian tabungan bulanan yang paling masuk akal kira-kira begini:`,
      `- Kapasitas tabungan bulanan: ${formatMoney(monthlySavingCapacity)}`,
      `- Alokasi ke ${focusedGoal.goalName}: ${formatMoney(focusedPlan.recommendedAllocation)}`,
      ...(baselinePlan?.projectedEtaMonths != null && focusedPlan.projectedEtaMonths != null
        ? [
            `- ETA ${focusedGoal.goalName}: ${formatDurationFromMonths(
              focusedPlan.projectedEtaMonths
            )} (sebelumnya ${formatDurationFromMonths(baselinePlan.projectedEtaMonths)})`
          ]
        : []),
      "- Sisa goal lain:",
      ...plannedGoals
        .filter((goal) => goal.goalName !== focusedGoal.goalName)
        .slice(0, 4)
        .map(
          (goal) =>
            `${goal.goalName} | alokasi ${formatMoney(goal.recommendedAllocation)}${
              goal.projectedEtaMonths != null ? ` | eta ${formatDurationFromMonths(goal.projectedEtaMonths)}` : ""
            }`
        )
    ].join("\n");
  }

  return [
    "Saran pembagian tabungan bulanan ke goal aktif:",
    `- Kapasitas tabungan bulanan: ${formatMoney(monthlySavingCapacity)}`,
    ...plannedGoals.slice(0, 5).map(
      (goal, index) =>
        `${index + 1}. ${goal.goalName} | alokasi ${formatMoney(goal.recommendedAllocation)} | sisa ${formatMoney(
          goal.remainingAmount
        )}${goal.projectedEtaMonths != null ? ` | eta ${formatDurationFromMonths(goal.projectedEtaMonths)}` : ""}`
    )
  ].join("\n");
};
