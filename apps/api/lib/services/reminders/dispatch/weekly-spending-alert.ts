import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/services/shared/money";
import { getRollingWeekRanges } from "@/lib/services/reminders/dispatch/time";

const WEEKLY_SPIKE_RATIO = 1.3;
const WEEKLY_MIN_CURRENT_EXPENSE = 300_000;
const WEEKLY_MIN_INCREASE = 100_000;

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

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
    `Reminder Mingguan: pengeluaran 7 hari terakhir Anda meningkat ke ${formatMoney(
      currentExpense
    )} dari periode sebelumnya ${formatMoney(
      previousExpense
    )}. Cek kategori pengeluaran terbesar minggu ini agar tidak kebablasan.`;

  return { marker, message };
};

export const checkWeeklySpendingAlert = async (userId: string, baseDate = new Date()) => {
  const alert = await getWeeklySpendingAlert(userId, baseDate);
  return alert?.message ?? null;
};
