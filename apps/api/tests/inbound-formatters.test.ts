import { describe, expect, it } from "vitest";
import { buildBudgetSetText, confirmTransactionText } from "@/lib/features/inbound/formatters";

describe("inbound formatters", () => {
  it("formats transaction confirmation amounts as fixed rupiah", () => {
    const text = confirmTransactionText({
      type: "EXPENSE",
      amount: 10_000,
      category: "Others",
      occurredAt: new Date("2026-04-03T15:38:46.096Z")
    });

    expect(text).toContain("- Amount: Rp. 10.000,00");
  });

  it("formats budget summaries as fixed rupiah", () => {
    const text = buildBudgetSetText({
      category: "Food & Drink",
      monthlyLimit: 1_000_000,
      spentThisMonth: 100_000,
      remainingThisMonth: 900_000
    });

    expect(text).toContain("- Limit bulanan: Rp. 1.000.000,00");
    expect(text).toContain("- Terpakai bulan ini: Rp. 100.000,00");
    expect(text).toContain("- Sisa bulan ini: Rp. 900.000,00");
  });
});
