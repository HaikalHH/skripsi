import { PortfolioAssetType } from "@prisma/client";
import { TROY_OUNCE_TO_GRAM } from "@/lib/services/market/types/market.constants";

const GOLD_OUNCE_PRICE_THRESHOLD_IDR = 20_000_000;

export const MONEY_EPSILON = 0.5;

export const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

export const normalizeMoney = (value: number) =>
  Math.abs(value) < MONEY_EPSILON ? 0 : value;

export const normalizeStoredGoldPrice = (params: {
  assetType: PortfolioAssetType;
  unit: string;
  price: number;
}) => {
  if (
    params.assetType === PortfolioAssetType.GOLD &&
    params.unit.toLowerCase() === "gram" &&
    params.price >= GOLD_OUNCE_PRICE_THRESHOLD_IDR
  ) {
    return params.price / TROY_OUNCE_TO_GRAM;
  }

  return params.price;
};
