import { describe, expect, it } from "vitest";
import { parseMoneyInput } from "@/lib/services/onboarding/flow/shared/answers/value-parsers";
import { extractMoneyFromFreeText } from "@/lib/services/onboarding/flow/shared/intent/onboarding-intent-service";

describe("mixed unit amount parsing (bug fix)", () => {
  describe("extractMoneyFromFreeText", () => {
    it("extracts mixed unit amounts like '1 juta 500 ribu'", () => {
      expect(extractMoneyFromFreeText("1 juta 500 ribu")).toBe(1500000);
      expect(extractMoneyFromFreeText("1 jt 500 rb")).toBe(1500000);
      expect(extractMoneyFromFreeText("2 juta 300 ribu")).toBe(2300000);
      expect(extractMoneyFromFreeText("2 jt 300 rb")).toBe(2300000);
    });

    it("still works with single unit amounts", () => {
      expect(extractMoneyFromFreeText("1 juta")).toBe(1000000);
      expect(extractMoneyFromFreeText("500 ribu")).toBe(500000);
      expect(extractMoneyFromFreeText("1.5 juta")).toBe(1500000);
    });

    it("works with Rp prefix", () => {
      expect(extractMoneyFromFreeText("Rp 1 juta 500 ribu")).toBe(1500000);
      expect(extractMoneyFromFreeText("Rp 2 jt 300 rb")).toBe(2300000);
    });
  });

  describe("parseMoneyInput", () => {
    it("parses mixed unit amounts correctly", () => {
      expect(parseMoneyInput("1 juta 500 ribu")).toBe(1500000);
      expect(parseMoneyInput("1 jt 500 rb")).toBe(1500000);
      expect(parseMoneyInput("2 juta 300 ribu")).toBe(2300000);
      expect(parseMoneyInput("1.5 juta 200 ribu")).toBe(1700000);
    });

    it("handles variations with text", () => {
      expect(parseMoneyInput("sekitar 1 juta 500 ribu")).toBe(1500000);
      expect(parseMoneyInput("kira-kira 2 juta 300 ribu")).toBe(2300000);
    });
  });
});
