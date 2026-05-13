export type ReminderTypeKey =
  | "budget"
  | "goal_reached"
  | "weekly_spike"
  | "recurring_due"
  | "cashflow_buffer"
  | "goal_off_track"
  | "weekly_review"
  | "monthly_closing"
  | "daily_digest";

export type ReminderCandidate = {
  reminderType: ReminderTypeKey;
  marker: string;
  message: string;
  since: Date;
  priority: number;
};
