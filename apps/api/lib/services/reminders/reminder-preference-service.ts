import { prisma } from "@/lib/prisma";

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

const DEFAULT_REMINDER_PREFERENCE: ReminderPreferenceState = {
  budgetEnabled: false,
  weeklyEnabled: false,
  weeklyReviewEnabled: true,
  recurringEnabled: false,
  cashflowEnabled: false,
  goalEnabled: false,
  monthlyClosingEnabled: false,
  quietHoursStart: null,
  quietHoursEnd: null,
  minIntervalHours: 24,
  maxPerDay: 1,
  snoozedUntil: null
};

const JAKARTA_UTC_OFFSET = 7;

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
    typeof row?.cashflowEnabled === "boolean"
      ? row.cashflowEnabled
      : DEFAULT_REMINDER_PREFERENCE.cashflowEnabled,
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
    return "tidak diatur";
  }
  return `${String(preference.quietHoursStart).padStart(2, "0")}:00-${String(
    preference.quietHoursEnd
  ).padStart(2, "0")}:00 WIB`;
};

export const buildReminderPreferenceText = (
  preference: ReminderPreferenceState,
  updateCommand?: ReminderPreferenceCommand | null
) => {
  const lines = [
    "Pengaturan reminder kamu sekarang:",
    `- Budget: ${preference.budgetEnabled ? "aktif" : "mati"}`,
    `- Spending mingguan: ${preference.weeklyEnabled ? "aktif" : "mati"}`,
    `- Recap harian jam 07.00: ${preference.weeklyReviewEnabled ? "aktif" : "mati"}`,
    `- Langganan/recurring: ${preference.recurringEnabled ? "aktif" : "mati"}`,
    `- Cashflow: ${preference.cashflowEnabled ? "aktif" : "mati"}`,
    `- Goal: ${preference.goalEnabled ? "aktif" : "mati"}`,
    `- Closing bulanan: ${preference.monthlyClosingEnabled ? "aktif" : "mati"}`,
    `- Jeda minimum reminder sejenis: ${preference.minIntervalHours} jam`,
    `- Maksimal reminder per hari: ${preference.maxPerDay}`,
    `- Quiet hours: ${buildQuietHoursText(preference)}`,
    `- Snooze sampai: ${preference.snoozedUntil ? formatJakartaDateTime(preference.snoozedUntil) : "tidak aktif"}`
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
          return value ? `reminder dijeda sampai ${formatJakartaDateTime(new Date(value as string | Date))}` : "snooze reminder dihapus";
        }
        if (typeof value !== "boolean") return null;
        return `${toggleLabelMap[key as keyof typeof toggleLabelMap]} ${value ? "diaktifkan" : "dimatikan"}`;
      })
      .filter(Boolean);

    if (changedLabels.length) {
      lines.unshift(`Pengaturan reminder diperbarui: ${changedLabels.join(", ")}.`);
    }
  }

  return lines.join("\n");
};

export const parseReminderPreferenceCommand = (rawText: string): ReminderPreferenceCommand | null => {
  const text = rawText.trim().toLowerCase();
  if (
    !text.includes("reminder") &&
    !text.includes("notif") &&
    !text.includes("review") &&
    !text.includes("closing")
  ) {
    return null;
  }

  if (/\b(status|setting|pengaturan|setelan).*(reminder|notif)\b|\b(reminder|notif).*(status|setting|pengaturan|setelan)\b/i.test(text)) {
    return { action: "STATUS" };
  }

  const snoozeHoursMatch = text.match(
    /\b(?:pause|snooze|jeda(?:kan)?|mute)\s+(?:semua\s+)?(?:reminder|notif)?\s*(?:selama\s+)?(\d{1,3})\s*jam\b/i
  );
  if (snoozeHoursMatch) {
    const snoozedUntil = new Date(Date.now() + Number(snoozeHoursMatch[1]) * 60 * 60 * 1000);
    return {
      action: "UPDATE",
      updates: { snoozedUntil }
    };
  }

  const snoozeDaysMatch = text.match(
    /\b(?:pause|snooze|jeda(?:kan)?|mute|jangan kirim)\s+(?:semua\s+)?(?:reminder|notif)?\s*(?:selama\s+)?(\d{1,2})\s*hari\b/i
  );
  if (snoozeDaysMatch) {
    const snoozedUntil = new Date(Date.now() + Number(snoozeDaysMatch[1]) * 24 * 60 * 60 * 1000);
    return {
      action: "UPDATE",
      updates: { snoozedUntil }
    };
  }

  if (/\b(?:jangan kirim|pause|snooze|mute)\b.*\b(?:sampai|hingga)\s+besok\b/i.test(text)) {
    const snoozedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return {
      action: "UPDATE",
      updates: { snoozedUntil }
    };
  }

  if (/\b(?:lanjutkan|aktifkan lagi|hapus snooze|reset snooze|buka jeda)\b.*\b(reminder|notif)\b/i.test(text)) {
    return {
      action: "UPDATE",
      updates: { snoozedUntil: null }
    };
  }

  const updates: ReminderPreferenceUpdate = {};
  const enable = /\b(aktifkan|nyalakan|on|hidupkan)\b/i.test(text);
  const disable = /\b(matikan|nonaktifkan|off|mute|stop)\b/i.test(text);
  const toggleValue = enable ? true : disable ? false : null;

  if (toggleValue !== null) {
    if (/\bsemua\b/i.test(text)) {
      updates.budgetEnabled = toggleValue;
      updates.weeklyEnabled = toggleValue;
      updates.weeklyReviewEnabled = toggleValue;
      updates.recurringEnabled = toggleValue;
      updates.cashflowEnabled = toggleValue;
      updates.goalEnabled = toggleValue;
      updates.monthlyClosingEnabled = toggleValue;
    }
    if (/\b(budget|anggaran)\b/i.test(text)) updates.budgetEnabled = toggleValue;
    if (/\b(?:weekly|spending mingguan|lonjakan mingguan|reminder mingguan)\b/i.test(text)) {
      updates.weeklyEnabled = toggleValue;
    }
    if (/\b(review mingguan|weekly review|ringkasan mingguan|digest mingguan|recap harian|rekap harian|recap pagi|jam 7)\b/i.test(text)) {
      updates.weeklyReviewEnabled = toggleValue;
    }
    if (/\b(recurring|langganan|subscription)\b/i.test(text)) updates.recurringEnabled = toggleValue;
    if (/\b(cashflow|gajian|buffer|payday)\b/i.test(text)) updates.cashflowEnabled = toggleValue;
    if (/\b(goal|target)\b/i.test(text)) updates.goalEnabled = toggleValue;
    if (/\b(closing bulanan|monthly closing|review bulanan|ringkasan bulanan|closing)\b/i.test(text)) {
      updates.monthlyClosingEnabled = toggleValue;
    }
  }

  const intervalMatch = text.match(/\b(?:jeda|cooldown|interval)\s+reminder\s+(\d{1,3})\s+jam\b/i);
  if (intervalMatch) {
    updates.minIntervalHours = Number(intervalMatch[1]);
  }

  const maxPerDayMatch =
    text.match(/\b(?:maks(?:imal)?|batasi|limit)\s+(?:reminder\s+)?(\d{1,2})\s*(?:per|\/)\s*hari\b/i) ??
    text.match(/\b(\d{1,2})\s+reminder\s+sehari\b/i);
  if (maxPerDayMatch) {
    updates.maxPerDay = Number(maxPerDayMatch[1]);
  }

  if (/\b(?:jangan kirim reminder malam|mute malam|diam malam)\b/i.test(text)) {
    updates.quietHoursStart = 21;
    updates.quietHoursEnd = 7;
  }
  if (/\b(?:reset quiet hours|hapus quiet hours|bebasin jam reminder)\b/i.test(text)) {
    updates.quietHoursStart = null;
    updates.quietHoursEnd = null;
  }

  if (!Object.keys(updates).length) return null;
  return {
    action: "UPDATE",
    updates
  };
};
