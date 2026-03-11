const CRYPTO_ID_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  DOT: "polkadot",
  AVAX: "avalanche-2",
  USDT: "tether"
};

export type MarketQuote = {
  symbol: string;
  label: string;
  price: number;
  currency: "IDR";
  source: string;
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return NaN;
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, { headers: { "User-Agent": "finance-bot/1.0" } });
  if (!response.ok) {
    throw new Error(`Market source error ${response.status}`);
  }
  return (await response.json()) as T;
};

const readYahooRegularPrice = (payload: any): number | null => {
  const result = payload?.chart?.result?.[0];
  const metaPrice = toNumber(result?.meta?.regularMarketPrice);
  if (Number.isFinite(metaPrice) && metaPrice > 0) return metaPrice;

  const closes = result?.indicators?.quote?.[0]?.close;
  if (Array.isArray(closes)) {
    for (let index = closes.length - 1; index >= 0; index -= 1) {
      const candidate = toNumber(closes[index]);
      if (Number.isFinite(candidate) && candidate > 0) return candidate;
    }
  }

  return null;
};

const getUsdToIdrRate = async (): Promise<number> => {
  const payload = await fetchJson<{ rates?: Record<string, number> }>(
    "https://open.er-api.com/v6/latest/USD"
  );
  const idr = payload.rates?.IDR;
  if (!idr || !Number.isFinite(idr)) {
    throw new Error("USD/IDR rate unavailable");
  }
  return idr;
};

const getGoldQuote = async (): Promise<MarketQuote> => {
  const goldPayload = await fetchJson<any>(
    "https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=5d"
  );
  const usdPerTroyOunce = readYahooRegularPrice(goldPayload);
  if (!usdPerTroyOunce) throw new Error("Gold quote unavailable");

  const usdToIdr = await getUsdToIdrRate();
  const troyOunceToGram = 31.1034768;
  const idrPerGram = (usdPerTroyOunce * usdToIdr) / troyOunceToGram;

  return {
    symbol: "XAU",
    label: "Emas (IDR/gram)",
    price: idrPerGram,
    currency: "IDR",
    source: "Yahoo Finance + ER-API"
  };
};

const getStockQuote = async (symbol: string): Promise<MarketQuote> => {
  const yahooSymbol = `${symbol.toUpperCase()}.JK`;
  const payload = await fetchJson<any>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=5d`
  );
  const price = readYahooRegularPrice(payload);
  if (!price) throw new Error("Stock quote unavailable");

  return {
    symbol: symbol.toUpperCase(),
    label: `Saham ${symbol.toUpperCase()}`,
    price,
    currency: "IDR",
    source: "Yahoo Finance"
  };
};

const getCryptoQuote = async (symbol: string): Promise<MarketQuote> => {
  const normalized = symbol.toUpperCase();
  const coinId = CRYPTO_ID_MAP[normalized];
  if (!coinId) throw new Error("Unsupported crypto symbol");

  const payload = await fetchJson<Record<string, { idr?: number }>>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=idr`
  );
  const price = payload?.[coinId]?.idr;
  if (!price || !Number.isFinite(price)) throw new Error("Crypto quote unavailable");

  return {
    symbol: normalized,
    label: `Crypto ${normalized}`,
    price,
    currency: "IDR",
    source: "CoinGecko"
  };
};

export const resolveMarketSymbol = (raw: string) => {
  const cleaned = raw.trim().toUpperCase();
  if (!cleaned) return null;

  if (["EMAS", "GOLD", "XAU"].includes(cleaned)) return { kind: "gold" as const, symbol: "XAU" };
  if (CRYPTO_ID_MAP[cleaned]) return { kind: "crypto" as const, symbol: cleaned };
  if (/^[A-Z]{4,6}$/.test(cleaned)) return { kind: "stock" as const, symbol: cleaned };
  return null;
};

export const getMarketQuoteBySymbol = async (raw: string): Promise<MarketQuote> => {
  const resolved = resolveMarketSymbol(raw);
  if (!resolved) {
    throw new Error("Kode market belum didukung.");
  }

  if (resolved.kind === "gold") return getGoldQuote();
  if (resolved.kind === "crypto") return getCryptoQuote(resolved.symbol);
  return getStockQuote(resolved.symbol);
};
