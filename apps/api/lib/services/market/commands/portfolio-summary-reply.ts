import type { PortfolioAssetType } from "@prisma/client";
import { getUserPortfolioValuation } from "@/lib/services/market/portfolio/portfolio-valuation-service";
import { allocatePortfolioShares } from "@/lib/services/market/commands/portfolio-formatters";
import {
  getPortfolioRiskLabel
} from "@/lib/services/market/commands/portfolio-reply-notes";
import {
  hasDailyChangeData,
  isCashLikePortfolioItem
} from "@/lib/services/market/portfolio/portfolio-item-classification";
import type { ValuedPortfolioItem } from "@/lib/services/market/portfolio/portfolio-valuation.types";
import { formatMoneyWhole } from "@/lib/services/shared/money";

const EMPTY_PORTFOLIO_REPLY =
  "Portfolio masih kosong. Contoh: `Tambah saham BBCA 10 lot harga 9000`.";

export type PortfolioReplyPayload = {
  replyText: string;
  replyTexts?: string[];
  preserveReplyTextBubbles?: boolean;
};

const PERCENT_FORMATTER = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
});

const NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

const toTitleCase = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (!word) return "";
      if (/^[A-Z0-9]{2,}$/.test(word)) return word;
      return `${word[0]?.toUpperCase() ?? ""}${word.slice(1).toLowerCase()}`;
    })
    .join(" ");

const formatSignedWholeMoney = (amount: number) => {
  if (Math.abs(amount) < 0.5) return "Rp0";
  return `${amount < 0 ? "-" : "+"}${formatMoneyWhole(Math.abs(amount))}`;
};

const formatSignedPercent = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${PERCENT_FORMATTER.format(value)}%`;
};

const buildDailySummaryLines = (change: number | null, percent: number | null) => {
  if (change == null) {
    return [
      "Perubahan hari ini:",
      "Belum tersedia dari provider harga."
    ];
  }

  const direction = change < 0 ? "turun" : change > 0 ? "naik" : "tidak berubah";
  const percentText = formatSignedPercent(percent);
  return [
    `Hari ini ${direction} sekitar:`,
    `${formatMoneyWhole(Math.abs(change))}${percentText ? ` (${percentText})` : ""}`
  ];
};

const getAssetTypeEmoji = (assetType: PortfolioAssetType) => {
  if (assetType === "PROPERTY") return "🏠";
  if (assetType === "GOLD") return "🪙";
  if (assetType === "STOCK") return "📈";
  if (assetType === "DEPOSIT") return "💰";
  if (assetType === "BUSINESS") return "💼";
  return "📦";
};

const findLargestItemByType = (items: ValuedPortfolioItem[], assetType: PortfolioAssetType) =>
  items
    .filter((item) => item.assetType === assetType)
    .sort((left, right) => right.currentValue - left.currentValue)[0];

const getBreakdownLabel = (params: {
  assetType: PortfolioAssetType;
  items: ValuedPortfolioItem[];
}) => {
  const largestItem = findLargestItemByType(params.items, params.assetType);
  if (params.assetType === "PROPERTY" && largestItem) return toTitleCase(largestItem.displayName);
  if (params.assetType === "GOLD") return "Emas";
  if (params.assetType === "STOCK") return "Saham";
  if (params.assetType === "DEPOSIT") return "Kas";
  if (params.assetType === "BUSINESS") return "Bisnis";
  return "Aset lain";
};

const getDisplayAssetName = (item: ValuedPortfolioItem) => {
  if (isCashLikePortfolioItem(item)) {
    const cleanName = toTitleCase(item.displayName);
    return /^(kas|cash|tabungan)$/i.test(item.displayName)
      ? "Kas / Tabungan"
      : `Kas / Tabungan ${cleanName}`;
  }

  if (item.assetType === "GOLD") {
    const cleaned = item.displayName.replace(/^emas\s+batangan\s+/i, "");
    return /^emas\b/i.test(cleaned) ? toTitleCase(cleaned) : `Emas ${toTitleCase(cleaned)}`;
  }

  if (item.assetType === "STOCK") return item.displayName.toUpperCase();
  return toTitleCase(item.displayName);
};

const buildAiNote = (params: {
  riskLabel: "RENDAH" | "MENENGAH" | "TINGGI";
  topHoldingName: string;
}) => {
  if (params.riskLabel === "TINGGI") {
    return [
      `Portofolio kamu saat ini masih terlalu terkonsentrasi di ${params.topHoldingName}.`,
      "",
      "Artinya, kalau nilai aset utama ini turun atau sulit dicairkan, kondisi keuangan kamu bisa cukup terdampak."
    ];
  }

  if (params.riskLabel === "MENENGAH") {
    return [
      "Sebaran aset kamu sudah mulai terbentuk, tapi masih ada beberapa posisi yang cukup dominan.",
      "",
      "Artinya, portofolio tetap perlu dipantau supaya tidak terlalu berat ke satu aset saja."
    ];
  }

  return [
    "Sebaran aset kamu sudah cukup rapi untuk ukuran dasar.",
    "",
    "Fokus berikutnya tinggal menjaga porsi aset likuid dan rutin memperbarui nilai aset manual."
  ];
};

const buildSuggestionLines = (riskLabel: "RENDAH" | "MENENGAH" | "TINGGI") => {
  if (riskLabel === "RENDAH") {
    return [
      "Komposisi saat ini cukup aman. Tetap jaga kas/dana darurat dan update nilai aset secara berkala."
    ];
  }

  return [
    "Kamu bisa mulai menambah aset yang lebih mudah dicairkan dan lebih tersebar, seperti:",
    "",
    "• Kas / dana darurat",
    "• Reksa dana pasar uang",
    "• Saham atau ETF",
    "• Deposito",
    "• Emas tambahan secukupnya",
    "",
    "Tujuannya supaya portofolio kamu tidak terlalu bergantung pada satu aset besar saja."
  ];
};

export const buildPortfolioSummary = async (userId: string) => {
  const snapshot = await getUserPortfolioValuation(userId);
  if (!snapshot.items.length) return EMPTY_PORTFOLIO_REPLY;

  const itemSharePercents = allocatePortfolioShares(snapshot.items.map((item) => item.currentValue));
  const typeSharePercents = allocatePortfolioShares(
    snapshot.typeBreakdown.map((item) => item.currentValue)
  );
  const topHoldingName = snapshot.topHoldingName ? toTitleCase(snapshot.topHoldingName) : "-";
  const riskLabel = getPortfolioRiskLabel(snapshot.rebalanceStatus, snapshot.concentrationRisk);
  const dailySummaryLines = buildDailySummaryLines(
    snapshot.totalDailyValueChange,
    snapshot.totalDailyValueChangePercent
  );

  const summaryLines = [
    "📊 Ringkasan Portofolio Kamu",
    "",
    "Total aset saat ini:",
    formatMoneyWhole(snapshot.totalCurrentValue),
    "",
    ...dailySummaryLines,
    "",
    "Mayoritas aset kamu masih berada di:",
    ""
  ];

  snapshot.typeBreakdown.slice(0, 5).forEach((item, index) => {
    summaryLines.push(
      `${getAssetTypeEmoji(item.assetType)} ${getBreakdownLabel({
        assetType: item.assetType,
        items: snapshot.items
      })} — ${typeSharePercents[index] ?? 0}%`
    );
  });

  summaryLines.push(
    "",
    "⚠️ Catatan AI",
    "",
    ...buildAiNote({ riskLabel, topHoldingName }),
    "",
    `Tingkat risiko: ${toTitleCase(riskLabel)}`,
    `Skor diversifikasi: ${Math.round(snapshot.diversificationScore)}/100`,
    "",
    "💡 Saran",
    "",
    ...buildSuggestionLines(riskLabel)
  );

  const detailLines = [
    "📦 Detail Aset",
    ""
  ];

  snapshot.items.forEach((item, index) => {
    const dailyPercent = formatSignedPercent(item.dailyPriceChangePercent);
    detailLines.push(
      `${NUMBER_EMOJIS[index] ?? `${index + 1}.`} ${getDisplayAssetName(item)}`,
      formatMoneyWhole(item.currentValue),
      `Porsi: ${itemSharePercents[index] ?? 0}%`
    );

    if (hasDailyChangeData(item) && item.dailyValueChange != null) {
      detailLines.push(
        `Hari ini: ${formatSignedWholeMoney(item.dailyValueChange)}${
          dailyPercent ? ` (${dailyPercent})` : ""
        }`
      );
    }

    if (index < snapshot.items.length - 1) detailLines.push("");
  });

  if (snapshot.bookFallbackCount > 0) {
    detailLines.push("", `${snapshot.bookFallbackCount} aset market belum dapat harga terbaru dari provider.`);
  }

  const replyTexts = [summaryLines.join("\n"), detailLines.join("\n")];
  return {
    replyText: replyTexts.join("\n\n"),
    replyTexts,
    preserveReplyTextBubbles: true
  } satisfies PortfolioReplyPayload;
};
