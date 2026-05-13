import { prisma } from "@/lib/prisma";
import {
  DEFAULT_REMINDER_PREFERENCE,
  type ReminderPreferenceState,
  type ReminderPreferenceUpdate
} from "@/lib/services/reminders/preference/types";

const getReminderPreferenceModel = () =>
  (prisma as unknown as {
    reminderPreference?: {
      findUnique: (args: { where: { userId: string } }) => Promise<any>;
      upsert: (args: {
        where: { userId: string };
        update: Record<string, unknown>;
        create: Record<string, unknown>;
      }) => Promise<any>;
    };
  }).reminderPreference;

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object" && "toString" in value) {
    const parsed = Number((value as { toString: () => string }).toString());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const normalizePreferenceRow = (row: Record<string, unknown> | null | undefined): ReminderPreferenceState => ({
  budgetEnabled:
    typeof row?.budgetEnabled === "boolean" ? row.budgetEnabled : DEFAULT_REMINDER_PREFERENCE.budgetEnabled,
  weeklyEnabled:
    typeof row?.weeklyEnabled === "boolean" ? row.weeklyEnabled : DEFAULT_REMINDER_PREFERENCE.weeklyEnabled,
  weeklyReviewEnabled:
    typeof row?.weeklyReviewEnabled === "boolean"
      ? row.weeklyReviewEnabled
      : DEFAULT_REMINDER_PREFERENCE.weeklyReviewEnabled,
  recurringEnabled:
    typeof row?.recurringEnabled === "boolean"
      ? row.recurringEnabled
      : DEFAULT_REMINDER_PREFERENCE.recurringEnabled,
  cashflowEnabled:
    typeof row?.cashflowEnabled === "boolean" ? row.cashflowEnabled : DEFAULT_REMINDER_PREFERENCE.cashflowEnabled,
  goalEnabled:
    typeof row?.goalEnabled === "boolean" ? row.goalEnabled : DEFAULT_REMINDER_PREFERENCE.goalEnabled,
  monthlyClosingEnabled:
    typeof row?.monthlyClosingEnabled === "boolean"
      ? row.monthlyClosingEnabled
      : DEFAULT_REMINDER_PREFERENCE.monthlyClosingEnabled,
  quietHoursStart: toNumber(row?.quietHoursStart) ?? DEFAULT_REMINDER_PREFERENCE.quietHoursStart,
  quietHoursEnd: toNumber(row?.quietHoursEnd) ?? DEFAULT_REMINDER_PREFERENCE.quietHoursEnd,
  minIntervalHours:
    Math.max(1, Math.min(168, toNumber(row?.minIntervalHours) ?? DEFAULT_REMINDER_PREFERENCE.minIntervalHours)),
  maxPerDay: Math.max(1, Math.min(20, toNumber(row?.maxPerDay) ?? DEFAULT_REMINDER_PREFERENCE.maxPerDay)),
  snoozedUntil: toDate(row?.snoozedUntil)
});

export const getReminderPreference = async (userId: string): Promise<ReminderPreferenceState> => {
  const reminderPreferenceModel = getReminderPreferenceModel();
  if (!reminderPreferenceModel) {
    return { ...DEFAULT_REMINDER_PREFERENCE };
  }

  try {
    const row = await reminderPreferenceModel.findUnique({
      where: { userId }
    });
    return normalizePreferenceRow(row);
  } catch {
    return { ...DEFAULT_REMINDER_PREFERENCE };
  }
};

export const updateReminderPreference = async (
  userId: string,
  updates: ReminderPreferenceUpdate
): Promise<ReminderPreferenceState> => {
  const reminderPreferenceModel = getReminderPreferenceModel();
  const sanitizedUpdates: ReminderPreferenceUpdate = {
    ...(typeof updates.budgetEnabled === "boolean" ? { budgetEnabled: updates.budgetEnabled } : {}),
    ...(typeof updates.weeklyEnabled === "boolean" ? { weeklyEnabled: updates.weeklyEnabled } : {}),
    ...(typeof updates.weeklyReviewEnabled === "boolean"
      ? { weeklyReviewEnabled: updates.weeklyReviewEnabled }
      : {}),
    ...(typeof updates.recurringEnabled === "boolean"
      ? { recurringEnabled: updates.recurringEnabled }
      : {}),
    ...(typeof updates.cashflowEnabled === "boolean" ? { cashflowEnabled: updates.cashflowEnabled } : {}),
    ...(typeof updates.goalEnabled === "boolean" ? { goalEnabled: updates.goalEnabled } : {}),
    ...(typeof updates.monthlyClosingEnabled === "boolean"
      ? { monthlyClosingEnabled: updates.monthlyClosingEnabled }
      : {}),
    ...(updates.quietHoursStart == null
      ? {}
      : { quietHoursStart: Math.max(0, Math.min(23, Number(updates.quietHoursStart))) }),
    ...(updates.quietHoursEnd == null
      ? {}
      : { quietHoursEnd: Math.max(0, Math.min(23, Number(updates.quietHoursEnd))) }),
    ...(updates.minIntervalHours == null
      ? {}
      : { minIntervalHours: Math.max(1, Math.min(168, Math.round(Number(updates.minIntervalHours)))) }),
    ...(updates.maxPerDay == null
      ? {}
      : { maxPerDay: Math.max(1, Math.min(20, Math.round(Number(updates.maxPerDay)))) }),
    ...("snoozedUntil" in updates
      ? {
          snoozedUntil:
            updates.snoozedUntil == null ? null : new Date(updates.snoozedUntil)
        }
      : {})
  };

  if (!reminderPreferenceModel) {
    return {
      ...DEFAULT_REMINDER_PREFERENCE,
      ...sanitizedUpdates
    };
  }

  try {
    const row = await reminderPreferenceModel.upsert({
      where: { userId },
      update: sanitizedUpdates,
      create: {
        userId,
        ...DEFAULT_REMINDER_PREFERENCE,
        ...sanitizedUpdates
      }
    });
    return normalizePreferenceRow(row);
  } catch {
    return {
      ...DEFAULT_REMINDER_PREFERENCE,
      ...sanitizedUpdates
    };
  }
};
