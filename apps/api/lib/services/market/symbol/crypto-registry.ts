export type CryptoMetadata = {
  canonicalSymbol: string;
  displayName: string;
  coingeckoId: string;
  finnhubSymbol: string;
  aliases: string[];
  searchKeywords: string[];
};

export const CRYPTO_METADATA: Record<string, CryptoMetadata> = {
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
