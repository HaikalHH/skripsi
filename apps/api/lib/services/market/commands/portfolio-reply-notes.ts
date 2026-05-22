import type { PortfolioAssetType as PrismaPortfolioAssetType } from "@prisma/client";
import type { ValuedPortfolioItem } from "@/lib/services/market/portfolio/portfolio-valuation.types";
import { formatPortfolioMoney } from "@/lib/services/market/commands/portfolio-formatters";
import {
  isCashLikePortfolioItem,
  isManualValuedPortfolioItem
} from "@/lib/services/market/portfolio/portfolio-item-classification";

export const PORTFOLIO_ASSET_TYPE_LABELS: Record<PrismaPortfolioAssetType, string> = {
  GOLD: "Emas (GOLD)",
  STOCK: "Saham (STOCK)",
  MUTUAL_FUND: "Lainnya",
  CRYPTO: "Lainnya",
  DEPOSIT: "Deposito / Kas",
  PROPERTY: "Properti",
  BUSINESS: "Bisnis",
  OTHER: "Lainnya"
};

export const getPortfolioRiskLabel = (
  status: "HEALTHY" | "WATCH" | "ACTION",
  risk: "LOW" | "MEDIUM" | "HIGH"
): "RENDAH" | "MENENGAH" | "TINGGI" => {
  if (status === "ACTION" || risk === "HIGH") return "TINGGI";
  if (status === "WATCH" || risk === "MEDIUM") return "MENENGAH";
  return "RENDAH";
};

export const getPortfolioRiskNote = (riskLabel: "RENDAH" | "MENENGAH" | "TINGGI", topHoldingShare: number) => {
  if (riskLabel === "TINGGI") {
    return topHoldingShare >= 50
      ? "Portofoliomu masih cukup terkonsentrasi di satu aset. Kalau aset utama ini turun, nilai total portofoliomu bisa ikut turun cukup terasa."
      : "Sebaran asetmu masih belum cukup rata, jadi pergerakan beberapa posisi besar bisa cukup memengaruhi total portofolio.";
  }
  if (riskLabel === "MENENGAH") {
    return "Sebarannya sudah lumayan, tapi masih ada beberapa posisi yang cukup dominan dan perlu dipantau.";
  }
  return "Sebaran asetmu sudah cukup rapi untuk ukuran dasar, jadi risikonya tidak terlalu bertumpu pada satu posisi saja.";
};

export const getLargestHoldingNote = (sharePercent: number) => {
  if (sharePercent >= 50) return "Hampir sebagian besar uangmu ada di sini.";
  if (sharePercent >= 35) return "Ini masih jadi porsi terbesar di portofoliomu saat ini.";
  return "Ini aset dengan bobot paling besar di portofoliomu sekarang.";
};

export const buildPortfolioPriceLine = (item: ValuedPortfolioItem) => {
  if (isCashLikePortfolioItem(item)) return `Saldo tercatat: ${formatPortfolioMoney(item.currentValue)}`;
  if (isManualValuedPortfolioItem(item)) return null;

  const unitLabel = item.unit === "share" ? "lembar" : item.unit;
  const shouldShowUnitPrice =
    unitLabel !== "unit" &&
    unitLabel !== "account" &&
    (item.quantity > 1 || item.assetType === "GOLD" || item.assetType === "STOCK");
  const priceText = shouldShowUnitPrice
    ? `${formatPortfolioMoney(item.currentPrice)} per ${unitLabel}`
    : formatPortfolioMoney(item.currentPrice);

  return item.pricingMode === "market"
    ? `Harga pasar sekarang: ${priceText}`
    : "Harga market terbaru belum tersedia dari provider.";
};

export const getCompositionInsight = (params: {
  item: ValuedPortfolioItem;
  itemSharePercent: number;
  index: number;
}) => {
  const { item, itemSharePercent, index } = params;
  if (isCashLikePortfolioItem(item)) return "Ini saldo kas/tabungan, bukan aset market.";
  if (isManualValuedPortfolioItem(item)) return null;
  if (index === 0 && item.pricingMode === "book") return "Ini aset terbesar kamu, tapi harga market terbarunya belum tersedia dari provider.";
  if (index === 0) {
    return itemSharePercent >= 50
      ? "Ini aset terbesar kamu. Bobotnya sangat dominan, jadi geraknya paling terasa ke total portofolio."
      : "Ini aset terbesar kamu. Pergerakannya paling memengaruhi total nilai portofoliomu.";
  }
  if (item.pricingMode === "book") return "Harga market terbaru belum tersedia dari provider.";
  if (item.dailyPriceChange != null && item.dailyPriceChange < 0) return "Hari ini bergerak turun dibanding harga sebelumnya.";
  if (item.dailyPriceChange != null && item.dailyPriceChange > 0) return "Hari ini bergerak naik dibanding harga sebelumnya.";
  return "Perubahan harian belum tersedia dari provider harga.";
};
