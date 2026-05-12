import { getPortfolioModel } from "@/lib/services/market/portfolio/portfolio-model";
import { buildEmptyPortfolioSnapshot } from "@/lib/services/market/portfolio/portfolio-empty-snapshot";
import { buildPortfolioSnapshot } from "@/lib/services/market/portfolio/portfolio-snapshot-builder";
import { valuePortfolioAsset } from "@/lib/services/market/portfolio/portfolio-item-valuator";
export type {
  PortfolioValuationSnapshot,
  ValuedPortfolioItem
} from "@/lib/services/market/portfolio/portfolio-valuation.types";

export const getUserPortfolioValuation = async (userId: string) => {
  const portfolioModel = getPortfolioModel();
  if (!portfolioModel) return buildEmptyPortfolioSnapshot();

  const assets = await portfolioModel.findMany({
    where: { userId },
    orderBy: [{ assetType: "asc" }, { displayName: "asc" }]
  });

  const items = await Promise.all(assets.map(valuePortfolioAsset));
  return buildPortfolioSnapshot(items);
};
