import { describe, expect, it } from "vitest";
import { formatMoney, formatMoneyWhole } from "@/lib/services/shared/money-format";

describe("formatMoney", () => {
  it("formats rupiah with Indonesian separators and trims trailing zero decimals", () => {
    expect(formatMoney(10_000)).toBe("Rp. 10.000");
    expect(formatMoney(100_000)).toBe("Rp. 100.000");
    expect(formatMoney(1_000_000)).toBe("Rp. 1.000.000");
    expect(formatMoney(1_000_000_000)).toBe("Rp. 1.000.000.000");
  });

  it("keeps negative values readable", () => {
    expect(formatMoney(-25_000)).toBe("-Rp. 25.000");
  });

  it("keeps large integer inputs intact without truncation", () => {
    expect(formatMoney(2_000_000_000n)).toBe("Rp. 2.000.000.000");
    expect(formatMoney("2000000000")).toBe("Rp. 2.000.000.000");
    expect(formatMoney("2.000.000.000")).toBe("Rp. 2.000.000.000");
  });

  it("rounds decimals to at most two digits", () => {
    expect(formatMoney("1234,5")).toBe("Rp. 1.234,5");
    expect(formatMoney("1234.5678")).toBe("Rp. 1.234,57");
  });

  it("can append contextual magnitude labels", () => {
    expect(formatMoney(2_000_000_000n, { withMagnitudeLabel: true })).toBe(
      "Rp. 2.000.000.000 (2 miliar)"
    );
    expect(formatMoney(1_500_000, { withMagnitudeLabel: true })).toBe(
      "Rp. 1.500.000 (1,5 juta)"
    );
    expect(formatMoney(328_102, { withMagnitudeLabel: true })).toBe(
      "Rp. 328.102 (328 ribu)"
    );
  });

  it("can format whole rupiah values without decimals", () => {
    expect(formatMoneyWhole(10_000)).toBe("Rp. 10.000");
    expect(formatMoneyWhole("4300000")).toBe("Rp. 4.300.000");
    expect(formatMoneyWhole("2850000,75")).toBe("Rp. 2.850.001");
    expect(formatMoneyWhole(-25_000)).toBe("-Rp. 25.000");
  });
});
