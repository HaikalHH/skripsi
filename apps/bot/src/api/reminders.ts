import { env } from "../config";
import { logger } from "../logger";

let reminderSweepTimer: NodeJS.Timeout | null = null;

const getNextReminderSweepDelayMs = (baseDate = new Date()) => {
  const jakartaNow = new Date(baseDate.getTime() + 7 * 60 * 60 * 1000);
  const nextSweepJakarta = new Date(
    Date.UTC(
      jakartaNow.getUTCFullYear(),
      jakartaNow.getUTCMonth(),
      jakartaNow.getUTCDate(),
      7,
      0,
      0,
      0
    )
  );

  if (jakartaNow.getUTCHours() >= 7) {
    nextSweepJakarta.setUTCDate(nextSweepJakarta.getUTCDate() + 1);
  }

  const nextSweepUtc = new Date(nextSweepJakarta.getTime() - 7 * 60 * 60 * 1000);
  return Math.max(1_000, nextSweepUtc.getTime() - baseDate.getTime());
};

const runReminderSweep = async () => {
  try {
    const response = await fetch(`${env.API_BASE_URL}/api/bot/reminders/run`, {
      method: "POST",
      headers: {
        "x-bot-token": env.BOT_INTERNAL_TOKEN
      }
    });

    if (!response.ok) {
      const text = await response.text();
      logger.warn({ status: response.status, text }, "Reminder sweep failed");
    }
  } catch (error) {
    logger.warn({ err: error }, "Failed to run reminder sweep");
  }
};

const scheduleNextReminderSweep = () => {
  if (reminderSweepTimer) clearTimeout(reminderSweepTimer);

  const delayMs = getNextReminderSweepDelayMs();
  reminderSweepTimer = setTimeout(() => {
    void (async () => {
      await runReminderSweep();
      scheduleNextReminderSweep();
    })();
  }, delayMs);

  logger.info({ delayMs }, "Next reminder sweep scheduled for 07:00 WIB");
};

export const startReminderSweep = () => {
  scheduleNextReminderSweep();
};

export const stopReminderSweep = () => {
  if (!reminderSweepTimer) return;
  clearTimeout(reminderSweepTimer);
  reminderSweepTimer = null;
};
