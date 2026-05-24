import {
  type ReminderPreferenceCommand,
  type ReminderPreferenceState
} from "@/lib/services/reminders/preference/types";

const toggleLabelMap = {
  budgetEnabled: "budget",
  weeklyEnabled: "spending mingguan",
  weeklyReviewEnabled: "recap harian jam 7 pagi",
  recurringEnabled: "langganan",
  cashflowEnabled: "cashflow",
  goalEnabled: "goal",
  monthlyClosingEnabled: "closing bulanan"
} satisfies Record<
  Exclude<
    keyof ReminderPreferenceState,
    "quietHoursStart" | "quietHoursEnd" | "minIntervalHours" | "maxPerDay" | "snoozedUntil"
  >,
  string
>;

const formatJakartaDateTime = (date: Date) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta"
  }).format(date);

const buildQuietHoursText = (preference: ReminderPreferenceState) => {
  if (preference.quietHoursStart == null || preference.quietHoursEnd == null) {
    return formatToggle(false);
  }
  return `${String(preference.quietHoursStart).padStart(2, "0")}:00-${String(
    preference.quietHoursEnd
  ).padStart(2, "0")}:00 WIB`;
};

const formatToggle = (enabled: boolean) => (enabled ? "🟢 ON" : "🔴 OFF");

export const buildReminderPreferenceText = (
  preference: ReminderPreferenceState,
  updateCommand?: ReminderPreferenceCommand | null
) => {
  const lines = [
    "Pengaturan reminder kamu sekarang:",
    `1. Budget: ${formatToggle(preference.budgetEnabled)}`,
    `2. Spending mingguan: ${formatToggle(preference.weeklyEnabled)}`,
    `3. Recap harian jam 07.00: ${formatToggle(preference.weeklyReviewEnabled)}`,
    `4. Langganan/recurring: ${formatToggle(preference.recurringEnabled)}`,
    `5. Cashflow: ${formatToggle(preference.cashflowEnabled)}`,
    `6. Goal: ${formatToggle(preference.goalEnabled)}`,
    `7. Closing bulanan: ${formatToggle(preference.monthlyClosingEnabled)}`,
    `8. Jeda minimum reminder sejenis: ${preference.minIntervalHours} jam`,
    `9. Maksimal reminder per hari: ${preference.maxPerDay}`,
    `10. Quiet hours: ${buildQuietHoursText(preference)}`,
    `11. Snooze sampai: ${preference.snoozedUntil ? formatJakartaDateTime(preference.snoozedUntil) : formatToggle(false)}`
  ];

  if (updateCommand?.action === "UPDATE") {
    const changedLabels = Object.entries(updateCommand.updates)
      .map(([key, value]) => {
        if (key === "minIntervalHours" && typeof value === "number") {
          return `jeda ${value} jam`;
        }
        if (key === "maxPerDay" && typeof value === "number") {
          return `batas ${value} reminder per hari`;
        }
        if (key === "quietHoursStart" || key === "quietHoursEnd") {
          return "quiet hours diperbarui";
        }
        if (key === "snoozedUntil") {
          return value
            ? `reminder dijeda sampai ${formatJakartaDateTime(new Date(value as string | Date))}`
            : "snooze reminder dihapus";
        }
        if (typeof value !== "boolean") return null;
        return `${toggleLabelMap[key as keyof typeof toggleLabelMap]} ${formatToggle(value)}`;
      })
      .filter(Boolean);

    if (changedLabels.length) {
      lines.unshift(`Pengaturan reminder diperbarui: ${changedLabels.join(", ")}.`);
    }
  }

  return lines.join("\n");
};
