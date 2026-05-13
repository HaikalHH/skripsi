import { prisma } from "@/lib/prisma";
import { buildFinancialHealthReply } from "@/lib/services/planning/financial-health";
import { getSavingsGoalStatus } from "@/lib/services/planning/goal";
import { formatMoney } from "@/lib/services/shared/money";
import { formatDurationFromMonths } from "@/lib/services/shared/projection";
import { normalizeExpenseBucketCategory } from "@/lib/services/transactions/category";
import { analyzeRecurringExpenses } from "@/lib/services/transactions/recurring-expense";
import {
  clampDayOfMonth,
  createMonthDate,
  formatJakartaDateKey,
  getJakartaDateParts,
  getJakartaDayBounds,
  getPreviousMonthRange,
  getRollingWeekRanges,
  isWithinJakartaHour,
  signedDayDiff
} from "@/lib/services/reminders/dispatch/time";

const RECURRING_LOOKAHEAD_DAYS = 3;
const RECURRING_MIN_CONFIDENCE = 0.55;
const GOAL_OFF_TRACK_MIN_MONTHS = 12;
const GOAL_OFF_TRACK_MAX_PROGRESS_PERCENT = 80;

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric"
});

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

export const getWeeklyReviewAlert = async (
  userId: string,
  baseDate = new Date()
): Promise<{ marker: string; message: string } | null> => {
  const jakartaNow = new Date(baseDate.getTime() + 7 * 60 * 60 * 1000);
  if (jakartaNow.getUTCDay() !== 1) return null;

  const { currentStart, currentEnd, previousStart, previousEnd } = getRollingWeekRanges(baseDate);
  const [currentTransactions, previousTransactions] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        occurredAt: {
          gte: currentStart,
          lte: currentEnd
        }
      },
      orderBy: { occurredAt: "asc" }
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        occurredAt: {
          gte: previousStart,
          lte: previousEnd
        }
      },
      orderBy: { occurredAt: "asc" }
    })
  ]);

  if (!currentTransactions.length) return null;

  const currentIncome = currentTransactions
    .filter((transaction) => transaction.type === "INCOME")
    .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  const currentExpense = currentTransactions
    .filter((transaction) => transaction.type === "EXPENSE")
    .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  const previousExpense = previousTransactions
    .filter((transaction) => transaction.type === "EXPENSE")
    .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);

  const topCategoryMap = new Map<string, number>();
  for (const transaction of currentTransactions) {
    if (transaction.type !== "EXPENSE") continue;
    const category = normalizeExpenseBucketCategory(transaction.category);
    topCategoryMap.set(category, (topCategoryMap.get(category) ?? 0) + toNumber(transaction.amount));
  }
  const topCategory = Array.from(topCategoryMap.entries()).sort((left, right) => right[1] - left[1])[0] ?? null;
  const delta = currentExpense - previousExpense;

  return {
    marker: `Review Mingguan ${currentStart.toISOString().slice(0, 10)}`,
    message: [
      "Review Mingguan:",
      `- Income 7 hari terakhir: ${formatMoney(currentIncome)}`,
      `- Expense 7 hari terakhir: ${formatMoney(currentExpense)}`,
      `- Net flow: ${formatMoney(currentIncome - currentExpense)}`,
      `- Dibanding 7 hari sebelumnya: ${delta >= 0 ? "naik" : "turun"} ${formatMoney(Math.abs(delta))}`,
      ...(topCategory ? [`- Bucket terbesar: ${topCategory[0]} (${formatMoney(topCategory[1])})`] : [])
    ].join("\n")
  };
};

export const getMonthlyClosingAlert = async (
  userId: string,
  baseDate = new Date()
): Promise<{ marker: string; message: string } | null> => {
  const dayOfMonth = new Date(baseDate.getTime() + 7 * 60 * 60 * 1000).getUTCDate();
  if (dayOfMonth > 3) return null;

  const previousMonthRange = getPreviousMonthRange(baseDate);
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      occurredAt: {
        gte: previousMonthRange.start,
        lte: previousMonthRange.end
      }
    },
    take: 1
  });
  if (!transactions.length) return null;

  const closingText = await buildFinancialHealthReply({
    userId,
    mode: "CLOSING",
    dateRange: previousMonthRange
  });

  return {
    marker: `Closing Bulanan ${previousMonthRange.start.toISOString().slice(0, 7)}`,
    message: closingText
  };
};

export const getYesterdayRecapAlert = async (
  userId: string,
  baseDate = new Date()
): Promise<{ marker: string; message: string } | null> => {
  if (!isWithinJakartaHour(baseDate, 7)) return null;

  const yesterdayRange = getJakartaDayBounds(baseDate, -1);
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      occurredAt: {
        gte: yesterdayRange.start,
        lte: yesterdayRange.end
      }
    },
    orderBy: { occurredAt: "asc" }
  });

  if (!transactions.length) return null;

  let income = 0;
  let expense = 0;
  const expenseByCategory = new Map<string, number>();

  for (const transaction of transactions) {
    const amount = toNumber(transaction.amount);
    if (transaction.type === "INCOME") {
      income += amount;
      continue;
    }
    if (transaction.type !== "EXPENSE") continue;

    expense += amount;
    const category = normalizeExpenseBucketCategory(transaction.category);
    expenseByCategory.set(category, (expenseByCategory.get(category) ?? 0) + amount);
  }

  const topExpense = Array.from(expenseByCategory.entries()).sort((left, right) => right[1] - left[1])[0] ?? null;
  const expenseCount = transactions.filter((transaction) => transaction.type === "EXPENSE").length;
  const dateLabel = DATE_LABEL_FORMATTER.format(yesterdayRange.start);

  return {
    marker: `Recap Harian ${formatJakartaDateKey(yesterdayRange.start)}`,
    message: [
      `Ringkasan kemarin (${dateLabel}):`,
      `- Uang masuk: ${formatMoney(income)}`,
      `- Uang keluar: ${formatMoney(expense)}`,
      `- Selisih hari itu: ${formatMoney(income - expense)}`,
      `- Total transaksi: ${transactions.length} transaksi`,
      expenseCount > 0 ? `- Transaksi pengeluaran: ${expenseCount} transaksi` : null,
      topExpense ? `- Pengeluaran terbesar: ${topExpense[0]} (${formatMoney(topExpense[1])})` : null
    ]
      .filter(Boolean)
      .join("\n")
  };
};

export const getRecurringDueSoonAlert = async (
  userId: string,
  baseDate = new Date()
): Promise<{ marker: string; message: string } | null> => {
  const lookbackStart = new Date(baseDate.getTime() - 120 * 24 * 60 * 60 * 1000);
  const expenses = await prisma.transaction.findMany({
    where: {
      userId,
      type: "EXPENSE",
      occurredAt: {
        gte: lookbackStart,
        lte: baseDate
      }
    },
    orderBy: { occurredAt: "asc" }
  });

  const candidate = analyzeRecurringExpenses(expenses)
    .filter(
      (entry) =>
        entry.nextExpectedAt &&
        entry.confidenceScore >= RECURRING_MIN_CONFIDENCE &&
        signedDayDiff(baseDate, entry.nextExpectedAt) >= 0 &&
        signedDayDiff(baseDate, entry.nextExpectedAt) <= RECURRING_LOOKAHEAD_DAYS
    )
    .sort((left, right) => {
      const leftDays = signedDayDiff(baseDate, left.nextExpectedAt as Date);
      const rightDays = signedDayDiff(baseDate, right.nextExpectedAt as Date);
      return (
        leftDays - rightDays ||
        Number(right.isRecurringLikeMerchant) - Number(left.isRecurringLikeMerchant) ||
        right.confidenceScore - left.confidenceScore
      );
    })[0];

  if (!candidate?.nextExpectedAt) return null;

  const dueInDays = signedDayDiff(baseDate, candidate.nextExpectedAt);
  const dueLabel =
    dueInDays === 0
      ? "hari ini"
      : dueInDays === 1
        ? "besok"
        : `${dueInDays} hari lagi`;
  const averageAmount = Math.round(candidate.averageAmount);
  const dueDateLabel = DATE_LABEL_FORMATTER.format(candidate.nextExpectedAt);

  return {
    marker: `Reminder Recurring ${candidate.label} ${candidate.nextExpectedAt.toISOString().slice(0, 10)}`,
    message:
      `Reminder Langganan: ${candidate.label} di bucket ${candidate.bucket} kemungkinan jatuh tempo ${dueLabel} (${dueDateLabel}). ` +
      `Rata-rata ${formatMoney(averageAmount)} per tagihan.`
  };
};

export const getPaydaySalaryInputAlert = async (
  userId: string,
  baseDate = new Date()
): Promise<{ marker: string; message: string } | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      salaryDate: true
    }
  });

  if (!user?.salaryDate) return null;

  const jakartaToday = getJakartaDateParts(baseDate);
  const currentMonthPayday = clampDayOfMonth(jakartaToday.year, jakartaToday.month, user.salaryDate);
  if (jakartaToday.day !== currentMonthPayday) return null;

  const paydayDate = createMonthDate(jakartaToday.year, jakartaToday.month, user.salaryDate);
  return {
    marker: `Reminder Gajian ${paydayDate.toISOString().slice(0, 10)}`,
    message:
      `Reminder Gajian: hari ini jadwal gajian (${DATE_LABEL_FORMATTER.format(paydayDate)}). ` +
      'Kalau gaji sudah masuk, catat dengan format "gaji 9.2jt" atau "gaji 9200000" ya Boss.'
  };
};

export const getGoalOffTrackAlert = async (
  userId: string
): Promise<{ marker: string; message: string } | null> => {
  const goalStatus = await getSavingsGoalStatus(userId);
  if (goalStatus.targetAmount <= 0) return null;
  if (goalStatus.currentProgress >= goalStatus.targetAmount) return null;
  if (goalStatus.progressPercent >= GOAL_OFF_TRACK_MAX_PROGRESS_PERCENT) return null;

  const etaMonths = goalStatus.estimatedMonthsToGoal;
  const goalName = goalStatus.goalName ?? "target utama";
  if (etaMonths !== null) {
    if (etaMonths < GOAL_OFF_TRACK_MIN_MONTHS) return null;

    return {
      marker: `Reminder Goal Pace ${goalName}`,
      message:
        `Reminder Goal: ${goalName} masih ${formatMoney(goalStatus.remainingAmount)} lagi. ` +
        `Dengan ritme sekarang, estimasinya ${formatDurationFromMonths(etaMonths)}. ` +
        `Kalau mau lebih cepat, pertimbangkan tambah setoran rutin atau kurangi bucket yang paling bocor bulan ini.`
    };
  }

  if (goalStatus.progressPercent > 20 || goalStatus.currentProgress <= 0) return null;

  return {
    marker: `Reminder Goal Pace ${goalName}`,
    message:
      `Reminder Goal: progress ${goalName} baru ${goalStatus.progressPercent.toFixed(1)}% dari target. ` +
      `Masih ada ${formatMoney(goalStatus.remainingAmount)} yang perlu dikejar. ` +
      `Kalau mau lebih cepat, pertimbangkan tambah setoran rutin atau kurangi bucket yang paling bocor bulan ini.`
  };
};
