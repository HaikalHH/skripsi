import { describe, expect, it } from "vitest";
import {
  extractForcedCategory,
  normalizeTransactionCategory
} from "@/lib/services/transactions/category-override-service";

describe("category override parser", () => {
  it("extracts explicit category suffix", () => {
    expect(extractForcedCategory("beli ayam 60rb kategori groceries")).toEqual({
      cleanedText: "beli ayam 60rb",
      forcedCategory: "Food & Drink"
    });
  });

  it("returns null when no override is present", () => {
    expect(extractForcedCategory("beli kopi 25 ribu")).toEqual({
      cleanedText: "beli kopi 25 ribu",
      forcedCategory: null
    });
  });

  it("normalizes a broader set of finance categories", () => {
    expect(extractForcedCategory("bayar bpjs 200rb kategori kesehatan")).toEqual({
      cleanedText: "bayar bpjs 200rb",
      forcedCategory: "Bills"
    });

    expect(extractForcedCategory("transfer buat istri 1 juta kategori keluarga")).toEqual({
      cleanedText: "transfer buat istri 1 juta",
      forcedCategory: "Others"
    });
  });

  it("normalizes stored transaction categories into consistent buckets", () => {
    expect(
      normalizeTransactionCategory({
        type: "EXPENSE",
        category: "Spotify Premium",
        rawText: "bayar spotify premium 50 ribu"
      })
    ).toBe("Entertainment");

    expect(
      normalizeTransactionCategory({
        type: "EXPENSE",
        category: "BPJS Kesehatan",
        rawText: "bayar bpjs 200 ribu"
      })
    ).toBe("Bills");

    expect(
      normalizeTransactionCategory({
        type: "INCOME",
        category: "gaji bulanan",
        rawText: "gaji masuk 8 juta"
      })
    ).toBe("Salary");
  });
});

