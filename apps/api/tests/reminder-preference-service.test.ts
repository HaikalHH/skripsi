import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const store = {
    reminderPreferences: [] as any[]
  };

  const prismaMock: any = {
    reminderPreference: {
      findUnique: vi.fn(async ({ where }: any) =>
        store.reminderPreferences.find((item) => item.userId === where.userId) ?? null
      ),
      upsert: vi.fn(async ({ where, update, create }: any) => {
        const existing = store.reminderPreferences.find((item) => item.userId === where.userId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }

        const row = {
          id: `pref_${store.reminderPreferences.length + 1}`,
          ...create
        };
        store.reminderPreferences.push(row);
        return row;
      })
    }
  };

  return { store, prismaMock };
});

vi.mock("@/lib/prisma", () => ({
  prisma: hoisted.prismaMock
}));

import {
  buildReminderPreferenceText,
  getReminderPreference,
  parseReminderPreferenceCommand,
  updateReminderPreference
} from "@/lib/services/reminders/reminder-preference-service";

describe("reminder preference service", () => {
  beforeEach(() => {
    hoisted.store.reminderPreferences = [];
    vi.useRealTimers();
  });

  it("returns defaults when no preference is stored", async () => {
    const preference = await getReminderPreference("user_1");
    expect(preference.budgetEnabled).toBe(true);
    expect(preference.minIntervalHours).toBe(24);
    expect(preference.maxPerDay).toBe(3);
  });

  it("updates and renders preference state", async () => {
    const preference = await updateReminderPreference("user_1", {
      budgetEnabled: false,
      minIntervalHours: 48,
      maxPerDay: 2
    });

    const text = buildReminderPreferenceText(preference, {
      action: "UPDATE",
      updates: {
        budgetEnabled: false,
        minIntervalHours: 48,
        maxPerDay: 2
      }
    });

    expect(preference.budgetEnabled).toBe(false);
    expect(preference.minIntervalHours).toBe(48);
    expect(preference.maxPerDay).toBe(2);
    expect(text).toContain("budget dimatikan");
    expect(text).toContain("48 jam");
    expect(text).toContain("2 reminder per hari");
  });

  it("parses flexible reminder preference commands", () => {
    expect(parseReminderPreferenceCommand("matikan reminder budget")).toEqual({
      action: "UPDATE",
      updates: {
        budgetEnabled: false
      }
    });
    expect(parseReminderPreferenceCommand("status reminder")).toEqual({
      action: "STATUS"
    });
    expect(parseReminderPreferenceCommand("matikan review mingguan")).toEqual({
      action: "UPDATE",
      updates: {
        weeklyReviewEnabled: false
      }
    });
    expect(parseReminderPreferenceCommand("batasi reminder 2 per hari")).toEqual({
      action: "UPDATE",
      updates: {
        maxPerDay: 2
      }
    });
  });

  it("parses snooze reminder command with relative time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T10:00:00.000Z"));

    const command = parseReminderPreferenceCommand("pause reminder 12 jam");
    expect(command?.action).toBe("UPDATE");
    if (command?.action === "UPDATE") {
      expect(command.updates.snoozedUntil).toEqual(new Date("2026-03-12T22:00:00.000Z"));
    }
  });
});

