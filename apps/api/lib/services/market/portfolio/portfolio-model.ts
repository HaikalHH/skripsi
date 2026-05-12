import type { PortfolioAssetType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PortfolioAssetRow = {
  id: string;
  assetType: PortfolioAssetType;
  symbol: string;
  displayName: string;
  quantity: unknown;
  unit: string;
  averageBuyPrice: unknown;
};

export type PortfolioAssetModel = {
  findMany: (args: {
    where: { userId: string };
    orderBy?: Array<Record<string, "asc" | "desc">>;
  }) => Promise<PortfolioAssetRow[]>;
};

export const getPortfolioModel = () =>
  (prisma as unknown as { portfolioAsset?: PortfolioAssetModel }).portfolioAsset;
