import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { normalizeExpenseBucketCategory } from "./category-override-service";
import { getSavingsGoalStatus } from "./goal-service";
import { queueOutboundMessage } from "./outbound-message-service";

const BUDGET_WARNING_THRESHOLD = 0.8;
const WEEKLY_SPIKE_RATIO = 1.3;
const WEEKLY_MIN_CURRENT_EXPENSE = 300_000;
const WEEKLY_MIN_INCREASE = 100_000;

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const startOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));

const getMonthRange = (baseDate: Date) => {
  const start = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(
    Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );
  return { start, end };
};

const getRollingWeekRanges = (baseDate: Date) => {
  const currentEnd = new Date(baseDate);
  const currentStart = startOfUtcDay(baseDate);
  currentStart.setUTCDate(currentStart.getUTCDate() - 6);

  const previousEnd = new Date(currentStart.getTime() - 1);
  const previousStart = new Date(currentStart);
  previousStart.setUTCDate(previousStart.getUTCDate() - 7);

  return { currentStart, currentEnd, previousStart, previousEnd };
};

const normalizeBudgetCategory = (value: string) => normalizeExpenseBucketCategory(value);

const getExpenseTotal = async (userId: string, start: Date, end: Date): Promise<number> => {
  const result = await prisma.transaction.aggregate({
    where: {
      userId,
      type: "EXPENSE",
      occurredAt: {
        gte: start,
        lte: end
      }
    },
    _sum: {
      amount: true
    }
  });

  return toNumber(result._sum.amount ?? 0);
};

export const shouldTriggerWeeklySpendingAlert = (
  currentExpense: number,
  previousExpense: number
): boolean => {
  if (currentExpense < WEEKLY_MIN_CURRENT_EXPENSE) return false;
  if (previousExpense <= 0) return currentExpense >= WEEKLY_MIN_CURRENT_EXPENSE * 2;

  const ratioThreshold = previousExpense * WEEKLY_SPIKE_RATIO;
  const absoluteThreshold = previousExpense + WEEKLY_MIN_INCREASE;
  return currentExpense >= Math.max(ratioThreshold, absoluteThreshold);
};

export const getWeeklySpendingAlert = async (
  userId: string,
  baseDate = new Date()
): Promise<{ marker: string; message: string } | null> => {
  const ranges = getRollingWeekRanges(baseDate);
  const [currentExpense, previousExpense] = await Promise.all([
    getExpenseTotal(userId, ranges.currentStart, ranges.currentEnd),
    getExpenseTotal(userId, ranges.previousStart, ranges.previousEnd)
  ]);

  if (!shouldTriggerWeeklySpendingAlert(currentExpense, previousExpense)) return null;

  const marker = `Reminder Mingguan ${ranges.currentStart.toISOString().slice(0, 10)}`;
  const message =
    `Reminder Mingguan: pengeluaran 7 hari terakhir Anda meningkat ke ${currentExpense.toFixed(
      2
    )} dari periode sebelumnya ${previousExpense.toFixed(
      2
    )}. Cek kategori pengeluaran terbesar minggu ini agar tidak kebablasan.`;

  return { marker, message };
};

export const checkWeeklySpendingAlert = async (userId: string, baseDate = new Date()) => {
  const alert = await getWeeklySpendingAlert(userId, baseDate);
  return alert?.message ?? null;
};

export const buildGoalReachedAlertText = (goalStatus: {
  targetAmount: number;
  currentProgress: number;
}) => {
  if (goalStatus.targetAmount <= 0) return null;
  if (goalStatus.currentProgress < goalStatus.targetAmount) return null;
  return `Target tabungan tercapai: ${goalStatus.currentProgress.toFixed(
    2
  )} dari target ${goalStatus.targetAmount.toFixed(2)}.`;
};

const hasReminderSentSince = async (params: {
  userId: string;
  marker: string;
  since: Date;
}): Promise<boolean> => {
  const existing = await prisma.outboundMessage.findFirst({
    where: {
      userId: params.userId,
      createdAt: { gte: params.since },
      messageText: { startsWith: params.marker }
    },
    select: { id: true }
  });

  return Boolean(existing);
};

const queueReminderOnce = async (params: {
  userId: string;
  waNumber: string;
  marker: string;
  message: string;
  since: Date;
}): Promise<boolean> => {
  const alreadySent = await hasReminderSentSince({
    userId: params.userId,
    marker: params.marker,
    since: params.since
  });
  if (alreadySent) return false;

  await queueOutboundMessage({
    userId: params.userId,
    waNumber: params.waNumber,
    messageText: `${params.marker}\n${params.message}`
  });
  return true;
};

export const runProactiveReminders = async (baseDate = new Date()) => {
  const activeSubscriptions = await prisma.subscription.findMany({
    where: {
      status: {
        in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL]
      }
    },
    distinct: ["userId"],
    select: { userId: true }
  });
  const userIds = activeSubscriptions.map((item) => item.userId);
  if (!userIds.length) {
    return {
      processedUsers: 0,
      queued: 0,
      queuedByType: { budget: 0, goal: 0, weekly: 0 }
    };
  }

  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds }
    },
    select: {
      id: true,
      waNumber: true
    }
  });

  const dayStart = startOfUtcDay(baseDate);
  const monthRange = getMonthRange(baseDate);
  const weekRange = getRollingWeekRanges(baseDate);

  let budgetCount = 0;
  let goalCount = 0;
  let weeklyCount = 0;

  for (const user of users) {
    const budgets = await prisma.budget.findMany({
      where: { userId: user.id }
    });

    if (budgets.length) {
      const monthlyExpenses = await prisma.transaction.findMany({
        where: {
          userId: user.id,
          type: "EXPENSE",
          occurredAt: {
            gte: monthRange.start,
            lte: monthRange.end
          }
        }
      });
      const spentMap = new Map<string, number>();
      for (const transaction of monthlyExpenses) {
        const category = normalizeBudgetCategory(transaction.category);
        spentMap.set(category, (spentMap.get(category) ?? 0) + toNumber(transaction.amount));
      }

      const budgetMap = new Map<string, (typeof budgets)[number]>();
      for (const budget of budgets) {
        const category = normalizeBudgetCategory(budget.category);
        const existing = budgetMap.get(category);
        if (!existing || existing.updatedAt.getTime() < budget.updatedAt.getTime()) {
          budgetMap.set(category, {
            ...budget,
            category
          });
        }
      }

      for (const budget of budgetMap.values()) {
        const limit = toNumber(budget.monthlyLimit);
        if (limit <= 0) continue;

        const spent = spentMap.get(budget.category) ?? 0;
        if (spent < limit * BUDGET_WARNING_THRESHOLD) continue;

        const overLimit = spent >= limit;
        const marker = `Reminder Budget ${budget.category}`;
        const message = overLimit
          ? `Kategori ${budget.category} sudah melewati budget bulanan. Limit ${limit.toFixed(
              2
            )}, aktual ${spent.toFixed(2)}.`
          : `Kategori ${budget.category} hampir habis. Terpakai ${spent.toFixed(
              2
            )} dari limit ${limit.toFixed(2)}.`;
        const queued = await queueReminderOnce({
          userId: user.id,
          waNumber: user.waNumber,
          marker,
          message,
          since: dayStart
        });
        if (queued) budgetCount += 1;
      }
    }

    const goalStatus = await getSavingsGoalStatus(user.id);
    const goalMessage = buildGoalReachedAlertText(goalStatus);
    if (goalMessage) {
      const marker = "Reminder Goal Tabungan";
      const queued = await queueReminderOnce({
        userId: user.id,
        waNumber: user.waNumber,
        marker,
        message: goalMessage,
        since: dayStart
      });
      if (queued) goalCount += 1;
    }

    const weeklyAlert = await getWeeklySpendingAlert(user.id, baseDate);
    if (weeklyAlert) {
      const queued = await queueReminderOnce({
        userId: user.id,
        waNumber: user.waNumber,
        marker: weeklyAlert.marker,
        message: weeklyAlert.message,
        since: weekRange.currentStart
      });
      if (queued) weeklyCount += 1;
    }
  }

  return {
    processedUsers: users.length,
    queued: budgetCount + goalCount + weeklyCount,
    queuedByType: {
      budget: budgetCount,
      goal: goalCount,
      weekly: weeklyCount
    }
  };
};
