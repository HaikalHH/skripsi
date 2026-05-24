import { describe, expect, it } from "vitest";
import { isNegativeAmountInput, parsePositiveAmount } from "@/lib/services/transactions/amount";
import { parseFallbackTransactionExtraction } from "@/lib/services/transactions/fallback-parser";
import { parseMoneyInput, parseMoneyInputPreservingRange } from "@/lib/services/onboarding/flow/shared/answers/value-parsers";

describe("negative amount validation", () => {
  describe("isNegativeAmountInput", () => {
    it("detects negative number with minus sign at start", () => {
      expect(isNegativeAmountInput("-100000")).toBe(true);
      expect(isNegativeAmountInput("-5000")).toBe(true);
      expect(isNegativeAmountInput("  -1000  ")).toBe(true);
    });

    it("detects negative number with minus sign in middle (transaction format)", () => {
      expect(isNegativeAmountInput("nabung -100 ribu")).toBe(true);
      expect(isNegativeAmountInput("beli makan -50 ribu")).toBe(true);
      expect(isNegativeAmountInput("makan -45000")).toBe(true);
      expect(isNegativeAmountInput("gaji masuk -5 juta")).toBe(true);
      expect(isNegativeAmountInput("nabung -100ribu")).toBe(true);
    });

    it("returns false for positive numbers", () => {
      expect(isNegativeAmountInput("100000")).toBe(false);
      expect(isNegativeAmountInput("5 juta")).toBe(false);
      expect(isNegativeAmountInput("750rb")).toBe(false);
      expect(isNegativeAmountInput("nabung 100 ribu")).toBe(false);
      expect(isNegativeAmountInput("makan 45000")).toBe(false);
    });

    it("returns false for text without minus", () => {
      expect(isNegativeAmountInput("makan 45000")).toBe(false);
      expect(isNegativeAmountInput("gaji masuk 5 juta")).toBe(false);
    });
  });

  describe("parsePositiveAmount", () => {
    it("returns null for negative amounts", () => {
      expect(parsePositiveAmount("-100000")).toBeNull();
      expect(parsePositiveAmount("-5 juta")).toBeNull();
      expect(parsePositiveAmount("-750rb")).toBeNull();
    });

    it("parses positive amounts correctly", () => {
      expect(parsePositiveAmount("100000")).toBe(100000);
      expect(parsePositiveAmount("5 juta")).toBe(5000000);
      expect(parsePositiveAmount("750rb")).toBe(750000);
    });
  });

  describe("parseFallbackTransactionExtraction", () => {
    it("rejects transaction with negative amount", () => {
      expect(parseFallbackTransactionExtraction("makan -45000")).toBeNull();
      expect(parseFallbackTransactionExtraction("gaji masuk -5 juta")).toBeNull();
      expect(parseFallbackTransactionExtraction("beli kopi -25000")).toBeNull();
      expect(parseFallbackTransactionExtraction("nabung -100 ribu")).toBeNull();
      expect(parseFallbackTransactionExtraction("beli makan -50 ribu")).toBeNull();
    });

    it("accepts transaction with positive amount", () => {
      const result = parseFallbackTransactionExtraction("makan 45000");
      expect(result).not.toBeNull();
      expect(result?.amount).toBe(45000);
      expect(result?.type).toBe("EXPENSE");
    });
  });

  describe("parseMoneyInput (onboarding)", () => {
    it("rejects negative amounts", () => {
      expect(parseMoneyInput("-100000")).toBeNull();
      expect(parseMoneyInput("-200000")).toBeNull();
      expect(parseMoneyInput("-300000")).toBeNull();
      expect(parseMoneyInput("-500000")).toBeNull();
      expect(parseMoneyInput("-5jt")).toBeNull();
      expect(parseMoneyInput("-5 juta")).toBeNull();
      expect(parseMoneyInput("  -100000  ")).toBeNull();
    });

    it("accepts positive amounts", () => {
      expect(parseMoneyInput("100000")).toBe(100000);
      expect(parseMoneyInput("200000")).toBe(200000);
      expect(parseMoneyInput("5jt")).toBe(5000000);
      expect(parseMoneyInput("5 juta")).toBe(5000000);
      expect(parseMoneyInput("750rb")).toBe(750000);
    });

    it("accepts zero", () => {
      expect(parseMoneyInput("0")).toBe(0);
      expect(parseMoneyInput("000")).toBe(0);
    });
  });

  describe("parseMoneyInputPreservingRange (onboarding)", () => {
    it("rejects negative amounts", () => {
      expect(parseMoneyInputPreservingRange("-100000")).toBeNull();
      expect(parseMoneyInputPreservingRange("-5 juta")).toBeNull();
      expect(parseMoneyInputPreservingRange("  -750rb  ")).toBeNull();
    });

    it("accepts positive amounts", () => {
      expect(parseMoneyInputPreservingRange("100000")).toBe(100000);
      expect(parseMoneyInputPreservingRange("5 juta")).toBe(5000000);
    });

    it("accepts ranges", () => {
      const result = parseMoneyInputPreservingRange("5-10 juta");
      expect(result).toMatchObject({
        kind: "money_range",
        low: 5000000,
        high: 10000000
      });
    });
  });
});
