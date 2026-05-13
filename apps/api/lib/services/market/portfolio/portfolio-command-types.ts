export type SupportedPortfolioAssetType =
  | "GOLD"
  | "STOCK"
  | "CRYPTO"
  | "DEPOSIT"
  | "PROPERTY"
  | "BUSINESS"
  | "OTHER";

export type ParsedAddAsset = {
  assetType: SupportedPortfolioAssetType;
  symbol: string;
  displayName: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
};

export type GoldAssetKind = "BATANGAN" | "PERHIASAN" | "DIGITAL";
export type GoldPriceMode = "PER_GRAM" | "TOTAL";
export type GoldQuestion =
  | "TYPE"
  | "BRAND"
  | "BRAND_OTHER"
  | "WEIGHT"
  | "DIGITAL_WEIGHT"
  | "KARAT"
  | "KARAT_OTHER"
  | "PLATFORM"
  | "PLATFORM_OTHER"
  | "PRICE"
  | "PRICE_MODE";

export type GoldDraft = {
  assetType?: GoldAssetKind;
  brand?: string;
  karat?: string;
  platform?: string;
  quantityGram?: number;
  priceAmount?: number;
  priceMode?: GoldPriceMode;
};

export type GoldDraftResolution = {
  update: Partial<GoldDraft>;
  promptOverride?: GoldQuestion;
};

export type GoldConversationState = {
  draft: GoldDraft;
  lastQuestion: GoldQuestion | null;
};

export type GoldAddResolution =
  | { handled: true; replyText: string }
  | { handled: true; draft: GoldDraft; input: ParsedAddAsset };

export type StockQuestion = "SYMBOL" | "QUANTITY" | "PRICE" | "CONFIRM" | "CORRECTION";
export type StockQuantityUnit = "lot" | "lembar";

export type StockDraft = {
  symbol?: string;
  quantityAmount?: number;
  quantityUnit?: StockQuantityUnit;
  quantityShares?: number;
  pricePerUnit?: number;
};

export type StockConversationState = {
  draft: StockDraft;
  lastQuestion: StockQuestion | null;
};

export type StockAddResolution =
  | { handled: true; replyText: string }
  | { handled: true; draft: StockDraft; input: ParsedAddAsset };

