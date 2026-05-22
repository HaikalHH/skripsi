import type {
  PortfolioAssetType as PrismaPortfolioAssetType
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeMarketSymbolForKind } from "@/lib/services/market/symbol";

type PortfolioNewsAssetRow = {
  assetType: PrismaPortfolioAssetType;
  symbol: string;
  displayName: string;
};

type PortfolioNewsModel = {
  findMany: (args: {
    where: { userId: string };
    select: { assetType: true; symbol: true; displayName: true };
    take: number;
  }) => Promise<PortfolioNewsAssetRow[]>;
};

export type PortfolioNewsContextItem = {
  assetType: PrismaPortfolioAssetType;
  symbol: string;
  displayName: string;
  normalizedSymbol: string;
  keywords: string[];
};

const getPortfolioModel = () =>
  (prisma as unknown as { portfolioAsset?: PortfolioNewsModel }).portfolioAsset;

const normalizeSpaces = (value: string) => value.trim().replace(/\s+/g, " ");

const normalizePortfolioSymbol = (kind: "stock" | "gold", value: string) =>
  normalizeMarketSymbolForKind(value, kind)?.canonicalSymbol ?? value.trim().toUpperCase();

const resolveNormalizedDetails = (asset: PortfolioNewsAssetRow, normalizedSymbol: string) => {
  if (asset.assetType === "GOLD") return normalizeMarketSymbolForKind(normalizedSymbol, "gold");
  if (asset.assetType === "STOCK") return normalizeMarketSymbolForKind(normalizedSymbol, "stock");
  return null;
};

const resolveNormalizedSymbol = (asset: PortfolioNewsAssetRow) => {
  if (asset.assetType === "GOLD") return normalizePortfolioSymbol("gold", asset.symbol || asset.displayName);
  if (asset.assetType === "STOCK") return normalizePortfolioSymbol("stock", asset.symbol || asset.displayName);
  return asset.symbol.toUpperCase();
};

export const getPortfolioNewsContext = async (
  userId: string
): Promise<PortfolioNewsContextItem[]> => {
  const portfolioModel = getPortfolioModel();
  if (!portfolioModel) return [];

  const assets = await portfolioModel.findMany({
    where: { userId },
    select: { assetType: true, symbol: true, displayName: true },
    take: 12
  });

  return assets
    .map((asset) => {
      const normalizedSymbol = resolveNormalizedSymbol(asset);
      const normalizedDetails = resolveNormalizedDetails(asset, normalizedSymbol);
      const keywords = Array.from(
        new Set(
          [normalizedSymbol, asset.symbol, asset.displayName, ...(normalizedDetails?.searchKeywords ?? [])]
            .map((value) => normalizeSpaces(value))
            .filter(Boolean)
        )
      );

      return { ...asset, normalizedSymbol, keywords };
    })
    .filter((asset) => asset.keywords.length > 0);
};
