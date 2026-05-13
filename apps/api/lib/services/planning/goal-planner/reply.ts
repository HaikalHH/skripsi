import { formatMoney } from "@/lib/services/shared/money";
import { formatDurationFromMonths } from "@/lib/services/shared/projection";
import {
  buildEqualSplitAllocation,
  buildFocusedAllocation,
  buildRatioAllocation
} from "./allocation";
import { selectGoalCandidates } from "./candidates";
import { DEFAULT_FINANCIAL_GOAL_PRIORITY_ORDER } from "./constants";
import { simulateExpenseGrowthEta } from "./expense-growth";
import { buildPriorityReason } from "./scoring";
import type { GoalPlannerInput } from "./types";
import { normalizeText, roundToTwoDecimals } from "./utils";

export const buildGoalPlannerReply = async (params: GoalPlannerInput) => {
  const { candidates, monthlySavingCapacity } = await selectGoalCandidates(params);

  if (!candidates.length) {
    return "Belum ada goal aktif yang bisa direncanakan. Set goal dulu, baru saya bantu urutkan prioritas dan pembagian tabungannya.";
  }

  if (monthlySavingCapacity <= 0) {
    return "Saya belum melihat ruang tabungan bulanan yang cukup untuk menyusun rencana goal. Rapikan cashflow atau lengkapi profil penghasilan dan pengeluaran dulu ya.";
  }

  const sortedByPriority = [...candidates].sort(
    (left, right) => {
      const leftPriorityOrder =
        typeof left.priorityOrder === "number" &&
        Number.isFinite(left.priorityOrder) &&
        left.priorityOrder < DEFAULT_FINANCIAL_GOAL_PRIORITY_ORDER
          ? left.priorityOrder
          : DEFAULT_FINANCIAL_GOAL_PRIORITY_ORDER;
      const rightPriorityOrder =
        typeof right.priorityOrder === "number" &&
        Number.isFinite(right.priorityOrder) &&
        right.priorityOrder < DEFAULT_FINANCIAL_GOAL_PRIORITY_ORDER
          ? right.priorityOrder
          : DEFAULT_FINANCIAL_GOAL_PRIORITY_ORDER;

      return (
        leftPriorityOrder - rightPriorityOrder ||
        right.priorityScore - left.priorityScore ||
        left.remainingAmount - right.remainingAmount
      );
    }
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
