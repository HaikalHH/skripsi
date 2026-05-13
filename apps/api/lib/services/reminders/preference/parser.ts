import {
  type ReminderPreferenceCommand,
  type ReminderPreferenceUpdate
} from "@/lib/services/reminders/preference/types";

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
    if (/\b(recurring|langganan)\b/i.test(text)) updates.recurringEnabled = toggleValue;
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
