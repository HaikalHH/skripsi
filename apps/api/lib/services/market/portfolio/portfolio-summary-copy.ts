import type { PortfolioAssetType as PrismaPortfolioAssetType } from "@prisma/client";
import { formatMoney } from "@/lib/services/shared/money";
import type { ValuedPortfolioItem } from "@/lib/services/market/portfolio";

const PORTFOLIO_PERCENT_FORMATTER = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

export const PORTFOLIO_ASSET_TYPE_LABELS: Record<PrismaPortfolioAssetType, string> = {
  GOLD: "Emas (GOLD)",
  STOCK: "Saham (STOCK)",
  MUTUAL_FUND: "Lainnya",
  CRYPTO: "Kripto (CRYPTO)",
  DEPOSIT: "Deposito / Kas",
  PROPERTY: "Properti",
  BUSINESS: "Bisnis",
  OTHER: "Lainnya"
};

export const formatPortfolioMoney = (amount: number) =>
  formatMoney(amount).replace(/^(-?)Rp/, "$1Rp ");

export const formatPortfolioSignedMoney = (amount: number, showPlusForPositive = false) => {
  const normalized = Math.abs(amount) < 0.5 ? 0 : amount;
  const absolute = formatPortfolioMoney(Math.abs(normalized));
  if (normalized < 0) return `-${absolute}`;
  if (normalized > 0 && showPlusForPositive) return `+${absolute}`;
  return absolute;
};

export const formatPortfolioPercent = (value: number) =>
  `${PORTFOLIO_PERCENT_FORMATTER.format(Math.round(value))}%`;

export const formatPortfolioScore = (value: number) =>
  PORTFOLIO_PERCENT_FORMATTER.format(Math.max(0, Math.round(value)));

export const allocatePortfolioShares = (values: number[]) => {
  if (!values.length) return [];
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);

  const ranked = values.map((value, index) => {
    const rawPercent = (value / total) * 100;
    const floored = Math.floor(rawPercent);
    return {
      index,
      value,
      floored,
      remainder: rawPercent - floored
    };
  });
  const shares = ranked.map((entry) => entry.floored);

  ranked
    .slice()
    .sort((left, right) => {
      if (right.remainder !== left.remainder) return right.remainder - left.remainder;
      if (right.value !== left.value) return right.value - left.value;
      return left.index - right.index;
    })
    .slice(0, Math.max(0, 100 - shares.reduce((sum, value) => sum + value, 0)))
    .forEach((entry) => {
      shares[entry.index] = (shares[entry.index] ?? 0) + 1;
    });

  return shares;
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

export const getRebalanceLabel = (status: "HEALTHY" | "WATCH" | "ACTION") => {
  if (status === "ACTION") return "IYA - Disarankan untuk mulai diversifikasi";
  if (status === "WATCH") return "BOLEH DIPERTIMBANGKAN - Komposisinya mulai berat di beberapa aset";
  return "BELUM MENDESAK - Komposisinya masih cukup seimbang";
};

export const getRebalanceNote = (status: "HEALTHY" | "WATCH" | "ACTION") => {
  if (status === "ACTION") {
    return "Coba tambah aset lain supaya risiko portofoliomu tidak terlalu bergantung pada satu area saja.";
  }
  if (status === "WATCH") {
    return "Belum darurat, tapi mulai bagus kalau kamu rapikan komposisinya sedikit demi sedikit.";
  }
  return "Untuk sekarang komposisinya masih cukup sehat, jadi belum perlu buru-buru diatur ulang.";
};

export const getPortfolioGainNote = (gain: number) => {
  if (gain < 0) {
    return `Belum nyata - baru terasa kalau kamu jual asetnya sekarang. Kamu masih rugi sekitar ${formatPortfolioMoney(
      Math.abs(gain)
    )} di atas kertas.`;
  }

  if (gain > 0) {
    return `Belum nyata - ini masih keuntungan di atas kertas. Kalau dijual sekarang, kamu sedang unggul sekitar ${formatPortfolioMoney(
      gain
    )}.`;
  }

  return "Kalau dijual sekarang, nilainya masih kurang lebih sama dengan modal yang sudah kamu keluarkan.";
};

export const getLargestHoldingNote = (sharePercent: number) => {
  if (sharePercent >= 50) return "Hampir sebagian besar uangmu ada di sini.";
  if (sharePercent >= 35) return "Ini masih jadi porsi terbesar di portofoliomu saat ini.";
  return "Ini aset dengan bobot paling besar di portofoliomu sekarang.";
};

export const getPortfolioWorstAssetNote = (item: ValuedPortfolioItem | undefined) => {
  if (!item || item.unrealizedGain >= 0) {
    return "Saat ini belum ada aset yang sedang merah, jadi belum ada posisi yang benar-benar membebani portofolio.";
  }

  return "Aset ini yang paling banyak menyumbang kerugian sementara di portofoliomu.";
};

export const toDisplayUnitLabel = (unit: string) => {
  if (unit === "share") return "lembar";
  return unit;
};

export const buildPortfolioPriceLine = (item: ValuedPortfolioItem) => {
  const unitLabel = toDisplayUnitLabel(item.unit);
  const shouldShowUnitPrice =
    unitLabel !== "unit" &&
    unitLabel !== "account" &&
    (item.quantity > 1 || item.assetType === "GOLD" || item.assetType === "STOCK");
  const priceText =
    shouldShowUnitPrice
      ? `${formatPortfolioMoney(item.currentPrice)} per ${unitLabel}`
      : formatPortfolioMoney(item.currentPrice);

  if (item.pricingMode === "market") {
    return `Harga pasar sekarang: ${priceText}`;
  }

  return `Harga yang dipakai saat ini: ${priceText} (sementara masih pakai harga beli)`;
};



export const getCompositionNote = (params: {
  item: ValuedPortfolioItem;
  itemSharePercent: number;
  index: number;
}) => {
  const { item, itemSharePercent, index } = params;

  if (index === 0 && item.pricingMode === "book") {
    return "Ini aset terbesar kamu, tapi harga pasarnya belum tersedia sehingga nilainya masih dihitung dari harga beli.";
  }

  if (index === 0) {
    return itemSharePercent >= 50
      ? "Ini aset terbesar kamu. Bobotnya sangat dominan, jadi geraknya paling terasa ke total portofolio."
      : "Ini aset terbesar kamu. Pergerakannya paling memengaruhi total nilai portofoliomu.";
  }

  if (item.pricingMode === "book") {
    return "Harga pasar belum tersedia, jadi posisi ini masih dihitung pakai harga beli sebagai acuan sementara.";
  }

  if (item.unrealizedGain < 0 && item.unrealizedGainPercent != null && Math.abs(item.unrealizedGainPercent) >= 10) {
    return "Posisi ini sedang turun cukup dalam dibanding modal awal, jadi layak dipantau lebih dekat.";
  }

  if (item.unrealizedGain < 0) {
    return "Posisi ini sedang minus tipis, tapi masih sebatas rugi di atas kertas.";
  }

  if (item.unrealizedGain > 0) {
    return "Posisi ini sedang di zona hijau dan ikut membantu menahan portofoliomu.";
  }

  return "Posisi ini masih relatif netral, belum banyak bergerak dari modal awal.";
};

