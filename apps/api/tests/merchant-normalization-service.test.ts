import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  transactions: [] as Array<{
    userId: string;
    merchant: string | null;
    rawText: string | null;
    occurredAt: Date;
    createdAt: Date;
  }>
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: {
      findMany: vi.fn(async ({ where, take }: any) => {
        let rows = hoisted.transactions.filter((row) => {
          if (where?.userId && row.userId !== where.userId) return false;
          if (where?.merchant?.not === null && row.merchant == null) return false;
          return true;
        });
        rows = rows.sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
        if (typeof take === "number") rows = rows.slice(0, take);
        return rows;
      })
    }
  }
}));

import {
  findLearnedMerchantAlias,
  inferMerchantFromText,
  isSubscriptionLikeMerchant,
  normalizeDetectedMerchant,
  normalizeMerchantName,
  resolveMerchantNameForUser
} from "@/lib/services/transactions/merchant-normalization-service";

describe("merchant normalization service", () => {
  beforeEach(() => {
    hoisted.transactions = [];
  });

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

  it("learns merchant aliases from prior user transaction history", async () => {
    hoisted.transactions = [
      {
        userId: "user_1",
        merchant: "Wifi Kost",
        rawText: "bayar wifi kost 300 ribu",
        occurredAt: new Date("2026-03-10T09:00:00.000Z"),
        createdAt: new Date("2026-03-10T09:00:00.000Z")
      }
    ];

    await expect(
      findLearnedMerchantAlias({
        userId: "user_1",
        merchant: null,
        rawText: "wifi kost 350 ribu"
      })
    ).resolves.toBe("Wifi Kost");

    await expect(
      resolveMerchantNameForUser({
        userId: "user_1",
        merchant: null,
        rawText: "wifi kost 350 ribu"
      })
    ).resolves.toBe("Wifi Kost");
  });

  it("marks subscription-like merchants", () => {
    expect(isSubscriptionLikeMerchant("Spotify")).toBe(true);
    expect(isSubscriptionLikeMerchant("Biznet")).toBe(true);
    expect(isSubscriptionLikeMerchant("PLN")).toBe(false);
  });
});

