import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const hoisted = vi.hoisted(() => {
  return {
    getPortfolioNewsContext: vi.fn(async () => [
      {
        assetType: "STOCK",
        symbol: "BBCA",
        displayName: "BBCA",
        normalizedSymbol: "BBCA",
        keywords: ["BBCA", "Bank Central Asia", "BCA"],
      },
    ]),
    aiAnalysisLogCreate: vi.fn(async ({ data }: any) => ({
      id: "analysis_1",
      userId: data.userId,
      analysisType: data.analysisType,
      payloadJson: data.payloadJson,
      createdAt: new Date(),
    })),
    aiAnalysisLogFindMany: vi.fn(async () => []),
    outboundMessageFindMany: vi.fn(async () => []),
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

vi.mock("@/lib/services/market/commands", () => ({
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

describe("TC-234: finance news service — empty articles (no articles from provider)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
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

  it(
    "TC-234-A: throws FinanceNewsError and buildFinanceNewsFailureReply returns empty-state message when Marketaux returns zero articles (portfolio news)",
    async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("marketaux.com")) {
          return jsonResponse({ data: [] });
        }
        if (url.includes("news.google.com/rss")) {
          return textResponse("<rss><channel></channel></rss>");
        }
        throw new Error(`Unexpected URL: ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const [
        { resetFinanceNewsDeliveryMemory, tryHandleFinanceNewsCommand, buildFinanceNewsFailureReply, FinanceNewsError },
        { resetMarketMemoryCache },
      ] = await Promise.all([
        import("@/lib/services/market/news"),
        import("@/lib/services/market/cache"),
      ]);
      resetMarketMemoryCache();
      resetFinanceNewsDeliveryMemory();

      let caughtError: unknown = null;
      let replyText = "";

      try {
        await tryHandleFinanceNewsCommand({
          userId: "user_tc234",
          text: "portfolio news",
        });
      } catch (error) {
        caughtError = error;
        replyText = buildFinanceNewsFailureReply(error);
      }

      expect(caughtError).toBeInstanceOf(FinanceNewsError);
      expect(replyText).toBeTruthy();
      expect(replyText.length).toBeGreaterThan(0);

      console.log("[TC-234-A] Portfolio news empty state — error code:", (caughtError as any)?.code);
      console.log("[TC-234-A] Reply yang diberikan user:", replyText);

      expect(replyText).not.toBe("");
    }
  );

  it(
    "TC-234-B: throws FinanceNewsError and buildFinanceNewsFailureReply returns empty-state message when RSS returns no items (daily news)",
    async () => {
      process.env.MARKETAUX_API_TOKEN = "";
      const emptyRssXml = `
        <rss>
          <channel>
            <title>Finance News</title>
          </channel>
        </rss>
      `;

      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("news.google.com/rss/search")) {
          return textResponse(emptyRssXml);
        }
        throw new Error(`Unexpected URL: ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const [
        { resetFinanceNewsDeliveryMemory, tryHandleFinanceNewsCommand, buildFinanceNewsFailureReply, FinanceNewsError },
        { resetMarketMemoryCache },
      ] = await Promise.all([
        import("@/lib/services/market/news"),
        import("@/lib/services/market/cache"),
      ]);
      resetMarketMemoryCache();
      resetFinanceNewsDeliveryMemory();

      let caughtError: unknown = null;
      let replyText = "";

      try {
        await tryHandleFinanceNewsCommand({
          userId: "user_tc234",
          text: "berita finance",
        });
      } catch (error) {
        caughtError = error;
        replyText = buildFinanceNewsFailureReply(error);
      }

      expect(caughtError).toBeInstanceOf(FinanceNewsError);
      expect(replyText).toBeTruthy();
      expect(replyText).not.toBe("");

      console.log("[TC-234-B] Daily news empty state — error code:", (caughtError as any)?.code);
      console.log("[TC-234-B] Reply yang diberikan user:", replyText);
    }
  );
});
