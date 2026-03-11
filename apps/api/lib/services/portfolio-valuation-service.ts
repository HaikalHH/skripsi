import { PortfolioAssetType } from "@prisma/client";
import { prisma } from "../prisma";
import { getMarketQuoteBySymbol } from "./market-price-service";

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
  marketValuedCount: number;
  bookFallbackCount: number;
};

const getPortfolioModel = () => (prisma as { portfolioAsset?: any }).portfolioAsset;

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const resolveMarketSymbolForAsset = (asset: {
  assetType: PortfolioAssetType;
  symbol: string;
}) => {
  if (asset.assetType === PortfolioAssetType.GOLD) return "XAU";
  if (asset.assetType === PortfolioAssetType.CRYPTO) return asset.symbol;
  if (asset.assetType === PortfolioAssetType.STOCK) return asset.symbol;
  return null;
};

const isLikelyLiquidAsset = (asset: {
  assetType: PortfolioAssetType;
  displayName: string;
  symbol: string;
}) => {
  if (asset.assetType === PortfolioAssetType.DEPOSIT) return true;
  if (asset.assetType !== PortfolioAssetType.OTHER) return false;

  return /\b(tabungan|saving|savings|cash|kas|dana darurat|emergency)\b/i.test(
    `${asset.displayName} ${asset.symbol}`
  );
};

export const getUserPortfolioValuation = async (
  userId: string
): Promise<PortfolioValuationSnapshot> => {
  const portfolioModel = getPortfolioModel();
  if (!portfolioModel) {
    return {
      items: [],
      totalBookValue: 0,
      totalCurrentValue: 0,
      totalUnrealizedGain: 0,
      totalLiquidValue: 0,
      marketValuedCount: 0,
      bookFallbackCount: 0
    };
  }

  const assets = await portfolioModel.findMany({
    where: { userId },
    orderBy: [{ assetType: "asc" }, { displayName: "asc" }]
  });

  const items = await Promise.all(
    assets.map(
      async (asset: {
        assetType: PortfolioAssetType;
        symbol: string;
        displayName: string;
        quantity: unknown;
        unit: string;
        averageBuyPrice: unknown;
      }): Promise<ValuedPortfolioItem> => {
        const quantity = toNumber(asset.quantity);
        const averageBuyPrice = toNumber(asset.averageBuyPrice);
        const bookValue = quantity * averageBuyPrice;
        const marketSymbol = resolveMarketSymbolForAsset(asset);

        let currentPrice = averageBuyPrice;
        let pricingMode: "market" | "book" = "book";
        let priceSource: string | null = null;

        if (marketSymbol) {
          try {
            const quote = await getMarketQuoteBySymbol(marketSymbol);
            currentPrice = quote.price;
            pricingMode = "market";
            priceSource = quote.source;
          } catch {
            pricingMode = "book";
          }
        }

        const currentValue = quantity * currentPrice;
        const unrealizedGain = currentValue - bookValue;
        const unrealizedGainPercent =
          bookValue > 0 ? (unrealizedGain / bookValue) * 100 : null;

        return {
          assetType: asset.assetType,
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
      }
    )
  );

  const sortedItems = [...items].sort((left, right) => right.currentValue - left.currentValue);
  const totalBookValue = sortedItems.reduce((sum, item) => sum + item.bookValue, 0);
  const totalCurrentValue = sortedItems.reduce((sum, item) => sum + item.currentValue, 0);
  const totalLiquidValue = sortedItems.reduce(
    (sum, item) => sum + (item.isLiquid ? item.currentValue : 0),
    0
  );
  const marketValuedCount = sortedItems.filter((item) => item.pricingMode === "market").length;
  const bookFallbackCount = sortedItems.length - marketValuedCount;

  return {
    items: sortedItems,
    totalBookValue,
    totalCurrentValue,
    totalUnrealizedGain: totalCurrentValue - totalBookValue,
    totalLiquidValue,
    marketValuedCount,
    bookFallbackCount
  };
};
