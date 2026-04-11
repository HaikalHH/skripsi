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
  inboundMessages: [] as Array<{
    id: string;
    userId: string;
    messageType: "TEXT";
    contentOrCaption: string;
    sentAt: Date;
  }>,
  outboundMessages: [] as Array<{
    id: string;
    userId: string;
    messageText: string;
    sentAt: Date | null;
    createdAt: Date;
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
    },
    messageLog: {
      findMany: vi.fn(async ({ where, take, select }: any) => {
        let rows = hoisted.inboundMessages.filter(
          (item) =>
            item.userId === where.userId &&
            item.messageType === where.messageType &&
            (!where.sentAt?.gte || item.sentAt >= where.sentAt.gte) &&
            (!where.id?.not || item.id !== where.id.not)
        );
        rows = rows.sort((left, right) => right.sentAt.getTime() - left.sentAt.getTime());
        if (typeof take === "number") rows = rows.slice(0, take);
        if (!select) return rows;
        return rows.map((row) => ({
          contentOrCaption: row.contentOrCaption,
          sentAt: row.sentAt
        }));
      })
    },
    outboundMessage: {
      findMany: vi.fn(async ({ where, take, select }: any) => {
        let rows = hoisted.outboundMessages.filter((item) => {
          if (item.userId !== where.userId) return false;
          if (!where.OR?.length) return true;

          return where.OR.some((condition: any) => {
            if (condition.sentAt?.gte) {
              return item.sentAt != null && item.sentAt >= condition.sentAt.gte;
            }

            if (condition.createdAt?.gte) {
              return item.createdAt >= condition.createdAt.gte;
            }

            return false;
          });
        });
        rows = rows.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
        if (typeof take === "number") rows = rows.slice(0, take);
        if (!select) return rows;
        return rows.map((row) => ({
          messageText: row.messageText,
          sentAt: row.sentAt,
          createdAt: row.createdAt
        }));
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
    hoisted.inboundMessages = [];
    hoisted.outboundMessages = [];
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
      expect(result.replyText).toContain("Nilai saat ini: Rp. 5.950.000,00");
      expect(result.replyText).toContain("Unrealized P/L: +Rp. 50.000,00");
      expect(result.replyText).toContain("Top holding:");
      expect(result.replyText).toContain("Tipe aset dominan:");
      expect(result.replyText).toContain("Sinyal rebalance:");
      expect(result.replyText).toContain("Rasio aset likuid:");
      expect(result.replyText).toContain("Skor diversifikasi");
      expect(result.replyText).toContain("BBCA");
      expect(result.replyText).toContain("Tabungan");
    }
  });

  it("asks gold type first when initial command is still missing jenis", async () => {
    const result = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "tambah emas 8 gram harga 1800000"
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toBe(
        "Emas kamu jenis apa?\n\n1\uFE0F\u20E3 Batangan (Antam / UBS / dll)\n2\uFE0F\u20E3 Perhiasan\n3\uFE0F\u20E3 Emas digital"
      );
    }
    expect(hoisted.assets).toHaveLength(0);
  });

  it("continues gold flow from numeric replies and saves batangan detail", async () => {
    hoisted.inboundMessages = [
      {
        id: "msg_gold_start",
        userId: "user_1",
        messageType: "TEXT",
        contentOrCaption: "tambah emas 8 gram harga 1800000",
        sentAt: new Date("2026-04-10T01:00:00.000Z")
      },
      {
        id: "msg_gold_type",
        userId: "user_1",
        messageType: "TEXT",
        contentOrCaption: "1",
        sentAt: new Date("2026-04-10T01:01:00.000Z")
      }
    ];
    hoisted.outboundMessages = [
      {
        id: "out_gold_type",
        userId: "user_1",
        messageText:
          "Emas kamu jenis apa?\n\n1\uFE0F\u20E3 Batangan (Antam / UBS / dll)\n2\uFE0F\u20E3 Perhiasan\n3\uFE0F\u20E3 Emas digital",
        sentAt: new Date("2026-04-10T01:00:30.000Z"),
        createdAt: new Date("2026-04-10T01:00:30.000Z")
      },
      {
        id: "out_gold_brand",
        userId: "user_1",
        messageText:
          "Brand emasnya apa?\n\n1\uFE0F\u20E3 Antam\n2\uFE0F\u20E3 UBS\n3\uFE0F\u20E3 Galeri24\n4\uFE0F\u20E3 Lainnya (sebutkan)",
        sentAt: new Date("2026-04-10T01:01:30.000Z"),
        createdAt: new Date("2026-04-10T01:01:30.000Z")
      }
    ];

    const result = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "1"
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toContain("\u2705 Aset berhasil dicatat: Antam");
      expect(result.replyText).toContain("- Qty: 8 gram");
      expect(result.replyText).toContain("- Harga beli: Rp. 1.800.000,00");
      expect(result.replyText).toContain("- Total: Rp. 14.400.000,00");
      expect(result.replyText).toContain("Ketik *portfolio aku*");
    }
    expect(hoisted.assets).toHaveLength(1);
    expect(hoisted.assets[0]?.symbol).toBe("GOLD_BAR_ANTAM");
    expect(hoisted.assets[0]?.displayName).toBe("Antam");
    expect(hoisted.assets[0]?.quantity).toBe(8);
    expect(hoisted.assets[0]?.averageBuyPrice).toBe(1800000);
  });

  it("asks price mode when the provided gold price is still ambiguous", async () => {
    const result = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "catat emas perhiasan 22k 2 gram harga 500000"
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toBe("Itu harga per gram atau total ya?");
    }
    expect(hoisted.assets).toHaveLength(0);
  });

  it("saves perhiasan after user clarifies that the ambiguous price is total", async () => {
    hoisted.inboundMessages = [
      {
        id: "msg_jewelry_start",
        userId: "user_1",
        messageType: "TEXT",
        contentOrCaption: "catat emas perhiasan 22k 2 gram harga 500000",
        sentAt: new Date("2026-04-10T02:00:00.000Z")
      }
    ];
    hoisted.outboundMessages = [
      {
        id: "out_jewelry_mode",
        userId: "user_1",
        messageText: "Itu harga per gram atau total ya?",
        sentAt: new Date("2026-04-10T02:00:30.000Z"),
        createdAt: new Date("2026-04-10T02:00:30.000Z")
      }
    ];

    const result = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "total"
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toContain("\u2705 Aset berhasil dicatat: Perhiasan 22K");
      expect(result.replyText).toContain("- Qty: 2 gram");
      expect(result.replyText).toContain("- Harga beli: Rp. 250.000,00");
      expect(result.replyText).toContain("- Total: Rp. 500.000,00");
    }
    expect(hoisted.assets).toHaveLength(1);
    expect(hoisted.assets[0]?.symbol).toBe("GOLD_JEWELRY_22K");
    expect(hoisted.assets[0]?.displayName).toBe("Perhiasan 22K");
    expect(hoisted.assets[0]?.averageBuyPrice).toBe(250000);
  });

  it("asks digital platform after quantity and price are already known", async () => {
    const result = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "beli emas digital 3 gram harga 1500000"
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toBe(
        "Platformnya apa?\n\n1\uFE0F\u20E3 Pegadaian\n2\uFE0F\u20E3 Tokopedia Emas\n3\uFE0F\u20E3 Shopee Emas\n4\uFE0F\u20E3 Lainnya (sebutkan)"
      );
    }
    expect(hoisted.assets).toHaveLength(0);
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

