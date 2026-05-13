import { prisma } from "@/lib/prisma";
import {
  getReminderPreference,
  isReminderSnoozed,
  isWithinReminderQuietHours,
  resolveReminderCooldownSince
} from "@/lib/services/reminders/preference";
import { getYesterdayRecapAlert } from "@/lib/services/reminders/dispatch/alert-builders";
import { buildReminderDispatchPlan } from "@/lib/services/reminders/dispatch/dispatch-plan";
import {
  getReminderCountSentToday,
  queueReminderOnce
} from "@/lib/services/reminders/dispatch/event-store";
import { getReminderTypePriority } from "@/lib/services/reminders/dispatch/priority";
import { getJakartaDayBounds } from "@/lib/services/reminders/dispatch/time";
import { type ReminderCandidate } from "@/lib/services/reminders/dispatch/types";

export const runProactiveReminders = async (baseDate = new Date()) => {
  const activeUsers = await prisma.user.findMany({
    where: {
      registrationStatus: "COMPLETED",
      onboardingStatus: "COMPLETED"
    },
    select: { id: true }
  });
  const userIds = activeUsers.map((item) => item.id);
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

  const { start: dayStart, end: dayEnd } = getJakartaDayBounds(baseDate);

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
    const dailyRecapAlert = reminderPreference.weeklyReviewEnabled
      ? await getYesterdayRecapAlert(user.id, baseDate)
      : null;
    if (dailyRecapAlert) {
      candidates.push({
        reminderType: "weekly_review",
        marker: dailyRecapAlert.marker,
        message: dailyRecapAlert.message,
        since: resolveReminderCooldownSince(baseDate, dayStart, reminderPreference),
        priority: getReminderTypePriority("weekly_review")
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
        since: candidate.since,
        sentAt: baseDate
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
