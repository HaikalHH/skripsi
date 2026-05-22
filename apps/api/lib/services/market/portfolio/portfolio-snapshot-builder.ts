import type { PortfolioAssetType } from "@prisma/client";
import type {
  PortfolioValuationSnapshot,
  ValuedPortfolioItem
} from "@/lib/services/market/portfolio/portfolio-valuation.types";
import {
  calculateDiversificationScore,
  resolveRebalanceSignal
} from "@/lib/services/market/portfolio/portfolio-rebalance";
import { normalizeMoney } from "@/lib/services/market/portfolio/portfolio-value-utils";
import {
  hasDailyChangeData,
  needsMarketPrice
} from "@/lib/services/market/portfolio/portfolio-item-classification";

const buildTypeBreakdown = (items: ValuedPortfolioItem[], totalCurrentValue: number) => {
  const typeBreakdownMap = new Map<PortfolioAssetType, number>();
  for (const item of items) {
    typeBreakdownMap.set(item.assetType, (typeBreakdownMap.get(item.assetType) ?? 0) + item.currentValue);
  }

  return Array.from(typeBreakdownMap.entries())
    .map(([assetType, currentValue]) => ({
      assetType,
      currentValue,
      sharePercent:
        totalCurrentValue > 0 ? Number(((currentValue / totalCurrentValue) * 100).toFixed(1)) : 0
    }))
    .sort((left, right) => right.currentValue - left.currentValue);
};

export const buildPortfolioSnapshot = (
  items: ValuedPortfolioItem[]
): PortfolioValuationSnapshot => {
  const sortedItems = [...items].sort((left, right) => right.currentValue - left.currentValue);
  const totalBookValue = sortedItems.reduce((sum, item) => sum + item.bookValue, 0);
  const totalCurrentValue = sortedItems.reduce((sum, item) => sum + item.currentValue, 0);
  const totalLiquidValue = sortedItems.reduce(
    (sum, item) => sum + (item.isLiquid ? item.currentValue : 0),
    0
  );
  const liquidSharePercent =
    totalCurrentValue > 0 ? Number(((totalLiquidValue / totalCurrentValue) * 100).toFixed(1)) : 0;
  const marketPriceItems = sortedItems.filter(needsMarketPrice);
  const marketValuedCount = marketPriceItems.filter((item) => item.pricingMode === "market").length;
  const bookFallbackCount = marketPriceItems.length - marketValuedCount;
  const marketCoveragePercent =
    marketPriceItems.length > 0 ? Number(((marketValuedCount / marketPriceItems.length) * 100).toFixed(1)) : 100;
  const largestAssetShare =
    totalCurrentValue > 0 && sortedItems[0]
      ? Number(((sortedItems[0].currentValue / totalCurrentValue) * 100).toFixed(1))
      : 0;
  const concentrationRisk = largestAssetShare >= 60 ? "HIGH" : largestAssetShare >= 35 ? "MEDIUM" : "LOW";
  const typeBreakdown = buildTypeBreakdown(sortedItems, totalCurrentValue);
  const dominantType = typeBreakdown[0]?.assetType ?? null;
  const dominantTypeShare = typeBreakdown[0]?.sharePercent ?? 0;
  const diversificationScore = calculateDiversificationScore(
    sortedItems.map((item) =>
      totalCurrentValue > 0 ? (item.currentValue / totalCurrentValue) * 100 : 0
    )
  );
  const rebalanceSignal = resolveRebalanceSignal({
    largestAssetShare,
    dominantTypeShare,
    liquidSharePercent,
    diversificationScore
  });
  const dailyChangeItems = sortedItems.filter(
    (item) => hasDailyChangeData(item) && item.dailyValueChange != null
  );
  const totalDailyValueChange =
    dailyChangeItems.length > 0
      ? normalizeMoney(dailyChangeItems.reduce((sum, item) => sum + (item.dailyValueChange ?? 0), 0))
      : null;
  const previousTotalDailyValue =
    dailyChangeItems.reduce((sum, item) => {
      if (item.previousPrice == null) return sum;
      return sum + item.previousPrice * item.quantity;
    }, 0);
  const totalDailyValueChangePercent =
    totalDailyValueChange != null && previousTotalDailyValue > 0
      ? (totalDailyValueChange / previousTotalDailyValue) * 100
      : null;

  return {
    items: sortedItems,
    totalBookValue,
    totalCurrentValue,
    totalDailyValueChange,
    totalDailyValueChangePercent,
    totalLiquidValue,
    liquidSharePercent,
    marketValuedCount,
    bookFallbackCount,
    marketCoveragePercent,
    largestAssetShare,
    topHoldingName: sortedItems[0]?.displayName ?? null,
    concentrationRisk,
    dominantType,
    dominantTypeShare,
    rebalanceStatus: rebalanceSignal.rebalanceStatus,
    rebalanceReasons: rebalanceSignal.reasons,
    typeBreakdown,
    diversificationScore
  };
};
