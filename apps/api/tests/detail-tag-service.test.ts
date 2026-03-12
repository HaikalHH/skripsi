import { describe, expect, it } from "vitest";
import {
  buildTransactionDetailLabel,
  inferTransactionDetailTag
} from "@/lib/services/transactions/detail-tag-service";

describe("detail tag service", () => {
  it("infers detail tags from expense text and merchant", () => {
    expect(
      inferTransactionDetailTag({
        type: "EXPENSE",
        category: "Entertainment",
        merchant: "Spotify",
        rawText: "bayar spotify premium 50rb"
      })
    ).toBe("Spotify");

    expect(
      inferTransactionDetailTag({
        type: "EXPENSE",
        category: "Bills",
        merchant: null,
        rawText: "bayar internet biznet 350rb"
      })
    ).toBe("Internet");

    expect(
      inferTransactionDetailTag({
        type: "EXPENSE",
        category: "Food & Drink",
        merchant: null,
        rawText: "ngopi kenangan 35rb"
      })
    ).toBe("Coffee");
  });

  it("prefers merchant label when it is more specific than the detail tag", () => {
    expect(
      buildTransactionDetailLabel({
        detailTag: "Internet",
        merchant: "Biznet",
        rawText: "bayar internet rumah"
      })
    ).toBe("Biznet");
  });
});

