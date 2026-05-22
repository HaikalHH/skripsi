import { PortfolioAssetType } from "@prisma/client";
import { normalizeMarketSymbolForKind } from "@/lib/services/market/symbol";

const LIQUID_ASSET_PATTERN =
  /\b(tabungan|saving|savings|cash|kas|dana darurat|emergency|bank|rekening|giro|bca|bri|bni|mandiri|cimb|jago|seabank|sea bank|blu|ocbc|permata|danamon|dana|ovo|gopay|shopeepay|linkaja)\b/i;

export const resolveMarketSymbolForAsset = (asset: {
  assetType: PortfolioAssetType;
  symbol: string;
}) => {
  if (asset.assetType === PortfolioAssetType.GOLD) {
    return normalizeMarketSymbolForKind(asset.symbol || "XAU", "gold")?.canonicalSymbol ?? "XAU";
  }

  if (asset.assetType === PortfolioAssetType.STOCK) {
    return normalizeMarketSymbolForKind(asset.symbol, "stock")?.canonicalSymbol ?? asset.symbol;
  }

  return null;
};

export const isLikelyLiquidAsset = (asset: {
  assetType: PortfolioAssetType;
  displayName: string;
  symbol: string;
}) => {
  if (asset.assetType === PortfolioAssetType.DEPOSIT) return true;
  if (asset.assetType !== PortfolioAssetType.OTHER) return false;

  return LIQUID_ASSET_PATTERN.test(`${asset.displayName} ${asset.symbol}`);
};

export const resolveEffectivePortfolioAssetType = (asset: {
  assetType: PortfolioAssetType;
  displayName: string;
  symbol: string;
}) =>
  asset.assetType === PortfolioAssetType.OTHER && isLikelyLiquidAsset(asset)
    ? PortfolioAssetType.DEPOSIT
    : asset.assetType;
