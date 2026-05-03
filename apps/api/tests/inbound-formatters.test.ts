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

    expect(text).toContain("- Amount: Rp10.000");
  });

  it("formats budget summaries as fixed rupiah", () => {
    const text = buildBudgetSetText({
      category: "Food & Drink",
      monthlyLimit: 1_000_000,
      spentThisMonth: 100_000,
      remainingThisMonth: 900_000
    });

    expect(text).toContain("- Limit bulanan: Rp1.000.000");
    expect(text).toContain("- Terpakai bulan ini: Rp100.000");
    expect(text).toContain("- Sisa bulan ini: Rp900.000");
  });

  it("formats saving confirmations with SAVING type", () => {
    const text = confirmTransactionText({
      type: "SAVING",
      amount: 500_000,
      category: "Tabungan",
      merchant: "Tabungan Pribadi",
      occurredAt: new Date("2026-04-17T08:00:00.000Z")
    });

    expect(text).toContain("- Tipe: SAVING ✅");
    expect(text).toContain("- Category: Tabungan");
    expect(text).toContain("- Merchant: Tabungan Pribadi");
  });
});
