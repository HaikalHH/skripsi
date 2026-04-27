import { prisma } from "@/lib/prisma";
import { formatMoney, formatPercent } from "@/lib/services/shared/money-format";
import { formatDurationFromMonths } from "@/lib/services/shared/projection-math-service";

type GoalStatus = {
  goalName?: string | null;
  totalGoals?: number;
  goalNotFoundQuery?: string | null;
  targetAmount: number;
  currentProgress: number;
  remainingAmount: number;
  progressPercent: number;
  estimatedMonthsToGoal?: number | null;
  monthlyContributionPace?: number | null;
  progressSource?: "GOAL_CONTRIBUTIONS" | "NET_SAVINGS_PROXY";
};

const DAYS_WINDOW = 90;

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const estimateMonthlySavingsPace = async (userId: string): Promise<number> => {
  const windowStart = new Date();
  windowStart.setUTCDate(windowStart.getUTCDate() - DAYS_WINDOW);

  const [savingAgg, incomeAgg, expenseAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        userId,
        type: "SAVING",
        occurredAt: { gte: windowStart }
      },
      _sum: { amount: true }
    }),
    prisma.transaction.aggregate({
      where: {
        userId,
        type: "INCOME",
        occurredAt: { gte: windowStart }
      },
      _sum: { amount: true }
    }),
    prisma.transaction.aggregate({
      where: {
        userId,
        type: "EXPENSE",
        occurredAt: { gte: windowStart }
      },
      _sum: { amount: true }
    })
  ]);

  const directSaving = toNumber(savingAgg._sum.amount ?? 0);
  if (directSaving > 0) {
    const monthlySavingPace = (directSaving / DAYS_WINDOW) * 30;
    return Number.isFinite(monthlySavingPace) ? monthlySavingPace : 0;
  }

  const netWindow = toNumber(incomeAgg._sum.amount ?? 0) - toNumber(expenseAgg._sum.amount ?? 0);
  const monthlyPace = (netWindow / DAYS_WINDOW) * 30;
  return Number.isFinite(monthlyPace) ? monthlyPace : 0;
};

const formatEta = (monthsRaw: number) => {
  if (!Number.isFinite(monthsRaw)) return "estimasi belum tersedia";
  if (monthsRaw <= 0) return "estimasi sudah tercapai";
  return `estimasi ${formatDurationFromMonths(monthsRaw)}`;
};

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
