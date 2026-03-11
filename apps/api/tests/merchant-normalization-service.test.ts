import { describe, expect, it } from "vitest";
import {
  inferMerchantFromText,
  isSubscriptionLikeMerchant,
  normalizeDetectedMerchant,
  normalizeMerchantName
} from "@/lib/services/merchant-normalization-service";

describe("merchant normalization service", () => {
  it("normalizes merchant variants into a canonical label", () => {
    expect(normalizeMerchantName("spotify premium")).toBe("Spotify");
    expect(normalizeMerchantName("SPOTIFY PTE LTD")).toBe("Spotify");
    expect(normalizeMerchantName("biznet indonesia")).toBe("Biznet");
  });

  it("can infer merchant from raw transaction text", () => {
    expect(inferMerchantFromText("bayar spotify family 50 ribu")).toBe("Spotify");
    expect(inferMerchantFromText("internet rumah biznet 350 ribu")).toBe("Biznet");
  });

  it("prefers explicit merchant but falls back to raw text inference", () => {
    expect(
      normalizeDetectedMerchant({
        merchant: "spotify premium",
        rawText: "bayar spotify family 50 ribu"
      })
    ).toBe("Spotify");

    expect(
      normalizeDetectedMerchant({
        merchant: null,
        rawText: "token listrik pln 100 ribu"
      })
    ).toBe("PLN");
  });

  it("marks subscription-like merchants", () => {
    expect(isSubscriptionLikeMerchant("Spotify")).toBe(true);
    expect(isSubscriptionLikeMerchant("Biznet")).toBe(true);
    expect(isSubscriptionLikeMerchant("PLN")).toBe(false);
  });
});
