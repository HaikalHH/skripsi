import { PortfolioAssetType } from "@prisma/client";
import type { ValuedPortfolioItem } from "@/lib/services/market/portfolio/portfolio-valuation.types";

export const isCashLikePortfolioItem = (
  item: Pick<ValuedPortfolioItem, "assetType" | "isLiquid">
) => item.assetType === PortfolioAssetType.DEPOSIT || item.isLiquid;

export const isManualValuedPortfolioItem = (
  item: Pick<ValuedPortfolioItem, "assetType" | "isLiquid">
) =>
  !isCashLikePortfolioItem(item) &&
  (item.assetType === PortfolioAssetType.PROPERTY ||
    item.assetType === PortfolioAssetType.BUSINESS ||
    item.assetType === PortfolioAssetType.OTHER);

export const needsMarketPrice = (
  item: Pick<ValuedPortfolioItem, "assetType" | "isLiquid">
) =>
  !isCashLikePortfolioItem(item) &&
  (item.assetType === PortfolioAssetType.GOLD || item.assetType === PortfolioAssetType.STOCK);

export const hasDailyChangeData = (
  item: Pick<ValuedPortfolioItem, "assetType" | "isLiquid" | "pricingMode">
) => needsMarketPrice(item) && item.pricingMode === "market";
