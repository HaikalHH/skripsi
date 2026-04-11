import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const hoisted = vi.hoisted(() => ({
  getPortfolioNewsContext: vi.fn(async () => [
    {
      assetType: "STOCK",
      symbol: "BBCA",
      displayName: "BBCA",
      normalizedSymbol: "BBCA",
      keywords: ["BBCA", "Bank Central Asia", "BCA"],
    },
  ]),
}));

vi.mock("@/lib/services/market/portfolio-command-service", () => ({
  getPortfolioNewsContext: hoisted.getPortfolioNewsContext,
}));

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("finance news service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
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

    const [{ tryHandleFinanceNewsCommand }, { resetMarketMemoryCache }] =
      await Promise.all([
        import("@/lib/services/market/finance-news-service"),
        import("@/lib/services/market/market-memory-cache"),
      ]);
    resetMarketMemoryCache();

    const result = await tryHandleFinanceNewsCommand({
      userId: "user_1",
      text: "portfolio news",
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toContain("BBCA profit rises");
      expect(result.replyText).toContain("score");
      expect(result.replyText).not.toContain("Tesla launches");
    }
  });
});
