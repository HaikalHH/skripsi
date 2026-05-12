import { formatMoney, formatPercent } from "@/lib/services/shared/money-format";
import { formatEta } from "./eta-format";
import { estimateMonthlySavingsPace } from "./pace-estimator";
import type { GoalStatus } from "./types";

export const buildSavingsProgressUpdateText = async (params: {
  userId: string;
  goalStatus: GoalStatus;
}) => {
  const monthlyPace = await estimateMonthlySavingsPace(params.userId);
  const preferredMonthlyPace =
    params.goalStatus.progressSource === "NET_SAVINGS_PROXY"
      ? monthlyPace || params.goalStatus.monthlyContributionPace || 0
      : params.goalStatus.monthlyContributionPace || monthlyPace;

  if (params.goalStatus.targetAmount <= 0) {
    if (params.goalStatus.currentProgress <= 0) return null;
    return `Total sudah ditabung: ${formatMoney(params.goalStatus.currentProgress)}`;
  }

  const eta =
    params.goalStatus.estimatedMonthsToGoal != null && Number.isFinite(params.goalStatus.estimatedMonthsToGoal)
      ? formatEta(params.goalStatus.estimatedMonthsToGoal)
      : preferredMonthlyPace > 0
        ? formatEta(params.goalStatus.remainingAmount / preferredMonthlyPace)
        : "estimasi belum tersedia (ritme tabungan masih negatif).";

  const label =
    params.goalStatus.goalName && (params.goalStatus.totalGoals ?? 1) > 1
      ? `Progress goal utama (${params.goalStatus.goalName})`
      : params.goalStatus.goalName
        ? `Progress ${params.goalStatus.goalName}`
        : "Progress tabungan";

  return [
    params.goalStatus.goalNotFoundQuery
      ? `Goal \`${params.goalStatus.goalNotFoundQuery}\` belum ditemukan, jadi progress goal spesifiknya belum berubah.`
      : null,
    `${label}: ${formatPercent(params.goalStatus.progressPercent)} (${formatMoney(
      params.goalStatus.currentProgress
    )} dari ${formatMoney(params.goalStatus.targetAmount)})`,
    `Sisa target: ${formatMoney(params.goalStatus.remainingAmount)}; ${eta}`,
    `Total sudah ditabung: ${formatMoney(params.goalStatus.currentProgress)}`
  ]
    .filter(Boolean)
    .join("\n");
};
