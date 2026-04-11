import { PortfolioAssetType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getMarketQuoteBySymbol } from "@/lib/services/market/market-price-service";
import { normalizeMarketSymbolForKind } from "@/lib/services/market/market-symbol-normalization";

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
  if (asset.assetType === PortfolioAssetType.GOLD) {
    return normalizeMarketSymbolForKind(asset.symbol || "XAU", "gold")?.canonicalSymbol ?? "XAU";
  }

  if (asset.assetType === PortfolioAssetType.CRYPTO) {
    return normalizeMarketSymbolForKind(asset.symbol, "crypto")?.canonicalSymbol ?? asset.symbol;
  }

  if (asset.assetType === PortfolioAssetType.STOCK) {
    return normalizeMarketSymbolForKind(asset.symbol, "stock")?.canonicalSymbol ?? asset.symbol;
  }

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

const calculateDiversificationScore = (shares: number[]) => {
  if (!shares.length) return 0;
  const normalizedShares = shares.filter((share) => share > 0).map((share) => share / 100);
  if (!normalizedShares.length) return 0;
  const herfindahlIndex = normalizedShares.reduce((sum, share) => sum + share ** 2, 0);
  const effectiveAssetCount = herfindahlIndex > 0 ? 1 / herfindahlIndex : 0;
  return Number(Math.max(0, Math.min(100, (effectiveAssetCount / normalizedShares.length) * 100)).toFixed(1));
};

const resolveRebalanceSignal = (params: {
  largestAssetShare: number;
  dominantTypeShare: number;
  liquidSharePercent: number;
  diversificationScore: number;
}) => {
  const reasons: string[] = [];

  if (params.largestAssetShare >= 60) {
    reasons.push("satu aset sudah mendominasi lebih dari 60% portfolio");
  } else if (params.largestAssetShare >= 40) {
    reasons.push("aset terbesar mulai terlalu dominan");
  }

  if (params.dominantTypeShare >= 70) {
    reasons.push("satu tipe aset mendominasi lebih dari 70%");
  } else if (params.dominantTypeShare >= 50) {
    reasons.push("komposisi tipe aset masih cukup terkonsentrasi");
  }

  if (params.liquidSharePercent < 10) {
    reasons.push("porsi aset likuid masih tipis");
  } else if (params.liquidSharePercent > 75) {
    reasons.push("aset likuid terlalu besar dibanding aset bertumbuh");
  }

  if (params.diversificationScore < 45) {
    reasons.push("diversifikasi masih rendah");
  }

  return {
    rebalanceStatus:
      params.largestAssetShare >= 60 ||
      params.dominantTypeShare >= 70 ||
      params.liquidSharePercent < 10
        ? "ACTION"
        : reasons.length
          ? "WATCH"
          : "HEALTHY",
    reasons
  } as const;
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
            priceSource =
              quote.status === "stale"
                ? `${quote.source} [cache ${quote.cachedAt}]`
                : quote.source;
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
  const liquidSharePercent =
    totalCurrentValue > 0 ? Number(((totalLiquidValue / totalCurrentValue) * 100).toFixed(1)) : 0;
  const marketValuedCount = sortedItems.filter((item) => item.pricingMode === "market").length;
  const bookFallbackCount = sortedItems.length - marketValuedCount;
  const marketCoveragePercent =
    sortedItems.length > 0 ? Number(((marketValuedCount / sortedItems.length) * 100).toFixed(1)) : 0;
  const largestAssetShare =
    totalCurrentValue > 0 && sortedItems[0]
      ? Number(((sortedItems[0].currentValue / totalCurrentValue) * 100).toFixed(1))
      : 0;
  const topHoldingName = sortedItems[0]?.displayName ?? null;
  const concentrationRisk = largestAssetShare >= 60 ? "HIGH" : largestAssetShare >= 35 ? "MEDIUM" : "LOW";
  const profitableAssetCount = sortedItems.filter((item) => item.unrealizedGain > 0).length;
  const losingAssetCount = sortedItems.filter((item) => item.unrealizedGain < 0).length;
  const typeBreakdownMap = new Map<PortfolioAssetType, number>();
  for (const item of sortedItems) {
    typeBreakdownMap.set(item.assetType, (typeBreakdownMap.get(item.assetType) ?? 0) + item.currentValue);
  }
  const typeBreakdown = Array.from(typeBreakdownMap.entries())
    .map(([assetType, currentValue]) => ({
      assetType,
      currentValue,
      sharePercent:
        totalCurrentValue > 0 ? Number(((currentValue / totalCurrentValue) * 100).toFixed(1)) : 0
    }))
    .sort((left, right) => right.currentValue - left.currentValue);
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

  return {
    items: sortedItems,
    totalBookValue,
    totalCurrentValue,
    totalUnrealizedGain: totalCurrentValue - totalBookValue,
    totalLiquidValue,
    liquidSharePercent,
    marketValuedCount,
    bookFallbackCount,
    marketCoveragePercent,
    largestAssetShare,
    topHoldingName,
    concentrationRisk,
    dominantType,
    dominantTypeShare,
    rebalanceStatus: rebalanceSignal.rebalanceStatus,
    rebalanceReasons: rebalanceSignal.reasons,
    profitableAssetCount,
    losingAssetCount,
    typeBreakdown,
    diversificationScore
  };
};
