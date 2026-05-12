import type { PortfolioAssetType } from "@prisma/client";

export type ValuedPortfolioItem = {
  assetType: PortfolioAssetType;
  symbol: string;
  displayName: string;
  quantity: number;
  unit: string;
  averageBuyPrice: number;
  bookValue: number;
  currentPrice: number;
  currentValue: number;
  unrealizedGain: number;
  unrealizedGainPercent: number | null;
  pricingMode: "market" | "book";
  priceSource: string | null;
  isLiquid: boolean;
};

export type PortfolioValuationSnapshot = {
  items: ValuedPortfolioItem[];
  totalBookValue: number;
  totalCurrentValue: number;
  totalUnrealizedGain: number;
  totalLiquidValue: number;
  liquidSharePercent: number;
  marketValuedCount: number;
  bookFallbackCount: number;
  marketCoveragePercent: number;
  largestAssetShare: number;
  topHoldingName: string | null;
  concentrationRisk: "LOW" | "MEDIUM" | "HIGH";
  dominantType: PortfolioAssetType | null;
  dominantTypeShare: number;
  rebalanceStatus: "HEALTHY" | "WATCH" | "ACTION";
  rebalanceReasons: string[];
  profitableAssetCount: number;
  losingAssetCount: number;
  typeBreakdown: Array<{
    assetType: PortfolioAssetType;
    currentValue: number;
    sharePercent: number;
  }>;
  diversificationScore: number;
};
