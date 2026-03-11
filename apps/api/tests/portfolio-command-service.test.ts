import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  assets: [] as Array<{
    id: string;
    userId: string;
    assetType: string;
    symbol: string;
    displayName: string;
    quantity: number;
    unit: string;
    averageBuyPrice: number;
    currency: string;
  }>,
  idCounter: 1
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    portfolioAsset: {
      findMany: vi.fn(async ({ where }: any) =>
        hoisted.assets.filter((item) => item.userId === where.userId)
      ),
      findUnique: vi.fn(async ({ where }: any) => {
        const key = where.userId_assetType_symbol;
        return (
          hoisted.assets.find(
            (item) =>
              item.userId === key.userId &&
              item.assetType === key.assetType &&
              item.symbol === key.symbol
          ) ?? null
        );
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = {
          id: `asset_${hoisted.idCounter++}`,
          ...data
        };
        hoisted.assets.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = hoisted.assets.find((item) => item.id === where.id);
        if (!row) throw new Error("Asset not found");
        Object.assign(row, data);
        return row;
      })
    }
  }
}));

vi.mock("@/lib/services/market-price-service", () => ({
  getMarketQuoteBySymbol: vi.fn(async (symbol: string) => {
    if (symbol === "BBCA") {
      return {
        symbol: "BBCA",
        label: "Saham BBCA",
        price: 9500,
        currency: "IDR",
        source: "Yahoo Finance"
      };
    }

    throw new Error("unsupported");
  })
}));

import { tryHandlePortfolioCommand } from "@/lib/services/portfolio-command-service";

describe("portfolio command service", () => {
  beforeEach(() => {
    hoisted.assets = [];
    hoisted.idCounter = 1;
  });

  it("adds static liquid asset from natural text", async () => {
    const result = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "tambah tabungan 5 juta"
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toContain("Aset berhasil dicatat: Tabungan");
    }
    expect(hoisted.assets).toHaveLength(1);
    expect(hoisted.assets[0]?.symbol).toBe("TABUNGAN");
    expect(hoisted.assets[0]?.averageBuyPrice).toBe(5000000);
  });

  it("builds richer portfolio summary with current value and pnl", async () => {
    hoisted.assets = [
      {
        id: "asset_1",
        userId: "user_1",
        assetType: "STOCK",
        symbol: "BBCA",
        displayName: "BBCA",
        quantity: 100,
        unit: "share",
        averageBuyPrice: 9000,
        currency: "IDR"
      },
      {
        id: "asset_2",
        userId: "user_1",
        assetType: "OTHER",
        symbol: "TABUNGAN",
        displayName: "Tabungan",
        quantity: 1,
        unit: "unit",
        averageBuyPrice: 5000000,
        currency: "IDR"
      }
    ];

    const result = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "portfolio aku"
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toContain("Ringkasan portfolio:");
      expect(result.replyText).toContain("Nilai saat ini: Rp5.950.000");
      expect(result.replyText).toContain("Unrealized P/L: +Rp50.000");
      expect(result.replyText).toContain("BBCA");
      expect(result.replyText).toContain("Tabungan");
    }
  });
});
