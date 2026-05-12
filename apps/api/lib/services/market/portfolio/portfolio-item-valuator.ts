import { getMarketQuoteBySymbol } from "@/lib/services/market/quote";
import type { PortfolioAssetRow } from "@/lib/services/market/portfolio/portfolio-model";
import type {
  ValuedPortfolioItem
} from "@/lib/services/market/portfolio/portfolio-valuation.types";
import {
  isLikelyLiquidAsset,
  resolveEffectivePortfolioAssetType,
  resolveMarketSymbolForAsset
} from "@/lib/services/market/portfolio/portfolio-asset-resolver";
import {
  normalizeMoney,
  normalizeStoredGoldPrice,
  toNumber
} from "@/lib/services/market/portfolio/portfolio-value-utils";

export const valuePortfolioAsset = async (
  asset: PortfolioAssetRow
): Promise<ValuedPortfolioItem> => {
  const quantity = toNumber(asset.quantity);
  const averageBuyPrice = normalizeStoredGoldPrice({
    assetType: asset.assetType,
    unit: asset.unit,
    price: toNumber(asset.averageBuyPrice)
  });
  const bookValue = quantity * averageBuyPrice;
  const marketSymbol = resolveMarketSymbolForAsset(asset);
  const effectiveAssetType = resolveEffectivePortfolioAssetType(asset);

  let currentPrice = averageBuyPrice;
  let pricingMode: "market" | "book" = "book";
  let priceSource: string | null = null;

  if (marketSymbol) {
    try {
      const quote = await getMarketQuoteBySymbol(marketSymbol);
      currentPrice = quote.price;
      pricingMode = "market";
      priceSource = quote.status === "stale" ? `${quote.source} [cache ${quote.cachedAt}]` : quote.source;
    } catch {
      pricingMode = "book";
    }
  }

  const currentValue = quantity * currentPrice;
  const unrealizedGain = normalizeMoney(currentValue - bookValue);
  const unrealizedGainPercent = bookValue > 0 ? (unrealizedGain / bookValue) * 100 : null;

  return {
    assetType: effectiveAssetType,
    symbol: asset.symbol,
    displayName: asset.displayName,
    quantity,
    unit: asset.unit,
    averageBuyPrice,
    bookValue,
    currentPrice,
    currentValue,
    unrealizedGain,
    unrealizedGainPercent,
    pricingMode,
    priceSource,
    isLiquid: isLikelyLiquidAsset(asset)
  };
};
