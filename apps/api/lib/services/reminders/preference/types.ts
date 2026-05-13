export type ReminderPreferenceState = {
  budgetEnabled: boolean;
  weeklyEnabled: boolean;
  weeklyReviewEnabled: boolean;
  recurringEnabled: boolean;
  cashflowEnabled: boolean;
  goalEnabled: boolean;
  monthlyClosingEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  minIntervalHours: number;
  maxPerDay: number;
  snoozedUntil: Date | null;
};

export type ReminderPreferenceUpdate = Partial<ReminderPreferenceState>;

export type ReminderPreferenceCommand =
  | {
      action: "STATUS";
    }
  | {
      action: "UPDATE";
      updates: ReminderPreferenceUpdate;
    };

export const DEFAULT_REMINDER_PREFERENCE: ReminderPreferenceState = {
  budgetEnabled: true,
  weeklyEnabled: true,
  weeklyReviewEnabled: true,
  recurringEnabled: true,
  cashflowEnabled: true,
  goalEnabled: true,
  monthlyClosingEnabled: true,
  quietHoursStart: null,
  quietHoursEnd: null,
  minIntervalHours: 24,
  maxPerDay: 3,
  snoozedUntil: null
};
