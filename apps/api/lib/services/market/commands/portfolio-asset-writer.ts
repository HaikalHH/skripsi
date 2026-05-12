import type { PortfolioAssetType as PrismaPortfolioAssetType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ParsedAddAsset } from "@/lib/services/market/commands/portfolio-command.types";
import { toNumber } from "@/lib/services/market/commands/portfolio-formatters";

type PortfolioCommandAssetRow = {
  id: string;
  quantity: unknown;
  averageBuyPrice: unknown;
  displayName: string;
  unit: string;
};

type PortfolioCommandModel = {
  findMany: (args: {
    where: { userId: string };
    orderBy?: Array<Record<string, "asc" | "desc">>;
  }) => Promise<PortfolioCommandAssetRow[]>;
  findUnique: (args: {
    where: {
      userId_assetType_symbol: {
        userId: string;
        assetType: PrismaPortfolioAssetType;
        symbol: string;
      };
    };
  }) => Promise<PortfolioCommandAssetRow | null>;
  create: (args: {
    data: {
      userId: string;
      assetType: PrismaPortfolioAssetType;
      symbol: string;
      displayName: string;
      quantity: number;
      unit: string;
      averageBuyPrice: number;
      currency: "IDR";
    };
  }) => Promise<PortfolioCommandAssetRow>;
  update: (args: {
    where: { id: string };
    data: { quantity: number; averageBuyPrice: number };
  }) => Promise<PortfolioCommandAssetRow>;
};

export const getPortfolioCommandModel = () =>
  (prisma as unknown as { portfolioAsset?: PortfolioCommandModel }).portfolioAsset;

export const createOrUpdateAsset = async (params: { userId: string; input: ParsedAddAsset }) => {
  const portfolioModel = getPortfolioCommandModel();
  if (!portfolioModel) throw new Error("Model portfolio belum tersedia. Jalankan prisma generate.");

  const assetType = params.input.assetType as PrismaPortfolioAssetType;
  const existing = await portfolioModel.findUnique({
    where: {
      userId_assetType_symbol: {
        userId: params.userId,
        assetType,
        symbol: params.input.symbol
      }
    }
  });

  if (!existing) {
    return portfolioModel.create({
      data: {
        userId: params.userId,
        assetType,
        symbol: params.input.symbol,
        displayName: params.input.displayName,
        quantity: params.input.quantity,
        unit: params.input.unit,
        averageBuyPrice: params.input.pricePerUnit,
        currency: "IDR"
      }
    });
  }

  const existingQty = toNumber(existing.quantity);
  const existingPrice = toNumber(existing.averageBuyPrice);
  const mergedQty = existingQty + params.input.quantity;
  const mergedAvgPrice =
    mergedQty > 0
      ? (existingQty * existingPrice + params.input.quantity * params.input.pricePerUnit) / mergedQty
      : params.input.pricePerUnit;

  return portfolioModel.update({
    where: { id: existing.id },
    data: { quantity: mergedQty, averageBuyPrice: mergedAvgPrice }
  });
};
