import type {
  PortfolioValuationSnapshot
} from "@/lib/services/market/portfolio/portfolio-valuation.types";

export const buildEmptyPortfolioSnapshot = (): PortfolioValuationSnapshot => ({
  items: [],
  totalBookValue: 0,
  totalCurrentValue: 0,
  totalUnrealizedGain: 0,
  totalLiquidValue: 0,
  liquidSharePercent: 0,
  marketValuedCount: 0,
  bookFallbackCount: 0,
  marketCoveragePercent: 0,
  largestAssetShare: 0,
  topHoldingName: null,
  concentrationRisk: "LOW",
  dominantType: null,
  dominantTypeShare: 0,
  rebalanceStatus: "HEALTHY",
  rebalanceReasons: [],
  profitableAssetCount: 0,
  losingAssetCount: 0,
  typeBreakdown: [],
  diversificationScore: 0
});
