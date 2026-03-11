import { describe, expect, it } from "vitest";
import { buildExpenseBreakdownSummaryLines } from "@/lib/services/onboarding-calculation-service";

describe("onboarding calculation service", () => {
  it("builds detailed expense breakdown summary lines for the final onboarding message", () => {
    const lines = buildExpenseBreakdownSummaryLines({
      food: 1200000,
      transport: 300000,
      bills: 850000,
      entertainment: 200000,
      others: 400000
    });

    expect(lines.join("\n")).toContain("Rincian pengeluaran bulanan yang saya catat:");
    expect(lines.join("\n")).toContain("Makan & kebutuhan harian");
    expect(lines.join("\n")).toContain("Tagihan & kewajiban rutin");
    expect(lines.join("\n")).toContain("Pengelompokan kategori yang saya pakai:");
    expect(lines.join("\n")).toContain("sembako");
    expect(lines.join("\n")).toContain("BPJS");
  });

  it("returns no lines when breakdown is empty", () => {
    expect(
      buildExpenseBreakdownSummaryLines({
        food: 0,
        transport: 0,
        bills: 0,
        entertainment: 0,
        others: 0
      })
    ).toEqual([]);
  });
});
