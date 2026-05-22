import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {}
}));

vi.mock("@/lib/env", () => ({
  env: {
    REPORTING_SERVICE_URL: "http://localhost:8000"
  }
}));

import { buildReportText } from "@/lib/services/reporting/report-builder";

describe("buildReportText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formats default report summaries with fixed rupiah", () => {
    const text = buildReportText(
      "weekly",
      6_000_000,
      1_250_000,
      [
        { category: "Bills", total: 750_000 },
        { category: "Food & Drink", total: 500_000 }
      ],
      "minggu ini",
      [
        {
          id: "tx_1",
          type: "EXPENSE",
          amount: 750_000,
          category: "Bills",
          occurredAt: new Date("2026-03-01T00:00:00.000Z")
        }
      ],
      {
        categoryBudgets: [
          { category: "Bills", monthlyLimit: 1_500_000 },
          { category: "Food & Drink", monthlyLimit: 1_000_000 },
          { category: "hobi", monthlyLimit: 700_000 }
        ]
      }
    );

    expect(text).toContain("📊 Report weekly:");
    expect(text).toContain("Income: Rp6.000.000");
    expect(text).toContain("Expense: Rp1.250.000");
    expect(text).toContain("Balance: Rp4.750.000");
    expect(text).toContain("📌 Progress budget kategori:");
    expect(text).toContain("🧾 Bills: Rp750.000 / Rp1.500.000 (50.0%)");
    expect(text).toContain("🍽️ Food & Drink: Rp500.000 / Rp1.000.000 (50.0%)");
    expect(text).toContain("🎮 hobi: Rp0 / Rp700.000 (0.0%)");
    expect(text).toContain("█████░░░░░");
    expect(text).not.toContain("Top expense:");
    expect(text).not.toContain("Daftar transaksi:");
  });

  it("formats custom-range summaries with fixed rupiah", () => {
    const text = buildReportText(
      "monthly",
      6_000_000,
      1_250_000,
      [{ category: "Bills", total: 750_000 }],
      "Januari 2026"
    );

    expect(text).toContain("Ringkasan Januari 2026:");
    expect(text).toContain("Income: Rp6.000.000");
    expect(text).toContain("Expense: Rp1.250.000");
    expect(text).toContain("Balance: Rp4.750.000");
  });

  it("does not double count spending across budget categories in the same bucket", () => {
    const text = buildReportText(
      "daily",
      0,
      100_000,
      [{ category: "Entertainment", total: 100_000 }],
      "hari ini",
      [],
      {
        categoryBudgets: [
          { category: "Entertainment", monthlyLimit: 200_000 },
          { category: "hobi", monthlyLimit: 700_000 }
        ]
      }
    );

    expect(text).toContain("🎮 Entertainment: Rp100.000 / Rp200.000 (50.0%)");
    expect(text).toContain("🎮 hobi: Rp0 / Rp700.000 (0.0%)");
  });
});
