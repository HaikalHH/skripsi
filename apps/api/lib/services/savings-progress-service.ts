import { prisma } from "../prisma";
import { formatMoney, formatPercent } from "./money-format";

type GoalStatus = {
  targetAmount: number;
  currentProgress: number;
  remainingAmount: number;
  progressPercent: number;
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

  const [incomeAgg, expenseAgg] = await Promise.all([
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

  const netWindow = toNumber(incomeAgg._sum.amount ?? 0) - toNumber(expenseAgg._sum.amount ?? 0);
  const monthlyPace = (netWindow / DAYS_WINDOW) * 30;
  return Number.isFinite(monthlyPace) ? monthlyPace : 0;
};

const formatEta = (monthsRaw: number) => {
  if (!Number.isFinite(monthsRaw) || monthsRaw <= 0) return "estimasi belum tersedia";
  const roundedMonths = Math.ceil(monthsRaw);
  if (roundedMonths < 2) return "estimasi sekitar < 1 bulan";

  const years = Math.floor(roundedMonths / 12);
  const months = roundedMonths % 12;
  if (years <= 0) return `estimasi sekitar ${months} bulan`;
  if (months <= 0) return `estimasi sekitar ${years} tahun`;
  return `estimasi sekitar ${years} tahun ${months} bulan`;
};

export const buildSavingsProgressUpdateText = async (params: {
  userId: string;
  goalStatus: GoalStatus;
}) => {
  if (params.goalStatus.targetAmount <= 0) return null;

  const monthlyPace = await estimateMonthlySavingsPace(params.userId);
  const eta =
    monthlyPace > 0
      ? formatEta(params.goalStatus.remainingAmount / monthlyPace)
      : "estimasi belum tersedia (ritme tabungan masih negatif).";

  return [
    `Progress tabungan: ${formatPercent(params.goalStatus.progressPercent)} (${formatMoney(
      params.goalStatus.currentProgress
    )} dari ${formatMoney(params.goalStatus.targetAmount)}).`,
    `Sisa target: ${formatMoney(params.goalStatus.remainingAmount)}; ${eta}`
  ].join("\n");
};
