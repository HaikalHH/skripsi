import { describe, expect, it } from "vitest";
import { parsePositiveAmount } from "@/lib/services/amount-parser";

describe("amount parser", () => {
  it("parses shorthand units", () => {
    expect(parsePositiveAmount("1.5jt")).toBe(1500000);
    expect(parsePositiveAmount("450rb")).toBe(450000);
    expect(parsePositiveAmount("2 juta")).toBe(2000000);
  });

  it("parses plain numeric forms", () => {
    expect(parsePositiveAmount("Rp 1.500.000")).toBe(1500000);
    expect(parsePositiveAmount("250000")).toBe(250000);
  });

  it("parses monthly suffix forms", () => {
    expect(parsePositiveAmount("2 juta/bulan")).toBe(2000000);
    expect(parsePositiveAmount("500rb per bulan")).toBe(500000);
  });

  it("returns null for invalid amount", () => {
    expect(parsePositiveAmount("abc")).toBeNull();
    expect(parsePositiveAmount("0")).toBeNull();
  });
});
