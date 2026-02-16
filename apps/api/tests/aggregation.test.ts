import { describe, expect, it } from "vitest";
import { aggregateTransactions, getPeriodRange } from "@/lib/services/aggregation";

describe("report aggregation", () => {
  it("calculates totals and category breakdown", () => {
    const now = new Date("2026-02-15T10:00:00Z");
    const range = getPeriodRange("weekly", now);
    const result = aggregateTransactions(
      [
        { type: "INCOME", amount: 1000, category: "Salary", occurredAt: new Date("2026-02-14T10:00:00Z") },
        { type: "EXPENSE", amount: 200, category: "Food", occurredAt: new Date("2026-02-14T12:00:00Z") },
        { type: "EXPENSE", amount: 150, category: "Transport", occurredAt: new Date("2026-02-15T07:00:00Z") },
        { type: "EXPENSE", amount: 50, category: "Food", occurredAt: new Date("2026-02-15T08:00:00Z") }
      ],
      range
    );

    expect(result.incomeTotal).toBe(1000);
    expect(result.expenseTotal).toBe(400);
    expect(result.categoryBreakdown[0]).toEqual({ category: "Food", total: 250 });
    expect(result.trend.length).toBeGreaterThan(0);
  });
});
