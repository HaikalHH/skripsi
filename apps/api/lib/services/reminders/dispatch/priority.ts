import { type ReminderTypeKey } from "@/lib/services/reminders/dispatch/types";

export const CRITICAL_REMINDER_PRIORITY = 90;

export const getReminderTypePriority = (reminderType: ReminderTypeKey) => {
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
