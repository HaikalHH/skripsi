import { formatMoney } from "@/lib/services/shared/money";
import { getUserPortfolioValuation } from "@/lib/services/market/portfolio/portfolio-valuation-service";
import { hasDailyChangeData } from "@/lib/services/market/portfolio/portfolio-item-classification";

const EMPTY_PORTFOLIO_REPLY =
  "Portfolio masih kosong. Contoh: `Tambah saham BBCA 10 lot harga 9000`.";

const formatSignedMoney = (amount: number) =>
  `${amount >= 0 ? "+" : "-"}${formatMoney(Math.abs(amount))}`;

export const buildPortfolioPerformanceReply = async (userId: string) => {
  const snapshot = await getUserPortfolioValuation(userId);
  if (!snapshot.items.length) return EMPTY_PORTFOLIO_REPLY;

  const dailyItems = snapshot.items.filter(
    (item) => hasDailyChangeData(item) && item.dailyValueChange != null
  );
  const sortedByDailyChange = [...dailyItems].sort(
    (left, right) => (right.dailyValueChange ?? 0) - (left.dailyValueChange ?? 0)
  );
  const strongestAsset = sortedByDailyChange[0];
  const weakestAsset = [...dailyItems].sort(
    (left, right) => (left.dailyValueChange ?? 0) - (right.dailyValueChange ?? 0)
  )[0];

  if (!dailyItems.length || snapshot.totalDailyValueChange == null) {
    return [
      "Analisa pergerakan harian portfolio:",
      "- Perubahan harian: belum tersedia dari provider harga.",
      "- Catatan: saya hanya tampilkan perubahan harian kalau data harga sebelumnya tersedia."
    ].join("\n");
  }

  const strongestPercent =
    strongestAsset?.dailyPriceChangePercent != null ? `${strongestAsset.dailyPriceChangePercent.toFixed(1)}%` : "-";
  const weakestPercent =
    weakestAsset?.dailyPriceChangePercent != null ? `${weakestAsset.dailyPriceChangePercent.toFixed(1)}%` : "-";

  return [
    "Analisa pergerakan harian portfolio:",
    `- Total perubahan harian: ${formatSignedMoney(snapshot.totalDailyValueChange)}${
      snapshot.totalDailyValueChangePercent != null
        ? ` (${snapshot.totalDailyValueChangePercent.toFixed(1)}%)`
        : ""
    }`,
    strongestAsset
      ? `- Aset paling naik hari ini: ${strongestAsset.displayName} (${formatSignedMoney(
          strongestAsset.dailyValueChange ?? 0
        )} | ${strongestPercent})`
      : null,
    weakestAsset
      ? `- Aset paling turun hari ini: ${weakestAsset.displayName} (${formatSignedMoney(
          weakestAsset.dailyValueChange ?? 0
        )} | ${weakestPercent})`
      : null,
    snapshot.bookFallbackCount > 0
      ? `- Catatan: ${snapshot.bookFallbackCount} aset market belum dapat harga terbaru dari provider.`
      : null
  ]
    .filter(Boolean)
    .join("\n");
};

export const buildPortfolioDiversificationReply = async (userId: string) => {
  const snapshot = await getUserPortfolioValuation(userId);
  if (!snapshot.items.length) return EMPTY_PORTFOLIO_REPLY;

  return [
    "Analisa diversifikasi portfolio:",
    `- Skor diversifikasi: ${snapshot.diversificationScore.toFixed(1)}/100`,
    `- Holding terbesar: ${snapshot.topHoldingName ?? "-"} (${snapshot.largestAssetShare.toFixed(1)}%)`,
    `- Tipe aset dominan: ${snapshot.dominantType ?? "-"} (${snapshot.dominantTypeShare.toFixed(1)}%)`,
    `- Rasio aset likuid: ${snapshot.liquidSharePercent.toFixed(1)}%`,
    `- Komposisi tipe aset: ${snapshot.typeBreakdown
      .slice(0, 5)
      .map((item) => `${item.assetType} ${item.sharePercent.toFixed(1)}%`)
      .join(", ")}`,
    snapshot.rebalanceReasons.length
      ? `- Fokus perbaikan: ${snapshot.rebalanceReasons.slice(0, 2).join("; ")}`
      : "- Fokus perbaikan: komposisi relatif seimbang saat ini."
  ]
    .filter(Boolean)
    .join("\n");
};

export const buildPortfolioRiskReply = async (userId: string) => {
  const snapshot = await getUserPortfolioValuation(userId);
  if (!snapshot.items.length) return EMPTY_PORTFOLIO_REPLY;

  const lines = [
    "Analisa risiko portfolio:",
    `- Aset terbesar: ${snapshot.topHoldingName ?? "-"} (${snapshot.largestAssetShare.toFixed(1)}%)`,
    `- Tipe aset dominan: ${snapshot.dominantType ?? "-"} (${snapshot.dominantTypeShare.toFixed(1)}%)`,
    `- Rasio aset likuid: ${snapshot.liquidSharePercent.toFixed(1)}%`,
    `- Skor diversifikasi: ${snapshot.diversificationScore.toFixed(1)}/100`,
    `- Risiko konsentrasi: ${snapshot.concentrationRisk}`
  ];

  if (snapshot.rebalanceReasons.length) {
    lines.push("Yang paling perlu diperhatikan:");
    for (const reason of snapshot.rebalanceReasons.slice(0, 3)) lines.push(`- ${reason}`);
  }

  if (snapshot.rebalanceStatus === "ACTION") {
    lines.push("Saran: kurangi dominasi aset terbesar, tambah tipe aset lain, dan jaga buffer aset likuid minimal 10-20%.");
  } else if (snapshot.rebalanceStatus === "WATCH") {
    lines.push("Saran: portfolio belum gawat, tapi komposisinya perlu dipantau supaya tidak makin terkonsentrasi.");
  } else {
    lines.push("Saran: komposisi portfolio relatif sehat untuk ukuran diversifikasi dasar saat ini.");
  }

  return lines.join("\n");
};

export const buildPortfolioDominanceReply = async (userId: string) => {
  const snapshot = await getUserPortfolioValuation(userId);
  if (!snapshot.items.length) return EMPTY_PORTFOLIO_REPLY;

  const biggestAsset = snapshot.items[0];
  const biggestType = snapshot.typeBreakdown[0];
  const lines = [
    "Aset dominan portfolio kamu:",
    `- Holding terbesar: ${biggestAsset.displayName} (${snapshot.largestAssetShare.toFixed(1)}%)`,
    `- Tipe terbesar: ${biggestType?.assetType ?? "-"} (${snapshot.dominantTypeShare.toFixed(1)}%)`,
    `- Risiko konsentrasi: ${snapshot.concentrationRisk}`
  ];

  if (snapshot.rebalanceReasons.length) lines.push(`- Alasan utama: ${snapshot.rebalanceReasons[0]}`);
  return lines.join("\n");
};
