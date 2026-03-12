import { describe, expect, it } from "vitest";
import { analyzeRecurringExpenses } from "@/lib/services/transactions/recurring-expense-service";

describe("recurring expense service", () => {
  it("detects monthly recurring subscriptions with confidence and next expected date", () => {
    const entries = analyzeRecurringExpenses([
      {
        category: "Entertainment",
        amount: 50000,
        merchant: "Spotify",
        rawText: "spotify premium",
        occurredAt: new Date("2026-01-10T10:00:00.000Z")
      },
      {
        category: "Entertainment",
        amount: 50000,
        merchant: "Spotify",
        rawText: "spotify premium",
        occurredAt: new Date("2026-02-10T10:00:00.000Z")
      },
      {
        category: "Entertainment",
        amount: 55000,
        merchant: "Spotify",
        rawText: "spotify family",
        occurredAt: new Date("2026-03-10T10:00:00.000Z")
      }
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe("Spotify");
    expect(entries[0].cadence).toBe("monthly");
    expect(entries[0].isSubscriptionLikely).toBe(true);
    expect(entries[0].averageAmount).toBeCloseTo(51666.67, 1);
    expect(entries[0].confidenceScore).toBeGreaterThan(0.7);
    expect(entries[0].nextExpectedAt).not.toBeNull();
  });
});

