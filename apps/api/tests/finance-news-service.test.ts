import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const hoisted = vi.hoisted(() => {
  const analysisLogs: Array<{
    id: string;
    userId: string;
    analysisType: string;
    payloadJson: unknown;
    createdAt: Date;
  }> = [];
  const outboundMessages: Array<{
    userId: string;
    status: string;
    messageText: string;
    createdAt: Date;
  }> = [];

  return {
    analysisLogs,
    outboundMessages,
    getPortfolioNewsContext: vi.fn(async () => [
      {
        assetType: "STOCK",
        symbol: "BBCA",
        displayName: "BBCA",
        normalizedSymbol: "BBCA",
        keywords: ["BBCA", "Bank Central Asia", "BCA"],
      },
    ]),
    aiAnalysisLogCreate: vi.fn(async ({ data }: any) => {
      const row = {
        id: `analysis_${analysisLogs.length + 1}`,
        userId: data.userId,
        analysisType: data.analysisType,
        payloadJson: data.payloadJson,
        createdAt: new Date(Date.now() + analysisLogs.length),
      };
      analysisLogs.push(row);
      return row;
    }),
    aiAnalysisLogFindMany: vi.fn(async ({ where, take }: any) =>
      analysisLogs
        .filter(
          (row) =>
            row.userId === where.userId &&
            (!where.analysisType || row.analysisType === where.analysisType)
        )
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .slice(0, take ?? 50)
      ),
    outboundMessageFindMany: vi.fn(async ({ where, take, select }: any) =>
      outboundMessages
        .filter(
          (row) =>
            row.userId === where.userId &&
            (!where.status || row.status === where.status)
        )
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .slice(0, take ?? 50)
        .map((row) => (select?.messageText ? { messageText: row.messageText } : row))
    ),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aIAnalysisLog: {
      create: hoisted.aiAnalysisLogCreate,
      findMany: hoisted.aiAnalysisLogFindMany,
    },
    outboundMessage: {
      findMany: hoisted.outboundMessageFindMany,
    },
  },
}));

vi.mock("@/lib/services/market/portfolio-command-service", () => ({
  getPortfolioNewsContext: hoisted.getPortfolioNewsContext,
}));

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const textResponse = (payload: string, status = 200, url = "") =>
  ({
    ok: status >= 200 && status < 300,
    status,
    url,
    text: async () => payload,
  }) as Response;

describe("finance news service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    hoisted.analysisLogs.splice(0, hoisted.analysisLogs.length);
    hoisted.outboundMessages.splice(0, hoisted.outboundMessages.length);
    hoisted.aiAnalysisLogCreate.mockClear();
    hoisted.aiAnalysisLogFindMany.mockClear();
    hoisted.outboundMessageFindMany.mockClear();
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "test",
      MARKETAUX_API_TOKEN: "marketaux_test_key",
      FINNHUB_API_KEY: "",
      GOLDAPI_API_KEY: "",
      EXCHANGERATE_API_KEY: "",
    };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("filters personalized news so only holdings-related articles remain", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("marketaux.com")) {
        return jsonResponse({
          data: [
            {
              uuid: "article_bbca",
              title: "BBCA profit rises after strong loan growth",
              description:
                "Bank Central Asia posts stronger earnings this quarter.",
              url: "https://example.com/bbca",
              source: "Reuters",
              published_at: "2026-03-22T10:00:00.000Z",
              entities: [{ symbol: "BBCA", name: "Bank Central Asia" }],
            },
            {
              uuid: "article_tsla",
              title: "Tesla launches a refreshed electric vehicle line-up",
              description: "TSLA investors react to the latest product update.",
              url: "https://example.com/tsla",
              source: "Reuters",
              published_at: "2026-03-22T09:00:00.000Z",
              entities: [{ symbol: "TSLA", name: "Tesla" }],
            },
          ],
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const [
      { resetFinanceNewsDeliveryMemory, tryHandleFinanceNewsCommand },
      { resetMarketMemoryCache },
    ] =
      await Promise.all([
        import("@/lib/services/market/finance-news-service"),
        import("@/lib/services/market/market-memory-cache"),
      ]);
    resetMarketMemoryCache();
    resetFinanceNewsDeliveryMemory();

    const result = await tryHandleFinanceNewsCommand({
      userId: "user_1",
      text: "portfolio news",
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toContain("BBCA profit rises");
      expect(result.replyText).toContain("Link: https://example.com/bbca");
      expect(result.replyText).toContain("score");
      expect(result.replyText).not.toContain("Tesla launches");
    }
  });

  it("sends one daily RSS article at a time and rotates to a different article next", async () => {
    process.env.MARKETAUX_API_TOKEN = "";

    const rssXml = `
      <rss>
        <channel>
          <item>
            <title>Inflasi dan Kebijakan Bank Sentral Tentukan Harga Emas - Kompas.id</title>
            <link>https://news.google.com/rss/articles/first</link>
            <source url="https://www.kompas.id">Kompas.id</source>
            <pubDate>Sun, 03 May 2026 09:00:00 GMT</pubDate>
            <description>Ringkasan berita pertama.</description>
          </item>
          <item>
            <title>Rupiah dan IHSG ambles tersengat harga minyak - IDNFinancials.com</title>
            <link>https://news.google.com/rss/articles/second</link>
            <source url="https://www.idnfinancials.com">IDNFinancials.com</source>
            <pubDate>Sun, 03 May 2026 08:00:00 GMT</pubDate>
            <description>Ringkasan berita kedua.</description>
          </item>
        </channel>
      </rss>
    `;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("news.google.com/rss/search")) {
        return textResponse(rssXml);
      }

      if (url === "https://news.google.com/rss/articles/first") {
        return textResponse("", 200, "https://www.kompas.id/baca/ekonomi/harga-emas");
      }

      if (url === "https://news.google.com/rss/articles/second") {
        return textResponse("", 200, "https://www.idnfinancials.com/news/rupiah-ihsg-minyak");
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const [
      { resetFinanceNewsDeliveryMemory, tryHandleFinanceNewsCommand },
      { resetMarketMemoryCache },
    ] =
      await Promise.all([
        import("@/lib/services/market/finance-news-service"),
        import("@/lib/services/market/market-memory-cache"),
      ]);
    resetMarketMemoryCache();
    resetFinanceNewsDeliveryMemory();

    const first = await tryHandleFinanceNewsCommand({
      userId: "user_1",
      text: "berita finance",
    });
    resetFinanceNewsDeliveryMemory();
    const second = await tryHandleFinanceNewsCommand({
      userId: "user_1",
      text: "berita finance",
    });

    expect(first.handled).toBe(true);
    expect(second.handled).toBe(true);

    if (first.handled) {
      expect(first.replyText).toContain("Inflasi dan Kebijakan Bank Sentral Tentukan Harga Emas");
      expect(first.replyText).toContain("Sumber: Kompas.id");
      expect(first.replyText).toContain("Link: https://www.kompas.id/baca/ekonomi/harga-emas");
      expect(first.replyText).not.toContain("Rupiah dan IHSG");
      expect(first.replyText).not.toContain("Kompas.id ()");
    }

    if (second.handled) {
      expect(second.replyText).toContain("Rupiah dan IHSG ambles tersengat harga minyak");
      expect(second.replyText).toContain("Sumber: IDNFinancials.com");
      expect(second.replyText).toContain("Link: https://www.idnfinancials.com/news/rupiah-ihsg-minyak");
      expect(second.replyText).not.toContain("Inflasi dan Kebijakan");
    }
  });

  it("uses old outbound news replies to avoid repeating an article after deploy", async () => {
    process.env.MARKETAUX_API_TOKEN = "";
    hoisted.outboundMessages.push({
      userId: "user_1",
      status: "SENT",
      messageText:
        "Daily finance digest: Sumber berita: Google News RSS 1. Inflasi dan Kebijakan Bank Sentral Tentukan Harga Emas Sumber: Kompas.id",
      createdAt: new Date(),
    });

    const rssXml = `
      <rss>
        <channel>
          <item>
            <title>Inflasi dan Kebijakan Bank Sentral Tentukan Harga Emas - Kompas.id</title>
            <link>https://news.google.com/rss/articles/first</link>
            <source url="https://www.kompas.id">Kompas.id</source>
            <pubDate>Sun, 03 May 2026 09:00:00 GMT</pubDate>
            <description>Ringkasan berita pertama.</description>
          </item>
          <item>
            <title>Rupiah dan IHSG ambles tersengat harga minyak - IDNFinancials.com</title>
            <link>https://news.google.com/rss/articles/second</link>
            <source url="https://www.idnfinancials.com">IDNFinancials.com</source>
            <pubDate>Sun, 03 May 2026 08:00:00 GMT</pubDate>
            <description>Ringkasan berita kedua.</description>
          </item>
        </channel>
      </rss>
    `;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("news.google.com/rss/search")) {
        return textResponse(rssXml);
      }

      if (url === "https://news.google.com/rss/articles/second") {
        return textResponse("", 200, "https://www.idnfinancials.com/news/rupiah-ihsg-minyak");
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const [
      { resetFinanceNewsDeliveryMemory, tryHandleFinanceNewsCommand },
      { resetMarketMemoryCache },
    ] =
      await Promise.all([
        import("@/lib/services/market/finance-news-service"),
        import("@/lib/services/market/market-memory-cache"),
      ]);
    resetMarketMemoryCache();
    resetFinanceNewsDeliveryMemory();

    const result = await tryHandleFinanceNewsCommand({
      userId: "user_1",
      text: "berita finance",
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toContain("Rupiah dan IHSG ambles tersengat harga minyak");
      expect(result.replyText).not.toContain("Inflasi dan Kebijakan");
    }
  });
});
