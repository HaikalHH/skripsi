import { describe, expect, it } from "vitest";
import { parseFallbackTransactionExtraction } from "@/lib/services/transactions/fallback-transaction-parser";

describe("fallback transaction parser", () => {
  it("parses salary income phrase", () => {
    expect(parseFallbackTransactionExtraction("gaji masuk 5 juta")).toEqual({
      intent: "RECORD_TRANSACTION",
      type: "INCOME",
      amount: 5000000,
      category: "Salary",
      merchant: null,
      note: null,
      occurredAt: null,
      reportPeriod: null,
      adviceQuery: null
    });
  });

  it("parses common expense phrase", () => {
    expect(parseFallbackTransactionExtraction("beli kopi 25 ribu")).toEqual({
      intent: "RECORD_TRANSACTION",
      type: "EXPENSE",
      amount: 25000,
      category: "Food & Drink",
      merchant: null,
      note: null,
      occurredAt: null,
      reportPeriod: null,
      adviceQuery: null
    });
  });

  it("ignores question-style advice text", () => {
    expect(parseFallbackTransactionExtraction("boleh beli hp 5 juta ga?")).toBeNull();
  });

  it("parses broader expense categories from common language", () => {
    expect(parseFallbackTransactionExtraction("bayar bpjs 200 ribu")).toEqual({
      intent: "RECORD_TRANSACTION",
      type: "EXPENSE",
      amount: 200000,
      category: "Bills",
      merchant: "BPJS",
      note: null,
      occurredAt: null,
      reportPeriod: null,
      adviceQuery: null
    });

    expect(parseFallbackTransactionExtraction("beli obat 150 ribu")).toEqual({
      intent: "RECORD_TRANSACTION",
      type: "EXPENSE",
      amount: 150000,
      category: "Health",
      merchant: null,
      note: null,
      occurredAt: null,
      reportPeriod: null,
      adviceQuery: null
    });
  });

  it("infers known merchant names from raw expense text", () => {
    expect(parseFallbackTransactionExtraction("bayar spotify family 50 ribu")).toEqual({
      intent: "RECORD_TRANSACTION",
      type: "EXPENSE",
      amount: 50000,
      category: "Entertainment",
      merchant: "Spotify",
      note: null,
      occurredAt: null,
      reportPeriod: null,
      adviceQuery: null
    });
  });
});

