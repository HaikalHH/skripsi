import { formatMoney } from "@/lib/services/shared/money-format";
import { getUserPortfolioValuation } from "@/lib/services/market/portfolio/portfolio-valuation-service";

const EMPTY_PORTFOLIO_REPLY =
  "Portfolio masih kosong. Contoh: `Tambah saham BBCA 10 lot harga 9000`.";

export const buildPortfolioPerformanceReply = async (userId: string) => {
  const snapshot = await getUserPortfolioValuation(userId);
  if (!snapshot.items.length) return EMPTY_PORTFOLIO_REPLY;

  const sortedByGain = [...snapshot.items].sort((left, right) => right.unrealizedGain - left.unrealizedGain);
  const bestAsset = sortedByGain[0];
  const worstAsset = [...snapshot.items].sort((left, right) => left.unrealizedGain - right.unrealizedGain)[0];
  const bestPercent =
    bestAsset?.unrealizedGainPercent != null ? `${bestAsset.unrealizedGainPercent.toFixed(1)}%` : "-";
  const worstPercent =
    worstAsset?.unrealizedGainPercent != null ? `${worstAsset.unrealizedGainPercent.toFixed(1)}%` : "-";

  return [
    "Analisa performa portfolio:",
    `- Total unrealized P/L: ${snapshot.totalUnrealizedGain >= 0 ? "+" : "-"}${formatMoney(
      Math.abs(snapshot.totalUnrealizedGain)
    )}`,
    bestAsset
      ? `- Aset paling cuan: ${bestAsset.displayName} (${bestAsset.unrealizedGain >= 0 ? "+" : "-"}${formatMoney(
          Math.abs(bestAsset.unrealizedGain)
        )} | ${bestPercent})`
      : null,
    worstAsset
      ? `- Aset paling rugi: ${worstAsset.displayName} (${worstAsset.unrealizedGain >= 0 ? "+" : "-"}${formatMoney(
          Math.abs(worstAsset.unrealizedGain)
        )} | ${worstPercent})`
      : null,
    `- Jumlah aset profit/rugi: ${snapshot.profitableAssetCount}/${snapshot.losingAssetCount}`,
    snapshot.bookFallbackCount > 0
      ? `- Catatan: ${snapshot.bookFallbackCount} aset masih pakai harga buku, jadi P/L-nya belum sepenuhnya market-based.`
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
    `- Status rebalance: ${snapshot.rebalanceStatus}`,
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
    `- Status rebalance: ${snapshot.rebalanceStatus}`
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
    `- Risiko konsentrasi: ${snapshot.concentrationRisk}`,
    `- Status rebalance: ${snapshot.rebalanceStatus}`
  ];

  if (snapshot.rebalanceReasons.length) lines.push(`- Alasan utama: ${snapshot.rebalanceReasons[0]}`);
  return lines.join("\n");
};
