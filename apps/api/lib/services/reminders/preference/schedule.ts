import { type ReminderPreferenceState } from "@/lib/services/reminders/preference/types";

const JAKARTA_UTC_OFFSET = 7;

export const resolveReminderCooldownSince = (
  baseDate: Date,
  minimumSince: Date,
  preference: ReminderPreferenceState
) => {
  const cooldownSince = new Date(baseDate.getTime() - preference.minIntervalHours * 60 * 60 * 1000);
  return cooldownSince.getTime() > minimumSince.getTime() ? cooldownSince : minimumSince;
};

export const isWithinReminderQuietHours = (baseDate: Date, preference: ReminderPreferenceState) => {
  if (preference.quietHoursStart == null || preference.quietHoursEnd == null) return false;

  const hour = (baseDate.getUTCHours() + JAKARTA_UTC_OFFSET + 24) % 24;
  if (preference.quietHoursStart === preference.quietHoursEnd) return false;
  if (preference.quietHoursStart < preference.quietHoursEnd) {
    return hour >= preference.quietHoursStart && hour < preference.quietHoursEnd;
  }
  return hour >= preference.quietHoursStart || hour < preference.quietHoursEnd;
};

export const isReminderSnoozed = (baseDate: Date, preference: ReminderPreferenceState) =>
  preference.snoozedUntil != null && preference.snoozedUntil.getTime() > baseDate.getTime();
