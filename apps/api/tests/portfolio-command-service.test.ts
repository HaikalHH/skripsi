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

vi.mock("@/lib/services/market/market-price-service", () => ({
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
    if (symbol === "TLKM") {
      return {
        symbol: "TLKM",
        label: "Saham TLKM",
        price: 2800,
        currency: "IDR",
        source: "Yahoo Finance"
      };
    }

    throw new Error("unsupported");
  })
}));

import { tryHandlePortfolioCommand } from "@/lib/services/market/portfolio-command-service";

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
      expect(result.replyText).toContain("Top holding:");
      expect(result.replyText).toContain("Tipe aset dominan:");
      expect(result.replyText).toContain("Sinyal rebalance:");
      expect(result.replyText).toContain("Rasio aset likuid:");
      expect(result.replyText).toContain("Skor diversifikasi");
      expect(result.replyText).toContain("BBCA");
      expect(result.replyText).toContain("Tabungan");
    }
  });

  it("answers rebalance and concentration analysis queries", async () => {
    hoisted.assets = [
      {
        id: "asset_1",
        userId: "user_1",
        assetType: "STOCK",
        symbol: "BBCA",
        displayName: "BBCA",
        quantity: 700,
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
        averageBuyPrice: 1000000,
        currency: "IDR"
      }
    ];

    const riskResult = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "perlu rebalance gak"
    });

    expect(riskResult.handled).toBe(true);
    if (riskResult.handled) {
      expect(riskResult.replyText).toContain("Analisa risiko portfolio:");
      expect(riskResult.replyText).toContain("Status rebalance:");
      expect(riskResult.replyText).toContain("BBCA");
    }

    const dominantResult = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "aset paling dominan apa"
    });

    expect(dominantResult.handled).toBe(true);
    if (dominantResult.handled) {
      expect(dominantResult.replyText).toContain("Aset dominan portfolio kamu:");
      expect(dominantResult.replyText).toContain("Holding terbesar: BBCA");
      expect(dominantResult.replyText).toContain("Status rebalance:");
    }
  });

  it("answers performance and diversification queries", async () => {
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
        assetType: "STOCK",
        symbol: "TLKM",
        displayName: "TLKM",
        quantity: 200,
        unit: "share",
        averageBuyPrice: 3200,
        currency: "IDR"
      },
      {
        id: "asset_3",
        userId: "user_1",
        assetType: "OTHER",
        symbol: "TABUNGAN",
        displayName: "Tabungan",
        quantity: 1,
        unit: "unit",
        averageBuyPrice: 2000000,
        currency: "IDR"
      }
    ];

    const performanceResult = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "aset paling cuan apa"
    });

    expect(performanceResult.handled).toBe(true);
    if (performanceResult.handled) {
      expect(performanceResult.replyText).toContain("Analisa performa portfolio:");
      expect(performanceResult.replyText).toContain("Aset paling cuan:");
      expect(performanceResult.replyText).toContain("Aset paling rugi:");
    }

    const diversificationResult = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "diversifikasi portfolio aku gimana"
    });

    expect(diversificationResult.handled).toBe(true);
    if (diversificationResult.handled) {
      expect(diversificationResult.replyText).toContain("Analisa diversifikasi portfolio:");
      expect(diversificationResult.replyText).toContain("Skor diversifikasi:");
      expect(diversificationResult.replyText).toContain("Komposisi tipe aset:");
    }
  });
});

