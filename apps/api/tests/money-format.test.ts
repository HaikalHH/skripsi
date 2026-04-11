import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/services/shared/money-format";

describe("formatMoney", () => {
  it("formats rupiah with fixed decimals", () => {
    expect(formatMoney(10_000)).toBe("Rp. 10.000,00");
    expect(formatMoney(100_000)).toBe("Rp. 100.000,00");
    expect(formatMoney(1_000_000)).toBe("Rp. 1.000.000,00");
    expect(formatMoney(1_000_000_000)).toBe("Rp. 1.000.000.000,00");
  });

  it("keeps negative values readable", () => {
    expect(formatMoney(-25_000)).toBe("-Rp. 25.000,00");
  });
});
