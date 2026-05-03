import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {}
}));

vi.mock("@/lib/env", () => ({
  env: {
    REPORTING_SERVICE_URL: "http://localhost:8000"
  }
}));

import { buildReportText } from "@/lib/services/reporting/report-service";

describe("buildReportText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formats default report summaries with fixed rupiah", () => {
    const text = buildReportText(
      "weekly",
      6_000_000,
      1_250_000,
      [{ category: "Bills", total: 750_000 }],
      "minggu ini"
    );

    expect(text).toContain("Report weekly:");
    expect(text).toContain("Income: Rp6.000.000");
    expect(text).toContain("Expense: Rp1.250.000");
    expect(text).toContain("Balance: Rp4.750.000");
    expect(text).toContain("Top expense: Bills (Rp750.000)");
    expect(text).toContain("Daftar transaksi:");
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
});
