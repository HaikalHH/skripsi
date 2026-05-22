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

vi.mock("@/lib/services/market/quote", () => {
  class MockMarketDataError extends Error {
    code: "SYMBOL_NOT_FOUND" | "PROVIDER_UNAVAILABLE" | "NO_DATA";
    symbol: string;
    suggestions: string[];
    fallbackTrail: string[];

    constructor(params: {
      code: "SYMBOL_NOT_FOUND" | "PROVIDER_UNAVAILABLE" | "NO_DATA";
      symbol: string;
      message: string;
    }) {
      super(params.message);
      this.name = "MarketDataError";
      this.code = params.code;
      this.symbol = params.symbol;
      this.suggestions = [];
      this.fallbackTrail = [];
    }
  }

  return {
    TROY_OUNCE_TO_GRAM: 31.1034768,
    isMarketDataError: (value: unknown) => value instanceof MockMarketDataError,
    getMarketQuoteBySymbol: vi.fn(async (symbol: string) => {
      if (symbol === "BBCA") {
        return {
          symbol: "BBCA",
          label: "Saham BBCA",
          price: 9500,
          previousClose: 9400,
          change: 100,
          changePercent: 100 / 9400 * 100,
          currency: "IDR",
          source: "Yahoo Finance"
        };
      }
      if (symbol === "TLKM") {
        return {
          symbol: "TLKM",
          label: "Saham TLKM",
          price: 2800,
          previousClose: 2850,
          change: -50,
          changePercent: -50 / 2850 * 100,
          currency: "IDR",
          source: "Yahoo Finance"
        };
      }
      if (symbol === "BBRI") {
        return {
          symbol: "BBRI",
          label: "Saham BBRI",
          price: 5200,
          previousClose: 5100,
          change: 100,
          changePercent: 100 / 5100 * 100,
          currency: "IDR",
          source: "Yahoo Finance"
        };
      }
      if (symbol === "XAU") {
        return {
          symbol: "XAU",
          label: "Emas (IDR/gram)",
          price: 2500000,
          previousClose: 2450000,
          change: 50000,
          changePercent: 50000 / 2450000 * 100,
          currency: "IDR",
          source: "Yahoo Finance + ER-API"
        };
      }

      throw new MockMarketDataError({
        code: "SYMBOL_NOT_FOUND",
        symbol,
        message: `Simbol '${symbol}' tidak ditemukan.`
      });
    })
  };
});

import { tryHandlePortfolioCommand } from "@/lib/services/market/commands";

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

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
    expect(hoisted.assets[0]?.assetType).toBe("DEPOSIT");
    expect(hoisted.assets[0]?.averageBuyPrice).toBe(5000000);
  });

  it("asks stock code first when user only types tambah saham", async () => {
    const result = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "tambah saham"
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toBe("Apa kode sahamnya? (contoh: BBRI, TLKM)");
    }
    expect(hoisted.assets).toHaveLength(0);
  });

  it("validates stock symbol immediately when direct command already includes the code", async () => {
    const result = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "tambah saham bbca"
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toBe(
        "Berapa yang kamu punya?\n(bisa jawab dalam lot atau lembar, contoh: 2 lot atau 150 lembar)"
      );
    }
    expect(hoisted.assets).toHaveLength(0);
  });

  it("rejects invalid stock symbols before asking quantity", async () => {
    const result = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "tambah saham abcdz"
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toBe(
        "Kode saham ABCDZ tidak ditemukan, coba cek kembali ya kode sahamnya."
      );
    }
    expect(hoisted.assets).toHaveLength(0);
  });

  it("builds stock confirmation summary first and saves only after user confirms", async () => {
    hoisted.inboundMessages = [
      {
        id: "msg_stock_start",
        userId: "user_1",
        messageType: "TEXT",
        contentOrCaption: "tambah saham bbca",
        sentAt: minutesAgo(5)
      },
      {
        id: "msg_stock_qty",
        userId: "user_1",
        messageType: "TEXT",
        contentOrCaption: "2 lot",
        sentAt: minutesAgo(4)
      }
    ];
    hoisted.outboundMessages = [
      {
        id: "out_stock_qty",
        userId: "user_1",
        messageText:
          "Berapa yang kamu punya?\n(bisa jawab dalam lot atau lembar, contoh: 2 lot atau 150 lembar)",
        sentAt: minutesAgo(4.5),
        createdAt: minutesAgo(4.5)
      },
      {
        id: "out_stock_price",
        userId: "user_1",
        messageText: "Berapa harga per lembar saat dicatat? (dalam Rupiah)",
        sentAt: minutesAgo(3.5),
        createdAt: minutesAgo(3.5)
      }
    ];

    const summaryResult = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "9000"
    });

    expect(summaryResult.handled).toBe(true);
    if (summaryResult.handled) {
      expect(summaryResult.replyText).toContain("Berikut catatan saham kamu:");
      expect(summaryResult.replyText).toContain("- Kode saham : BBCA");
      expect(summaryResult.replyText).toContain("- Jumlah     : 2 lot (200 lembar)");
      expect(summaryResult.replyText).toContain("- Harga saat dicatat : Rp9.000/lembar");
      expect(summaryResult.replyText).toContain("- Total nilai: Rp1.800.000");
      expect(summaryResult.replyText).toContain("Apakah data ini sudah benar?");
    }
    expect(hoisted.assets).toHaveLength(0);

    hoisted.inboundMessages.push({
      id: "msg_stock_price",
      userId: "user_1",
      messageType: "TEXT",
      contentOrCaption: "9000",
      sentAt: minutesAgo(3)
    });
    hoisted.outboundMessages.push({
      id: "out_stock_summary",
      userId: "user_1",
      messageText: summaryResult.handled ? summaryResult.replyText : "",
      sentAt: minutesAgo(2.5),
      createdAt: minutesAgo(2.5)
    });

    const confirmResult = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "ya"
    });

    expect(confirmResult.handled).toBe(true);
    if (confirmResult.handled) {
      expect(confirmResult.replyText).toContain("Saham berhasil dicatat: BBCA");
      expect(confirmResult.replyText).toContain("- Jumlah: 2 lot (200 lembar)");
      expect(confirmResult.replyText).toContain("- Harga saat dicatat: Rp9.000/lembar");
    }
    expect(hoisted.assets).toHaveLength(1);
    expect(hoisted.assets[0]).toMatchObject({
      symbol: "BBCA",
      displayName: "BBCA",
      quantity: 200,
      unit: "share",
      averageBuyPrice: 9000
    });
  });

  it("asks which stock field should be corrected when user rejects the summary", async () => {
    hoisted.inboundMessages = [
      {
        id: "msg_stock_start",
        userId: "user_1",
        messageType: "TEXT",
        contentOrCaption: "tambah saham tlkm",
        sentAt: minutesAgo(8)
      },
      {
        id: "msg_stock_qty",
        userId: "user_1",
        messageType: "TEXT",
        contentOrCaption: "150 lembar",
        sentAt: minutesAgo(7)
      },
      {
        id: "msg_stock_price",
        userId: "user_1",
        messageType: "TEXT",
        contentOrCaption: "2800",
        sentAt: minutesAgo(6)
      }
    ];
    hoisted.outboundMessages = [
      {
        id: "out_stock_qty",
        userId: "user_1",
        messageText:
          "Berapa yang kamu punya?\n(bisa jawab dalam lot atau lembar, contoh: 2 lot atau 150 lembar)",
        sentAt: minutesAgo(7.5),
        createdAt: minutesAgo(7.5)
      },
      {
        id: "out_stock_price",
        userId: "user_1",
        messageText: "Berapa harga per lembar saat dicatat? (dalam Rupiah)",
        sentAt: minutesAgo(6.5),
        createdAt: minutesAgo(6.5)
      },
      {
        id: "out_stock_summary",
        userId: "user_1",
        messageText: [
          "Berikut catatan saham kamu:",
          "- Kode saham : TLKM",
          "- Jumlah     : 150 lembar",
          "- Harga saat dicatat : Rp2.800/lembar",
          "- Total nilai: Rp420.000",
          "",
          "Apakah data ini sudah benar?"
        ].join("\n"),
        sentAt: minutesAgo(5.5),
        createdAt: minutesAgo(5.5)
      }
    ];

    const result = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "tidak"
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toBe(
        "Bagian mana yang ingin dikoreksi? Kode saham, jumlah, atau harga saat dicatat?"
      );
    }
    expect(hoisted.assets).toHaveLength(0);
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
      expect(result.replyText).toContain("📊 Ringkasan Portofolio Kamu");
      expect(result.replyText).toContain("Total aset saat ini:\nRp5.950.000");
      expect(result.replyText).toContain("Hari ini naik sekitar:\nRp10.000 (+1,1%)");
      expect(result.replyText).not.toContain("Untung / Rugi");
      expect(result.replyText).toContain("Mayoritas aset kamu masih berada di:");
      expect(result.replyText).toContain("💰 Kas — 84%");
      expect(result.replyText).toContain("📈 Saham — 16%");
      expect(result.replyText).toContain("Skor diversifikasi: 68/100");
      expect(result.replyText).toContain("📦 Detail Aset");
      expect(result.replyText).toContain("1️⃣ Kas / Tabungan");
      expect(result.replyText).toContain("Rp5.000.000");
      expect(result.replyText).toContain("2️⃣ BBCA");
      expect(result.replyText).toContain("Rp950.000");
      expect(result.replyText).toContain("Hari ini: +Rp10.000 (+1,1%)");
      expect(result.replyTexts).toHaveLength(2);
      expect(result.replyTexts?.[0]).toContain("📊 Ringkasan Portofolio Kamu");
      expect(result.replyTexts?.[0]).toContain("💡 Saran");
      expect(result.replyTexts?.[0]).not.toContain("📦 Detail Aset");
      expect(result.replyTexts?.[1]).toContain("📦 Detail Aset");
      expect(result.replyTexts?.[1]).toContain("2️⃣ BBCA");
    }
  });

  it("does not inflate legacy 1 gram onboarding gold rows as troy ounce value", async () => {
    hoisted.assets = [
      {
        id: "asset_1",
        userId: "user_1",
        assetType: "GOLD",
        symbol: "XAU",
        displayName: "Emas batangan Antam",
        quantity: 1,
        unit: "gram",
        averageBuyPrice: 80553310.54,
        currency: "IDR"
      },
      {
        id: "asset_2",
        userId: "user_1",
        assetType: "OTHER",
        symbol: "BCA",
        displayName: "BCA",
        quantity: 1,
        unit: "account",
        averageBuyPrice: 3700000,
        currency: "IDR"
      },
      {
        id: "asset_3",
        userId: "user_1",
        assetType: "STOCK",
        symbol: "BBCA",
        displayName: "BBCA",
        quantity: 100,
        unit: "share",
        averageBuyPrice: 5850,
        currency: "IDR"
      }
    ];

    const result = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "aset saya"
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toContain("Total aset saat ini:\nRp7.150.000");
      expect(result.replyText).toContain("💰 Kas — 52%");
      expect(result.replyText).toContain("🪙 Emas — 35%");
      expect(result.replyText).toContain("1️⃣ Kas / Tabungan BCA");
      expect(result.replyText).toContain("2️⃣ Emas Antam");
      expect(result.replyText).toContain("Hari ini: +Rp50.000 (+2%)");
      expect(result.replyText).not.toContain("Rp 84.838.310");
      expect(result.replyText).not.toContain("-Rp 0");
    }
  });

  it("does not present cash and property as missing market price investments", async () => {
    hoisted.assets = [
      {
        id: "asset_1",
        userId: "user_1",
        assetType: "PROPERTY",
        symbol: "TANAH",
        displayName: "tanah",
        quantity: 1,
        unit: "unit",
        averageBuyPrice: 100000000,
        currency: "IDR"
      },
      {
        id: "asset_2",
        userId: "user_1",
        assetType: "GOLD",
        symbol: "XAU",
        displayName: "Emas batangan UBS",
        quantity: 15,
        unit: "gram",
        averageBuyPrice: 2600000,
        currency: "IDR"
      },
      {
        id: "asset_3",
        userId: "user_1",
        assetType: "OTHER",
        symbol: "BCA",
        displayName: "BCA",
        quantity: 1,
        unit: "account",
        averageBuyPrice: 1000000,
        currency: "IDR"
      }
    ];

    const result = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "aset saya berapa sekarang"
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toContain("Hari ini naik sekitar:\nRp750.000 (+2%)");
      expect(result.replyText).not.toContain("Aset yang lagi untung / rugi");
      expect(result.replyText).not.toContain("Aset paling banyak ruginya");
      expect(result.replyText).toContain("🏠 Tanah — 72%");
      expect(result.replyText).toContain("1️⃣ Tanah");
      expect(result.replyText).toContain("2️⃣ Emas UBS");
      expect(result.replyText).toContain("3️⃣ Kas / Tabungan BCA");
      expect(result.replyText).toContain("Hari ini: +Rp750.000 (+2%)");
      expect(result.replyText).not.toContain("BCA** - Rp 1.000.000 (1%)\n   - Harga yang dipakai");
      expect(result.replyText).not.toContain("harga pasarnya belum tersedia");
      expect(result.replyText).not.toContain("aset masih menggunakan harga beli karena harga pasar belum tersedia");
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
        sentAt: minutesAgo(14)
      },
      {
        id: "msg_gold_type",
        userId: "user_1",
        messageType: "TEXT",
        contentOrCaption: "1",
        sentAt: minutesAgo(13)
      }
    ];
    hoisted.outboundMessages = [
      {
        id: "out_gold_type",
        userId: "user_1",
        messageText:
          "Emas kamu jenis apa?\n\n1\uFE0F\u20E3 Batangan (Antam / UBS / dll)\n2\uFE0F\u20E3 Perhiasan\n3\uFE0F\u20E3 Emas digital",
        sentAt: minutesAgo(13.5),
        createdAt: minutesAgo(13.5)
      },
      {
        id: "out_gold_brand",
        userId: "user_1",
        messageText:
          "Brand emasnya apa?\n\n1\uFE0F\u20E3 Antam\n2\uFE0F\u20E3 UBS\n3\uFE0F\u20E3 Galeri24\n4\uFE0F\u20E3 Lainnya (sebutkan)",
        sentAt: minutesAgo(12.5),
        createdAt: minutesAgo(12.5)
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
      expect(result.replyText).toContain("- Harga saat dicatat: Rp1.800.000");
      expect(result.replyText).toContain("- Total: Rp14.400.000");
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
        sentAt: minutesAgo(11)
      }
    ];
    hoisted.outboundMessages = [
      {
        id: "out_jewelry_mode",
        userId: "user_1",
        messageText: "Itu harga per gram atau total ya?",
        sentAt: minutesAgo(10.5),
        createdAt: minutesAgo(10.5)
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
      expect(result.replyText).toContain("- Harga saat dicatat: Rp250.000");
      expect(result.replyText).toContain("- Total: Rp500.000");
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

  it("does not expose rebalance as a portfolio command and answers concentration analysis queries", async () => {
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

    const retiredRebalanceResult = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "perlu rebalance gak"
    });

    expect(retiredRebalanceResult.handled).toBe(false);

    const riskResult = await tryHandlePortfolioCommand({
      userId: "user_1",
      text: "risiko portfolio aku"
    });

    expect(riskResult.handled).toBe(true);
    if (riskResult.handled) {
      expect(riskResult.replyText).toContain("Analisa risiko portfolio:");
      expect(riskResult.replyText).toContain("Risiko konsentrasi:");
      expect(riskResult.replyText).not.toContain("rebalance");
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
      expect(dominantResult.replyText).toContain("Risiko konsentrasi:");
      expect(dominantResult.replyText).not.toContain("rebalance");
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
      expect(performanceResult.replyText).toContain("Analisa pergerakan harian portfolio:");
      expect(performanceResult.replyText).toContain("Total perubahan harian:");
      expect(performanceResult.replyText).toContain("Aset paling naik hari ini:");
      expect(performanceResult.replyText).toContain("Aset paling turun hari ini:");
      expect(performanceResult.replyText).not.toContain("cuan");
      expect(performanceResult.replyText).not.toContain("rugi");
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

