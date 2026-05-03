export type MarketAssetKind = "stock" | "crypto" | "gold";

export type NormalizedMarketSymbol = {
  rawInput: string;
  kind: MarketAssetKind;
  canonicalSymbol: string;
  displaySymbol: string;
  displayName: string;
  aliases: string[];
  searchKeywords: string[];
  providerSymbols: {
    finnhub?: string;
    yahoo?: string;
    coingeckoId?: string;
    goldApi?: string;
    rssQuery?: string;
  };
};

type CryptoMetadata = {
  canonicalSymbol: string;
  displayName: string;
  coingeckoId: string;
  finnhubSymbol: string;
  aliases: string[];
  searchKeywords: string[];
};

type StockMetadata = {
  canonicalSymbol: string;
  displayName: string;
  aliases: string[];
  searchKeywords: string[];
  market: "IDX" | "GLOBAL";
};

const GOLD_ALIASES = ["EMAS", "GOLD", "XAU"];

const CRYPTO_METADATA: Record<string, CryptoMetadata> = {
  BTC: {
    canonicalSymbol: "BTC",
    displayName: "Bitcoin",
    coingeckoId: "bitcoin",
    finnhubSymbol: "BINANCE:BTCUSDT",
    aliases: ["BTC", "BTC/USDT", "BTCUSDT", "BITCOIN"],
    searchKeywords: ["BTC", "Bitcoin", "BTC/USDT"]
  },
  ETH: {
    canonicalSymbol: "ETH",
    displayName: "Ethereum",
    coingeckoId: "ethereum",
    finnhubSymbol: "BINANCE:ETHUSDT",
    aliases: ["ETH", "ETH/USDT", "ETHUSDT", "ETHEREUM"],
    searchKeywords: ["ETH", "Ethereum", "ETH/USDT"]
  },
  SOL: {
    canonicalSymbol: "SOL",
    displayName: "Solana",
    coingeckoId: "solana",
    finnhubSymbol: "BINANCE:SOLUSDT",
    aliases: ["SOL", "SOL/USDT", "SOLUSDT", "SOLANA"],
    searchKeywords: ["SOL", "Solana", "SOL/USDT"]
  },
  BNB: {
    canonicalSymbol: "BNB",
    displayName: "BNB",
    coingeckoId: "binancecoin",
    finnhubSymbol: "BINANCE:BNBUSDT",
    aliases: ["BNB", "BNB/USDT", "BNBUSDT", "BINANCECOIN"],
    searchKeywords: ["BNB", "BNB/USDT", "Binance"]
  },
  XRP: {
    canonicalSymbol: "XRP",
    displayName: "XRP",
    coingeckoId: "ripple",
    finnhubSymbol: "BINANCE:XRPUSDT",
    aliases: ["XRP", "XRP/USDT", "XRPUSDT", "RIPPLE"],
    searchKeywords: ["XRP", "Ripple", "XRP/USDT"]
  },
  ADA: {
    canonicalSymbol: "ADA",
    displayName: "Cardano",
    coingeckoId: "cardano",
    finnhubSymbol: "BINANCE:ADAUSDT",
    aliases: ["ADA", "ADA/USDT", "ADAUSDT", "CARDANO"],
    searchKeywords: ["ADA", "Cardano", "ADA/USDT"]
  },
  DOGE: {
    canonicalSymbol: "DOGE",
    displayName: "Dogecoin",
    coingeckoId: "dogecoin",
    finnhubSymbol: "BINANCE:DOGEUSDT",
    aliases: ["DOGE", "DOGE/USDT", "DOGEUSDT", "DOGECOIN"],
    searchKeywords: ["DOGE", "Dogecoin", "DOGE/USDT"]
  },
  DOT: {
    canonicalSymbol: "DOT",
    displayName: "Polkadot",
    coingeckoId: "polkadot",
    finnhubSymbol: "BINANCE:DOTUSDT",
    aliases: ["DOT", "DOT/USDT", "DOTUSDT", "POLKADOT"],
    searchKeywords: ["DOT", "Polkadot", "DOT/USDT"]
  },
  AVAX: {
    canonicalSymbol: "AVAX",
    displayName: "Avalanche",
    coingeckoId: "avalanche-2",
    finnhubSymbol: "BINANCE:AVAXUSDT",
    aliases: ["AVAX", "AVAX/USDT", "AVAXUSDT", "AVALANCHE"],
    searchKeywords: ["AVAX", "Avalanche", "AVAX/USDT"]
  },
  USDT: {
    canonicalSymbol: "USDT",
    displayName: "Tether",
    coingeckoId: "tether",
    finnhubSymbol: "BINANCE:USDTIDR",
    aliases: ["USDT", "USDT/IDR", "USDTIDR", "TETHER"],
    searchKeywords: ["USDT", "Tether"]
  }
};

const STOCK_ALIAS_TO_CANONICAL: Record<string, string> = {
  APPLE: "AAPL",
  AMAZON: "AMZN",
  ALPHABET: "GOOGL",
  GOOGLE: "GOOGL",
  BCA: "BBCA",
  BANKCENTRALASIA: "BBCA",
  BRI: "BBRI",
  BANKRAKYATINDONESIA: "BBRI",
  MANDIRI: "BMRI",
  BANKMANDIRI: "BMRI",
  TELKOM: "TLKM",
  TELKOMINDONESIA: "TLKM",
  GOTOGROUP: "GOTO",
  ASTRA: "ASII",
  ASTRAINTERNATIONAL: "ASII",
  GOOG: "GOOGL",
  FB: "META",
  FACEBOOK: "META",
  MICROSOFT: "MSFT",
  NVIDIA: "NVDA",
  TESLA: "TSLA"
};

const STOCK_METADATA: Record<string, StockMetadata> = {
  BBCA: {
    canonicalSymbol: "BBCA",
    displayName: "Bank Central Asia",
    aliases: ["BBCA", "BCA", "BANK CENTRAL ASIA"],
    searchKeywords: ["BBCA", "BCA", "Bank Central Asia"],
    market: "IDX"
  },
  BBRI: {
    canonicalSymbol: "BBRI",
    displayName: "Bank Rakyat Indonesia",
    aliases: ["BBRI", "BRI", "BANK RAKYAT INDONESIA"],
    searchKeywords: ["BBRI", "BRI", "Bank Rakyat Indonesia"],
    market: "IDX"
  },
  BMRI: {
    canonicalSymbol: "BMRI",
    displayName: "Bank Mandiri",
    aliases: ["BMRI", "MANDIRI", "BANK MANDIRI"],
    searchKeywords: ["BMRI", "Bank Mandiri"],
    market: "IDX"
  },
  TLKM: {
    canonicalSymbol: "TLKM",
    displayName: "Telkom Indonesia",
    aliases: ["TLKM", "TELKOM", "TELKOM INDONESIA"],
    searchKeywords: ["TLKM", "Telkom Indonesia"],
    market: "IDX"
  },
  GOTO: {
    canonicalSymbol: "GOTO",
    displayName: "GoTo",
    aliases: ["GOTO", "GO TO", "GOTO GROUP"],
    searchKeywords: ["GOTO", "GoTo"],
    market: "IDX"
  },
  ASII: {
    canonicalSymbol: "ASII",
    displayName: "Astra International",
    aliases: ["ASII", "ASTRA", "ASTRA INTERNATIONAL"],
    searchKeywords: ["ASII", "Astra International"],
    market: "IDX"
  },
  AAPL: {
    canonicalSymbol: "AAPL",
    displayName: "Apple",
    aliases: ["AAPL", "APPLE"],
    searchKeywords: ["AAPL", "Apple"],
    market: "GLOBAL"
  },
  AMZN: {
    canonicalSymbol: "AMZN",
    displayName: "Amazon",
    aliases: ["AMZN", "AMAZON"],
    searchKeywords: ["AMZN", "Amazon"],
    market: "GLOBAL"
  },
  GOOGL: {
    canonicalSymbol: "GOOGL",
    displayName: "Alphabet",
    aliases: ["GOOGL", "GOOG", "ALPHABET", "GOOGLE"],
    searchKeywords: ["GOOGL", "Google", "Alphabet"],
    market: "GLOBAL"
  },
  META: {
    canonicalSymbol: "META",
    displayName: "Meta",
    aliases: ["META", "FACEBOOK", "FB"],
    searchKeywords: ["META", "Meta", "Facebook"],
    market: "GLOBAL"
  },
  MSFT: {
    canonicalSymbol: "MSFT",
    displayName: "Microsoft",
    aliases: ["MSFT", "MICROSOFT"],
    searchKeywords: ["MSFT", "Microsoft"],
    market: "GLOBAL"
  },
  NVDA: {
    canonicalSymbol: "NVDA",
    displayName: "NVIDIA",
    aliases: ["NVDA", "NVIDIA"],
    searchKeywords: ["NVDA", "NVIDIA"],
    market: "GLOBAL"
  },
  TSLA: {
    canonicalSymbol: "TSLA",
    displayName: "Tesla",
    aliases: ["TSLA", "TESLA"],
    searchKeywords: ["TSLA", "Tesla"],
    market: "GLOBAL"
  }
};

const MARKET_SYMBOL_CANDIDATES = Array.from(
  new Set([
    ...GOLD_ALIASES,
    ...Object.keys(CRYPTO_METADATA),
    ...Object.values(CRYPTO_METADATA).flatMap((entry) => entry.aliases),
    ...Object.keys(STOCK_METADATA),
    ...Object.keys(STOCK_ALIAS_TO_CANONICAL),
    ...Object.values(STOCK_METADATA).flatMap((entry) => entry.aliases)
  ])
);

const normalizeRawSymbol = (raw: string) =>
  raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^[^A-Z0-9]+|[^A-Z0-9./:-]+$/g, "");

const isKnownGlobalStock = (symbol: string) =>
  STOCK_METADATA[symbol]?.market === "GLOBAL";

const toYahooIdxSymbol = (symbol: string) => `${symbol}.JK`;

const buildGoldSymbol = (rawInput: string): NormalizedMarketSymbol => ({
  rawInput,
  kind: "gold",
  canonicalSymbol: "XAU",
  displaySymbol: "XAU",
  displayName: "Emas",
  aliases: GOLD_ALIASES,
  searchKeywords: ["XAU", "Emas", "Gold"],
  providerSymbols: {
    goldApi: "XAU/USD",
    yahoo: "GC=F",
    rssQuery: "emas OR gold OR XAU"
  }
});

const buildCryptoSymbol = (
  rawInput: string,
  metadata: CryptoMetadata
): NormalizedMarketSymbol => ({
  rawInput,
  kind: "crypto",
  canonicalSymbol: metadata.canonicalSymbol,
  displaySymbol: metadata.canonicalSymbol,
  displayName: metadata.displayName,
  aliases: metadata.aliases,
  searchKeywords: metadata.searchKeywords,
  providerSymbols: {
    finnhub: metadata.finnhubSymbol,
    coingeckoId: metadata.coingeckoId,
    rssQuery: metadata.searchKeywords.join(" OR ")
  }
});

const buildStockSymbol = (
  rawInput: string,
  canonicalSymbol: string,
  metadata?: StockMetadata
): NormalizedMarketSymbol => {
  const market = metadata?.market ?? (isKnownGlobalStock(canonicalSymbol) ? "GLOBAL" : "IDX");
  const providerSymbol = market === "IDX" ? toYahooIdxSymbol(canonicalSymbol) : canonicalSymbol;
  const displayName = metadata?.displayName ?? `Saham ${canonicalSymbol}`;
  const aliases = metadata?.aliases ?? [canonicalSymbol];
  const searchKeywords = metadata?.searchKeywords ?? [canonicalSymbol];

  return {
    rawInput,
    kind: "stock",
    canonicalSymbol,
    displaySymbol: canonicalSymbol,
    displayName,
    aliases,
    searchKeywords,
    providerSymbols: {
      finnhub: providerSymbol,
      yahoo: providerSymbol,
      rssQuery: searchKeywords.join(" OR ")
    }
  };
};

const normalizeCryptoKey = (cleaned: string) =>
  cleaned
    .replace(/^BINANCE:/, "")
    .replace(/\/USDT$/, "")
    .replace(/USDT$/, "");

const levenshtein = (left: string, right: string) => {
  const matrix = Array.from({ length: left.length + 1 }, (_, index) => [index]);
  for (let column = 0; column <= right.length; column += 1) {
    matrix[0]![column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row]![column] = Math.min(
        matrix[row - 1]![column]! + 1,
        matrix[row]![column - 1]! + 1,
        matrix[row - 1]![column - 1]! + cost
      );
    }
  }

  return matrix[left.length]![right.length]!;
};

export const suggestMarketSymbols = (raw: string, limit = 3) => {
  const cleaned = normalizeRawSymbol(raw);
  if (!cleaned) return [];

  return MARKET_SYMBOL_CANDIDATES
    .map((candidate) => ({
      symbol: candidate,
      score: candidate.startsWith(cleaned)
        ? 0
        : candidate.includes(cleaned) || cleaned.includes(candidate)
          ? 1
          : levenshtein(cleaned, candidate)
    }))
    .sort((left, right) => left.score - right.score || left.symbol.localeCompare(right.symbol))
    .slice(0, limit)
    .map((item) => item.symbol);
};

export const normalizeMarketSymbolForKind = (
  raw: string,
  kind: MarketAssetKind
): NormalizedMarketSymbol | null => {
  const cleaned = normalizeRawSymbol(raw);
  if (!cleaned) return null;

  if (kind === "gold") {
    return buildGoldSymbol(raw);
  }

  if (kind === "crypto") {
    const cryptoKey = normalizeCryptoKey(cleaned);
    const metadata =
      CRYPTO_METADATA[cryptoKey] ??
      Object.values(CRYPTO_METADATA).find((entry) => entry.aliases.includes(cleaned));
    return metadata ? buildCryptoSymbol(raw, metadata) : null;
  }

  const stockKey = cleaned.replace(/\.JK$/, "");
  const canonicalSymbol = STOCK_ALIAS_TO_CANONICAL[stockKey] ?? stockKey;
  if (!/^[A-Z]{1,6}$/.test(canonicalSymbol)) return null;

  return buildStockSymbol(raw, canonicalSymbol, STOCK_METADATA[canonicalSymbol]);
};

export const normalizeMarketSymbol = (raw: string): NormalizedMarketSymbol | null => {
  const cleaned = normalizeRawSymbol(raw);
  if (!cleaned) return null;

  if (GOLD_ALIASES.includes(cleaned)) {
    return buildGoldSymbol(raw);
  }

  const cryptoCandidate = normalizeMarketSymbolForKind(raw, "crypto");
  if (cryptoCandidate) return cryptoCandidate;

  const stockCandidate = normalizeMarketSymbolForKind(raw, "stock");
  if (stockCandidate) return stockCandidate;

  return null;
};

export const normalizeSymbolForNewsQuery = (value: string) => {
  const normalized = normalizeMarketSymbol(value);
  if (!normalized) return value.trim();
  return normalized.searchKeywords.join(" OR ");
};

export const listKnownMarketSymbols = () =>
  Array.from(
    new Set([
      "XAU",
      ...Object.keys(CRYPTO_METADATA),
      ...Object.keys(STOCK_METADATA),
      ...Object.keys(STOCK_ALIAS_TO_CANONICAL)
    ])
  );
