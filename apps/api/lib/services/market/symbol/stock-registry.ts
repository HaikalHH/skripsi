export type StockMetadata = {
  canonicalSymbol: string;
  displayName: string;
  aliases: string[];
  searchKeywords: string[];
  market: "IDX" | "GLOBAL";
};

export const STOCK_ALIAS_TO_CANONICAL: Record<string, string> = {
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

export const STOCK_METADATA: Record<string, StockMetadata> = {
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
