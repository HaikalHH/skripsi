import { describe, expect, it } from "vitest";
import { buildReminderDispatchPlan } from "@/lib/services/reminders/reminder-service";

describe("reminder service", () => {
  it("compresses overflow reminders into a digest when capacity is limited", () => {
    const plan = buildReminderDispatchPlan({
      remainingDailyCapacity: 2,
      baseDate: new Date("2026-03-12T10:00:00.000Z"),
      candidates: [
        {
          reminderType: "cashflow_buffer",
          marker: "cashflow",
          message: "Reminder Cashflow: buffer tipis.",
          since: new Date("2026-03-12T00:00:00.000Z"),
          priority: 95
        },
        {
          reminderType: "budget",
          marker: "budget",
          message: "Reminder Budget: makan hampir habis.",
          since: new Date("2026-03-12T00:00:00.000Z"),
          priority: 75
        },
        {
          reminderType: "goal_off_track",
          marker: "goal",
          message: "Reminder Goal: rumah mulai off-track.",
          since: new Date("2026-03-12T00:00:00.000Z"),
          priority: 82
        }
      ]
    });

    expect(plan).toHaveLength(2);
    expect(plan[0]?.reminderType).toBe("cashflow_buffer");
    expect(plan[1]?.reminderType).toBe("daily_digest");
    expect(plan[1]?.message).toContain("Ringkasan reminder penting hari ini:");
  });

  it("keeps a single urgent reminder when only one slot remains", () => {
    const plan = buildReminderDispatchPlan({
      remainingDailyCapacity: 1,
      baseDate: new Date("2026-03-12T10:00:00.000Z"),
      candidates: [
        {
          reminderType: "cashflow_buffer",
          marker: "cashflow",
          message: "Reminder Cashflow: buffer tipis.",
          since: new Date("2026-03-12T00:00:00.000Z"),
          priority: 95
        },
        {
          reminderType: "weekly_review",
          marker: "weekly",
          message: "Review Mingguan: expense naik.",
          since: new Date("2026-03-10T00:00:00.000Z"),
          priority: 35
        }
      ]
    });

    expect(plan).toHaveLength(1);
    expect(plan[0]?.reminderType).toBe("cashflow_buffer");
  });

  it("prioritizes multiple critical reminders before digesting lower-priority ones", () => {
    const plan = buildReminderDispatchPlan({
      remainingDailyCapacity: 2,
      baseDate: new Date("2026-03-12T10:00:00.000Z"),
      candidates: [
        {
          reminderType: "cashflow_buffer",
          marker: "cashflow",
          message: "Reminder Cashflow: buffer tipis.",
          since: new Date("2026-03-12T00:00:00.000Z"),
          priority: 95
        },
        {
          reminderType: "recurring_due",
          marker: "recurring",
          message: "Reminder Langganan: tagihan internet besok.",
          since: new Date("2026-03-12T00:00:00.000Z"),
          priority: 90
        },
        {
          reminderType: "budget",
          marker: "budget",
          message: "Reminder Budget: makan hampir habis.",
          since: new Date("2026-03-12T00:00:00.000Z"),
          priority: 75
        }
      ]
    });

    expect(plan).toHaveLength(2);
    expect(plan[0]?.reminderType).toBe("cashflow_buffer");
    expect(plan[1]?.reminderType).toBe("recurring_due");
  });
});
