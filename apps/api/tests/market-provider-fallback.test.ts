import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const yahooQuotePayload = (price: number) => ({
  chart: {
    result: [
      {
        meta: {
          regularMarketPrice: price,
          regularMarketTime: 1710000000,
        },
        indicators: {
          quote: [
            {
              close: [price],
            },
          ],
        },
      },
    ],
  },
});

describe("market provider fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.useRealTimers();
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "test",
      FINNHUB_API_KEY: "finnhub_test_key",
      GOLDAPI_API_KEY: "",
      MARKETAUX_API_TOKEN: "",
      EXCHANGERATE_API_KEY: "fx_test_key",
    };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns a quote from the primary provider", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("finnhub.io")) {
        return jsonResponse({ c: 9150, t: 1710000000 });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const [{ getMarketQuoteBySymbol }, { resetMarketMemoryCache }] =
      await Promise.all([
        import("@/lib/services/market/market-price-service"),
        import("@/lib/services/market/market-memory-cache"),
      ]);
    resetMarketMemoryCache();

    const quote = await getMarketQuoteBySymbol("BBCA");

    expect(quote.providerId).toBe("finnhub");
    expect(quote.status).toBe("live");
    expect(quote.price).toBe(9150);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the secondary provider when the primary provider fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("finnhub.io")) {
        return jsonResponse({ error: "upstream down" }, 503);
      }
      if (url.includes("query1.finance.yahoo.com")) {
        return jsonResponse(yahooQuotePayload(9200));
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const [{ getMarketQuoteBySymbol }, { resetMarketMemoryCache }] =
      await Promise.all([
        import("@/lib/services/market/market-price-service"),
        import("@/lib/services/market/market-memory-cache"),
      ]);
    resetMarketMemoryCache();

    const quote = await getMarketQuoteBySymbol("BBCA");

    expect(quote.providerId).toBe("yahoo_finance");
    expect(quote.status).toBe("live");
    expect(quote.price).toBe(9200);
    expect(quote.source).toContain("fallback");
  });

  it("converts Yahoo gold quotes from USD per troy ounce to IDR per gram", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("query1.finance.yahoo.com")) {
        return jsonResponse(yahooQuotePayload(2500));
      }
      if (url.includes("api.exchangerate.host")) {
        return jsonResponse({ result: 16000, date: "2026-05-03" });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const [{ getMarketQuoteBySymbol }, { resetMarketMemoryCache }] =
      await Promise.all([
        import("@/lib/services/market/market-price-service"),
        import("@/lib/services/market/market-memory-cache"),
      ]);
    resetMarketMemoryCache();

    const quote = await getMarketQuoteBySymbol("XAU");

    expect(quote.providerId).toBe("yahoo_finance");
    expect(quote.label).toBe("Emas (IDR/gram)");
    expect(quote.price).toBeCloseTo((2500 * 16000) / 31.1034768, 2);
  });

  it("returns stale cache when all live providers fail after ttl expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-23T00:00:00.000Z"));

    let phase: "seed" | "stale" = "seed";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (phase === "seed" && url.includes("finnhub.io")) {
        return jsonResponse({ c: 9300, t: 1710000000 });
      }

      if (phase === "stale" && url.includes("finnhub.io")) {
        return jsonResponse({ error: "temporary failure" }, 503);
      }

      if (phase === "stale" && url.includes("query1.finance.yahoo.com")) {
        return jsonResponse({ error: "temporary failure" }, 503);
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const [{ getMarketQuoteBySymbol }, { resetMarketMemoryCache }] =
      await Promise.all([
        import("@/lib/services/market/market-price-service"),
        import("@/lib/services/market/market-memory-cache"),
      ]);
    resetMarketMemoryCache();

    const firstQuote = await getMarketQuoteBySymbol("BBCA");
    phase = "stale";
    vi.setSystemTime(new Date("2026-03-23T00:01:01.000Z"));

    const staleQuote = await getMarketQuoteBySymbol("BCA");

    expect(firstQuote.status).toBe("live");
    expect(staleQuote.status).toBe("stale");
    expect(staleQuote.price).toBe(firstQuote.price);
    expect(staleQuote.cachedAt).toBe(firstQuote.cachedAt);
  });

  it("disables primary provider gracefully when the api key is missing", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "test",
      // FINNHUB_API_KEY: "",
      // GOLDAPI_API_KEY: "",
      // MARKETAUX_API_TOKEN: "",
      EXCHANGERATE_API_KEY: "fx_test_key",
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("query1.finance.yahoo.com")) {
        return jsonResponse(yahooQuotePayload(9250));
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const [{ getMarketQuoteBySymbol }, { resetMarketMemoryCache }] =
      await Promise.all([
        import("@/lib/services/market/market-price-service"),
        import("@/lib/services/market/market-memory-cache"),
      ]);
    resetMarketMemoryCache();

    const quote = await getMarketQuoteBySymbol("BBCA");

    expect(quote.providerId).toBe("yahoo_finance");
    expect(quote.price).toBe(9250);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("finnhub.io"),
      ),
    ).toBe(false);
  });
});
