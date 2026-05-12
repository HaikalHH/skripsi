import { getUserPortfolioValuation } from "@/lib/services/market/portfolio/portfolio-valuation-service";
import {
  allocatePortfolioShares,
  formatPortfolioMoney,
  formatPortfolioPercent,
  formatPortfolioScore,
  formatPortfolioSignedMoney
} from "@/lib/services/market/commands/portfolio-formatters";
import {
  buildPortfolioPriceLine,
  getCompositionInsight,
  getLargestHoldingNote,
  getPortfolioGainNote,
  getPortfolioRiskLabel,
  getPortfolioRiskNote,
  getPortfolioWorstAssetNote,
  getRebalanceLabel,
  getRebalanceNote,
  PORTFOLIO_ASSET_TYPE_LABELS
} from "@/lib/services/market/commands/portfolio-reply-notes";

const EMPTY_PORTFOLIO_REPLY =
  "Portfolio masih kosong. Contoh: `Tambah saham BBCA 10 lot harga 9000`.";

export const buildPortfolioSummary = async (userId: string) => {
  const snapshot = await getUserPortfolioValuation(userId);
  if (!snapshot.items.length) return EMPTY_PORTFOLIO_REPLY;

  const itemSharePercents = allocatePortfolioShares(snapshot.items.map((item) => item.currentValue));
  const typeSharePercents = allocatePortfolioShares(
    snapshot.typeBreakdown.map((item) => item.currentValue)
  );
  const topHoldingShare = itemSharePercents[0] ?? 0;
  const riskLabel = getPortfolioRiskLabel(snapshot.rebalanceStatus, snapshot.concentrationRisk);
  const bestAsset = [...snapshot.items].sort((left, right) => right.unrealizedGain - left.unrealizedGain)[0];
  const worstAsset = [...snapshot.items].sort((left, right) => left.unrealizedGain - right.unrealizedGain)[0];

  const lines = [
    "📊 **Ringkasan Portofolio Kamu**",
    "",
    `💰 **Nilai portofoliomu saat ini:** ${formatPortfolioMoney(snapshot.totalCurrentValue)}`,
    "",
    `Total uang yang sudah kamu masukkan: ${formatPortfolioMoney(snapshot.totalBookValue)}`,
    "",
    `📉 **Untung / Rugi sementara:** ${formatPortfolioSignedMoney(snapshot.totalUnrealizedGain, true)}`,
    `   (${getPortfolioGainNote(snapshot.totalUnrealizedGain)})`,
    "",
    `Uang tunai / kas: ${formatPortfolioMoney(snapshot.totalLiquidValue)}`,
    "   (Bagian dana yang masih likuid dan relatif mudah dipakai kembali)",
    "",
    `🏆 **Aset terbesar yang kamu pegang:** ${snapshot.topHoldingName ?? "-"} (${formatPortfolioPercent(topHoldingShare)})`,
    `   (${getLargestHoldingNote(topHoldingShare)})`,
    "",
    `Tingkat risiko portofolio:  ${riskLabel}`,
    `   (${getPortfolioRiskNote(riskLabel, topHoldingShare)})`,
    "",
    `🔁 **Perlu diatur ulang?:** ${getRebalanceLabel(snapshot.rebalanceStatus)}`,
    `   (${getRebalanceNote(snapshot.rebalanceStatus)})`,
    "",
    `📊 **Skor diversifikasi:** ${formatPortfolioScore(snapshot.diversificationScore)}/100`,
    "",
    `Aset yang lagi untung / rugi: ${snapshot.profitableAssetCount} untung, ${snapshot.losingAssetCount} rugi`,
    "",
    `Aset paling banyak ruginya: ${
      worstAsset && worstAsset.unrealizedGain < 0
        ? `${worstAsset.displayName} (${formatPortfolioSignedMoney(worstAsset.unrealizedGain)})`
        : "Belum ada aset yang rugi"
    }`,
    `   (${getPortfolioWorstAssetNote(worstAsset)})`,
    "",
    "🗂️ **Rincian jenis investasi:**"
  ];

  snapshot.typeBreakdown.forEach((item, index) => {
    lines.push(
      `   - ${PORTFOLIO_ASSET_TYPE_LABELS[item.assetType] ?? item.assetType}: ${formatPortfolioPercent(
        typeSharePercents[index] ?? 0
      )}`
    );
  });

  lines.push("", "🏅 **Komposisi Aset Kamu**", "");
  snapshot.items.forEach((item, index) => {
    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "▪️";
    lines.push(
      `${index + 1}. ${medal} **${item.displayName}** - ${formatPortfolioMoney(
        item.currentValue
      )} (${formatPortfolioPercent(itemSharePercents[index] ?? 0)})`
    );
    lines.push(`   - ${buildPortfolioPriceLine(item)}`);
    lines.push(`   - Untung/Rugi: ${formatPortfolioSignedMoney(item.unrealizedGain, true)}`);
    lines.push(
      `   - _(${getCompositionInsight({
        item,
        itemSharePercent: itemSharePercents[index] ?? 0,
        index
      })})_`
    );
    if (index < snapshot.items.length - 1) lines.push("");
  });

  if (snapshot.bookFallbackCount > 0) {
    lines.push("");
    lines.push(` ${snapshot.bookFallbackCount} aset masih menggunakan harga beli karena harga pasar belum tersedia.`);
  }

  if (bestAsset && bestAsset.unrealizedGain > 0 && snapshot.losingAssetCount === 0) {
    lines.push("");
    lines.push(
      `Saat ini belum ada aset yang rugi. Posisi terbaikmu sementara ada di ${bestAsset.displayName} dengan ${formatPortfolioSignedMoney(
        bestAsset.unrealizedGain,
        true
      )}.`
    );
  }

  return lines.join("\n");
};
