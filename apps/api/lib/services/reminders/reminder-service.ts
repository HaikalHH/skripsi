import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeExpenseBucketCategory } from "@/lib/services/transactions/category-override-service";
import { buildFinancialHealthReply } from "@/lib/services/planning/financial-health-service";
import { getSavingsGoalStatus } from "@/lib/services/planning/goal-service";
import { queueOutboundMessage } from "@/lib/services/messaging/outbound-message-service";
import { formatDurationFromMonths } from "@/lib/services/shared/projection-math-service";
import { analyzeRecurringExpenses } from "@/lib/services/transactions/recurring-expense-service";
import {
  getReminderPreference,
  isReminderSnoozed,
  isWithinReminderQuietHours,
  resolveReminderCooldownSince
} from "@/lib/services/reminders/reminder-preference-service";
import { formatMoney } from "@/lib/services/shared/money-format";

const BUDGET_WARNING_THRESHOLD = 0.8;
const WEEKLY_SPIKE_RATIO = 1.3;
const WEEKLY_MIN_CURRENT_EXPENSE = 300_000;
const WEEKLY_MIN_INCREASE = 100_000;
const RECURRING_LOOKAHEAD_DAYS = 3;
const RECURRING_MIN_CONFIDENCE = 0.55;
const PAYDAY_LOOKAHEAD_DAYS = 5;
const PAYDAY_MIN_SAFE_BUFFER = 150_000;
const GOAL_OFF_TRACK_MIN_MONTHS = 12;
const GOAL_OFF_TRACK_MAX_PROGRESS_PERCENT = 80;

type ReminderTypeKey =
  | "budget"
  | "goal_reached"
  | "weekly_spike"
  | "recurring_due"
  | "cashflow_buffer"
  | "goal_off_track"
  | "weekly_review"
  | "monthly_closing"
  | "daily_digest";

type ReminderCandidate = {
  reminderType: ReminderTypeKey;
  marker: string;
  message: string;
  since: Date;
  priority: number;
};

const DIGEST_PREVIEW_LIMIT = 3;

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const startOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric"
});

const getMonthRange = (baseDate: Date) => {
  const start = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(
    Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );
  return { start, end };
};

const getPreviousMonthRange = (baseDate: Date) => {
  const start = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 0, 23, 59, 59, 999));
  return {
    start,
    end,
    label: new Intl.DateTimeFormat("id-ID", {
      month: "long",
      year: "numeric"
    }).format(start)
  };
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

const getWeeklyReviewAlert = async (
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

const getMonthlyClosingAlert = async (
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

const getFinancialProfileModel = () =>
  (prisma as unknown as {
    financialProfile?: {
      findUnique: (args: {
        where: { userId: string };
        select: {
          activeIncomeMonthly: true;
          monthlyIncomeTotal: true;
          monthlyExpenseTotal: true;
        };
      }) => Promise<{
        activeIncomeMonthly: bigint | null;
        monthlyIncomeTotal: bigint | null;
        monthlyExpenseTotal: bigint | null;
      } | null>;
    };
  }).financialProfile;

const getAssetModel = () =>
  (prisma as unknown as {
    asset?: {
      findMany: (args: {
        where: { userId: string; assetType: { in: string[] } };
        select: { estimatedValue: true };
      }) => Promise<Array<{ estimatedValue: bigint | null }>>;
    };
  }).asset;

const wholeDayDiff = (start: Date, end: Date) =>
  Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));

const signedDayDiff = (start: Date, end: Date) =>
  Math.round((startOfUtcDay(end).getTime() - startOfUtcDay(start).getTime()) / (24 * 60 * 60 * 1000));

const clampDayOfMonth = (year: number, month: number, dayOfMonth: number) => {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Math.max(1, Math.min(dayOfMonth, lastDay));
};

const createMonthDate = (year: number, month: number, dayOfMonth: number) =>
  new Date(Date.UTC(year, month, clampDayOfMonth(year, month, dayOfMonth), 0, 0, 0, 0));

const getLastPayday = (now: Date, salaryDate: number) => {
  const currentMonthPayday = createMonthDate(now.getUTCFullYear(), now.getUTCMonth(), salaryDate);
  if (currentMonthPayday.getTime() <= now.getTime()) {
    return currentMonthPayday;
  }

  return createMonthDate(now.getUTCFullYear(), now.getUTCMonth() - 1, salaryDate);
};

const getNextPayday = (now: Date, salaryDate: number) => {
  const currentMonthPayday = createMonthDate(now.getUTCFullYear(), now.getUTCMonth(), salaryDate);
  if (currentMonthPayday.getTime() > now.getTime()) {
    return currentMonthPayday;
  }

  return createMonthDate(now.getUTCFullYear(), now.getUTCMonth() + 1, salaryDate);
};

const getRecurringDueSoonAlert = async (
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
        Number(right.isSubscriptionLikely) - Number(left.isSubscriptionLikely) ||
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

const getPaydayBufferAlert = async (
  userId: string,
  baseDate = new Date()
): Promise<{ marker: string; message: string } | null> => {
  const financialProfileModel = getFinancialProfileModel();
  const assetModel = getAssetModel();
  const [user, financialProfile, liquidAssets] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        salaryDate: true
      }
    }),
    financialProfileModel?.findUnique({
      where: { userId },
      select: {
        activeIncomeMonthly: true,
        monthlyIncomeTotal: true,
        monthlyExpenseTotal: true
      }
    }) ?? Promise.resolve(null),
    assetModel?.findMany({
      where: {
        userId,
        assetType: {
          in: ["CASH", "SAVINGS"]
        }
      },
      select: {
        estimatedValue: true
      }
    }) ?? Promise.resolve([])
  ]);

  if (!user?.salaryDate) return null;

  const nextPayday = getNextPayday(baseDate, user.salaryDate);
  const daysUntilPayday = wholeDayDiff(baseDate, nextPayday);
  if (daysUntilPayday <= 0 || daysUntilPayday > PAYDAY_LOOKAHEAD_DAYS) return null;

  const cycleStart = getLastPayday(baseDate, user.salaryDate);
  const rollingExpenseStart = new Date(baseDate.getTime() - 29 * 24 * 60 * 60 * 1000);
  const [cycleTransactions, rollingExpenses] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        occurredAt: {
          gte: cycleStart,
          lte: baseDate
        }
      },
      orderBy: { occurredAt: "asc" }
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        type: "EXPENSE",
        occurredAt: {
          gte: rollingExpenseStart,
          lte: baseDate
        }
      },
      orderBy: { occurredAt: "asc" }
    })
  ]);

  const cycleIncome = cycleTransactions
    .filter((transaction) => transaction.type === "INCOME")
    .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  const cycleExpense = cycleTransactions
    .filter((transaction) => transaction.type === "EXPENSE")
    .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  const rollingExpense = rollingExpenses.reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  const liquidAssetValue = liquidAssets.reduce((sum, asset) => sum + toNumber(asset.estimatedValue), 0);

  const activeIncomeMonthly = toNumber(financialProfile?.activeIncomeMonthly ?? 0);
  const monthlyIncomeProfile = toNumber(financialProfile?.monthlyIncomeTotal ?? 0);
  const monthlyExpenseProfile = toNumber(financialProfile?.monthlyExpenseTotal ?? 0);
  const cycleDays = Math.max(1, wholeDayDiff(cycleStart, baseDate) + 1);
  const rollingDays = Math.max(1, wholeDayDiff(rollingExpenseStart, baseDate) + 1);
  const daysInCurrentMonth = new Date(
    Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, 0)
  ).getUTCDate();

  const currentIncomeEstimate =
    cycleIncome > 0 ? cycleIncome : activeIncomeMonthly || monthlyIncomeProfile;
  const expenseRunRate =
    cycleExpense > 0 && cycleDays >= 3
      ? cycleExpense / cycleDays
      : rollingExpense > 0
        ? rollingExpense / rollingDays
        : monthlyExpenseProfile > 0
          ? monthlyExpenseProfile / Math.max(1, daysInCurrentMonth)
          : 0;

  if (expenseRunRate <= 0) return null;

  const bufferNow = currentIncomeEstimate - cycleExpense + liquidAssetValue;
  const projectedNeed = Math.round(expenseRunRate * daysUntilPayday);
  const projectedEndingBalance = bufferNow - projectedNeed;

  if (projectedEndingBalance > Math.max(PAYDAY_MIN_SAFE_BUFFER, Math.round(expenseRunRate * 2))) {
    return null;
  }

  return {
    marker: `Reminder Cashflow ${nextPayday.toISOString().slice(0, 10)}`,
    message:
      `Reminder Cashflow: menuju gajian ${DATE_LABEL_FORMATTER.format(nextPayday)}, buffer kamu ` +
      `${projectedEndingBalance < 0 ? "berisiko minus" : "mulai tipis"}. ` +
      `Estimasi sisa ${formatMoney(projectedEndingBalance)} dengan kebutuhan sekitar ${formatMoney(projectedNeed)} sampai gajian.`
  };
};

const getGoalOffTrackAlert = async (
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

export const buildGoalReachedAlertText = (goalStatus: {
  targetAmount: number;
  currentProgress: number;
}) => {
  if (goalStatus.targetAmount <= 0) return null;
  if (goalStatus.currentProgress < goalStatus.targetAmount) return null;
  return `Target tabungan tercapai: ${formatMoney(goalStatus.currentProgress)} dari target ${formatMoney(goalStatus.targetAmount)}.`;
};

const getReminderEventModel = () =>
  (
    prisma as typeof prisma & {
      reminderEvent?: {
        findFirst: (args: unknown) => Promise<{ id: string } | null>;
        count: (args: unknown) => Promise<number>;
        create: (args: unknown) => Promise<unknown>;
      };
    }
  ).reminderEvent;

const getReminderTypePriority = (reminderType: ReminderTypeKey) => {
  switch (reminderType) {
    case "goal_reached":
      return 100;
    case "cashflow_buffer":
      return 95;
    case "recurring_due":
      return 90;
    case "goal_off_track":
      return 82;
    case "budget":
      return 75;
    case "weekly_spike":
      return 65;
    case "monthly_closing":
      return 45;
    case "daily_digest":
      return 30;
    case "weekly_review":
      return 35;
    default:
      return 10;
  }
};

const summarizeReminderCandidate = (candidate: ReminderCandidate) =>
  candidate.message
    .split("\n")[0]
    .replace(/^Reminder [^:]+:\s*/i, "")
    .replace(/^Review Mingguan:\s*/i, "")
    .replace(/^Closing Bulanan:\s*/i, "")
    .trim();

const buildReminderDigestCandidate = (params: {
  candidates: ReminderCandidate[];
  baseDate: Date;
}): ReminderCandidate => {
  const previewLines = params.candidates
    .slice(0, DIGEST_PREVIEW_LIMIT)
    .map((candidate) => `- ${summarizeReminderCandidate(candidate)}`);
  const hiddenCount = Math.max(0, params.candidates.length - DIGEST_PREVIEW_LIMIT);

  return {
    reminderType: "daily_digest",
    marker: `Reminder Digest ${startOfUtcDay(params.baseDate).toISOString().slice(0, 10)}`,
    message: [
      "Ringkasan reminder penting hari ini:",
      ...previewLines,
      hiddenCount > 0 ? `- Dan ${hiddenCount} reminder lain yang sejenis.` : null
    ]
      .filter(Boolean)
      .join("\n"),
    since: startOfUtcDay(params.baseDate),
    priority: getReminderTypePriority("daily_digest")
  };
};

export const buildReminderDispatchPlan = (params: {
  candidates: ReminderCandidate[];
  remainingDailyCapacity: number;
  baseDate: Date;
}): ReminderCandidate[] => {
  const sortedCandidates = [...params.candidates].sort(
    (left, right) => right.priority - left.priority
  );

  if (params.remainingDailyCapacity <= 0 || !sortedCandidates.length) {
    return [];
  }

  if (sortedCandidates.length <= params.remainingDailyCapacity) {
    return sortedCandidates;
  }

  if (params.remainingDailyCapacity === 1) {
    const secondPriority = sortedCandidates[1]?.priority ?? 0;
    if (sortedCandidates[0].priority >= 90 && secondPriority <= 75) {
      return [sortedCandidates[0]];
    }

    return [
      buildReminderDigestCandidate({
        candidates: sortedCandidates,
        baseDate: params.baseDate
      })
    ];
  }

  const directCandidates = sortedCandidates.slice(0, params.remainingDailyCapacity - 1);
  const deferredCandidates = sortedCandidates.slice(params.remainingDailyCapacity - 1);
  if (deferredCandidates.length < 2) {
    return [...directCandidates, ...deferredCandidates];
  }

  return [
    ...directCandidates,
    buildReminderDigestCandidate({
      candidates: deferredCandidates,
      baseDate: params.baseDate
    })
  ];
};

const hasReminderSentSince = async (params: {
  userId: string;
  marker: string;
  since: Date;
}): Promise<boolean> => {
  const reminderEvent = getReminderEventModel();
  if (reminderEvent) {
    const existingEvent = await reminderEvent.findFirst({
      where: {
        userId: params.userId,
        sentAt: { gte: params.since },
        marker: params.marker
      },
      select: { id: true }
    });
    if (existingEvent) return true;
  }

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

const getReminderCountSentToday = async (params: {
  userId: string;
  dayStart: Date;
  dayEnd: Date;
}): Promise<number> => {
  const reminderEvent = getReminderEventModel();
  if (reminderEvent) {
      return reminderEvent.count({
        where: {
          userId: params.userId,
          sentAt: {
            gte: params.dayStart,
          lte: params.dayEnd
        }
      }
    });
  }

  const outboundToday = await prisma.outboundMessage.findMany({
    where: {
      userId: params.userId,
      createdAt: {
        gte: params.dayStart,
        lte: params.dayEnd
      }
    }
  });
  return outboundToday.filter((item) => /^Reminder |^Review Mingguan|^Closing Bulanan/.test(item.messageText)).length;
};

const queueReminderOnce = async (params: {
  userId: string;
  waNumber: string;
  reminderType: string;
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

  const messageText = `${params.marker}\n${params.message}`;
  await queueOutboundMessage({
    userId: params.userId,
    waNumber: params.waNumber,
    messageText
  });

  const reminderEvent = getReminderEventModel();
  if (reminderEvent) {
    await reminderEvent.create({
      data: {
        userId: params.userId,
        reminderType: params.reminderType,
        marker: params.marker,
        messageText,
        sentAt: new Date()
      }
    });
  }
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
      queuedByType: {
        budget: 0,
        goal: 0,
        weekly: 0,
        recurring: 0,
        cashflow: 0,
        goalPace: 0,
        weeklyReview: 0,
        monthlyClosing: 0
      }
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
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
  const monthRange = getMonthRange(baseDate);
  const weekRange = getRollingWeekRanges(baseDate);

  let budgetCount = 0;
  let goalCount = 0;
  let weeklyCount = 0;
  let recurringCount = 0;
  let cashflowCount = 0;
  let goalPaceCount = 0;
  let weeklyReviewCount = 0;
  let monthlyClosingCount = 0;
  let digestCount = 0;

  for (const user of users) {
    const reminderPreference = await getReminderPreference(user.id);
    if (isWithinReminderQuietHours(baseDate, reminderPreference) || isReminderSnoozed(baseDate, reminderPreference)) {
      continue;
    }

    const sentTodayCount = await getReminderCountSentToday({
      userId: user.id,
      dayStart,
      dayEnd
    });
    let remainingDailyCapacity = Math.max(0, reminderPreference.maxPerDay - sentTodayCount);
    if (remainingDailyCapacity <= 0) {
      continue;
    }

    const candidates: ReminderCandidate[] = [];

    const budgets = await prisma.budget.findMany({
      where: { userId: user.id }
    });

    if (budgets.length && reminderPreference.budgetEnabled) {
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
          ? `Kategori ${budget.category} sudah melewati budget bulanan. Limit ${formatMoney(
              limit
            )}, aktual ${formatMoney(spent)}.`
          : `Kategori ${budget.category} hampir habis. Terpakai ${formatMoney(spent)} dari limit ${formatMoney(limit)}.`;
        candidates.push({
          reminderType: "budget",
          marker,
          message,
          since: resolveReminderCooldownSince(baseDate, dayStart, reminderPreference),
          priority: getReminderTypePriority("budget")
        });
      }
    }

    const goalStatus = reminderPreference.goalEnabled ? await getSavingsGoalStatus(user.id) : null;
    const goalMessage = goalStatus ? buildGoalReachedAlertText(goalStatus) : null;
    if (goalMessage && goalStatus) {
      const marker = "Reminder Goal Tabungan";
      candidates.push({
        reminderType: "goal_reached",
        marker,
        message: goalMessage,
        since: resolveReminderCooldownSince(baseDate, dayStart, reminderPreference),
        priority: getReminderTypePriority("goal_reached")
      });
    }

    const goalOffTrack = reminderPreference.goalEnabled ? await getGoalOffTrackAlert(user.id) : null;
    if (goalOffTrack) {
      candidates.push({
        reminderType: "goal_off_track",
        marker: goalOffTrack.marker,
        message: goalOffTrack.message,
        since: resolveReminderCooldownSince(baseDate, weekRange.currentStart, reminderPreference),
        priority: getReminderTypePriority("goal_off_track")
      });
    }

    const weeklyAlert = reminderPreference.weeklyEnabled ? await getWeeklySpendingAlert(user.id, baseDate) : null;
    if (weeklyAlert) {
      candidates.push({
        reminderType: "weekly_spike",
        marker: weeklyAlert.marker,
        message: weeklyAlert.message,
        since: resolveReminderCooldownSince(baseDate, weekRange.currentStart, reminderPreference),
        priority: getReminderTypePriority("weekly_spike")
      });
    }

    const recurringAlert = reminderPreference.recurringEnabled
      ? await getRecurringDueSoonAlert(user.id, baseDate)
      : null;
    if (recurringAlert) {
      candidates.push({
        reminderType: "recurring_due",
        marker: recurringAlert.marker,
        message: recurringAlert.message,
        since: resolveReminderCooldownSince(baseDate, dayStart, reminderPreference),
        priority: getReminderTypePriority("recurring_due")
      });
    }

    const paydayAlert = reminderPreference.cashflowEnabled ? await getPaydayBufferAlert(user.id, baseDate) : null;
    if (paydayAlert) {
      candidates.push({
        reminderType: "cashflow_buffer",
        marker: paydayAlert.marker,
        message: paydayAlert.message,
        since: resolveReminderCooldownSince(baseDate, dayStart, reminderPreference),
        priority: getReminderTypePriority("cashflow_buffer")
      });
    }

    const weeklyReviewAlert = reminderPreference.weeklyReviewEnabled
      ? await getWeeklyReviewAlert(user.id, baseDate)
      : null;
    if (weeklyReviewAlert) {
      candidates.push({
        reminderType: "weekly_review",
        marker: weeklyReviewAlert.marker,
        message: weeklyReviewAlert.message,
        since: resolveReminderCooldownSince(baseDate, weekRange.currentStart, reminderPreference),
        priority: getReminderTypePriority("weekly_review")
      });
    }

    const monthlyClosingAlert = reminderPreference.monthlyClosingEnabled
      ? await getMonthlyClosingAlert(user.id, baseDate)
      : null;
    if (monthlyClosingAlert) {
      const monthlySince = startOfUtcDay(
        new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1, 0, 0, 0, 0))
      );
      candidates.push({
        reminderType: "monthly_closing",
        marker: monthlyClosingAlert.marker,
        message: monthlyClosingAlert.message,
        since: resolveReminderCooldownSince(baseDate, monthlySince, reminderPreference),
        priority: getReminderTypePriority("monthly_closing")
      });
    }

    const dispatchPlan = buildReminderDispatchPlan({
      candidates,
      remainingDailyCapacity,
      baseDate
    });
    for (const candidate of dispatchPlan) {
      if (remainingDailyCapacity <= 0) break;

      const queued = await queueReminderOnce({
        userId: user.id,
        waNumber: user.waNumber,
        reminderType: candidate.reminderType,
        marker: candidate.marker,
        message: candidate.message,
        since: candidate.since
      });
      if (!queued) continue;

      remainingDailyCapacity -= 1;
      if (candidate.reminderType === "budget") budgetCount += 1;
      if (candidate.reminderType === "goal_reached") goalCount += 1;
      if (candidate.reminderType === "weekly_spike") weeklyCount += 1;
      if (candidate.reminderType === "recurring_due") recurringCount += 1;
      if (candidate.reminderType === "cashflow_buffer") cashflowCount += 1;
      if (candidate.reminderType === "goal_off_track") goalPaceCount += 1;
      if (candidate.reminderType === "weekly_review") weeklyReviewCount += 1;
      if (candidate.reminderType === "monthly_closing") monthlyClosingCount += 1;
      if (candidate.reminderType === "daily_digest") digestCount += 1;
    }
  }

  return {
    processedUsers: users.length,
    queued:
      budgetCount +
      goalCount +
      weeklyCount +
      recurringCount +
      cashflowCount +
      goalPaceCount +
      weeklyReviewCount +
      monthlyClosingCount +
      digestCount,
    queuedByType: {
      budget: budgetCount,
      goal: goalCount,
      weekly: weeklyCount,
      recurring: recurringCount,
      cashflow: cashflowCount,
      goalPace: goalPaceCount,
      weeklyReview: weeklyReviewCount,
      monthlyClosing: monthlyClosingCount,
      digest: digestCount
    }
  };
};
