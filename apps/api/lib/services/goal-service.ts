import { prisma } from "../prisma";

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const clampProgressPercent = (targetAmount: number, currentProgress: number) => {
  if (targetAmount <= 0) return 0;
  const value = (currentProgress / targetAmount) * 100;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

const buildGoalStatus = (targetAmount: number, currentProgress: number) => {
  const target = Math.max(0, targetAmount);
  const progress = Math.max(0, currentProgress);
  return {
    targetAmount: target,
    currentProgress: progress,
    remainingAmount: Math.max(0, target - progress),
    progressPercent: clampProgressPercent(target, progress)
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

export const refreshSavingsGoalProgress = async (userId: string) => {
  const netSavings = await calculateNetSavings(userId);
  const goal = await prisma.savingsGoal.upsert({
    where: { userId },
    update: { currentProgress: netSavings },
    create: {
      userId,
      targetAmount: 0,
      currentProgress: netSavings
    }
  });

  return buildGoalStatus(toNumber(goal.targetAmount), toNumber(goal.currentProgress));
};

export const setSavingsGoalTarget = async (userId: string, targetAmount: number) => {
  const netSavings = await calculateNetSavings(userId);
  const goal = await prisma.savingsGoal.upsert({
    where: { userId },
    update: {
      targetAmount,
      currentProgress: netSavings
    },
    create: {
      userId,
      targetAmount,
      currentProgress: netSavings
    }
  });

  return buildGoalStatus(toNumber(goal.targetAmount), toNumber(goal.currentProgress));
};

export const getSavingsGoalStatus = async (userId: string) => refreshSavingsGoalProgress(userId);
