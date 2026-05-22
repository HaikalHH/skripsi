export type MarketAssetKind = "stock" | "gold";

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
    goldApi?: string;
    rssQuery?: string;
  };
};
