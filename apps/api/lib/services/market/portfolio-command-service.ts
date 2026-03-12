import { prisma } from "@/lib/prisma";
import { parsePositiveAmount } from "@/lib/services/transactions/amount-parser";
import { formatMoney } from "@/lib/services/shared/money-format";
import { getUserPortfolioValuation } from "@/lib/services/market/portfolio-valuation-service";

type PortfolioAssetType =
  | "GOLD"
  | "STOCK"
  | "MUTUAL_FUND"
  | "CRYPTO"
  | "DEPOSIT"
  | "PROPERTY"
  | "BUSINESS"
  | "OTHER";

type ParsedAddAsset = {
  assetType: PortfolioAssetType;
  symbol: string;
  displayName: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
};

const normalizeSpaces = (value: string) => value.trim().replace(/\s+/g, " ");

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const parseDecimal = (raw: string): number | null => {
  const normalized = raw.trim().replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseGoldAdd = (text: string): ParsedAddAsset | null => {
  const match = text.match(
    /^(?:tambah|catat|punya)\s+emas(?:\s+(.+?))?\s+([\d.,]+)\s*gram\s+harga\s+([\d.,]+(?:\s*(?:jt|juta|rb|ribu|k))?)(?:\/gram)?$/i
  );
  if (!match) return null;

  const displayName = normalizeSpaces(match[1] ?? "Emas");
  const quantity = parseDecimal(match[2]);
  const pricePerUnit = parsePositiveAmount(match[3]);
  if (!quantity || !pricePerUnit) return null;

  return {
    assetType: "GOLD",
    symbol: "XAU",
    displayName,
    quantity,
    unit: "gram",
    pricePerUnit
  };
};

const parseStockAdd = (text: string): ParsedAddAsset | null => {
  const match = text.match(
    /^(?:tambah|catat|punya)\s+saham\s+([a-z]{3,6})\s+([\d.,]+)\s*(lot|lembar|share)?\s+harga\s+([\d.,]+(?:\s*(?:jt|juta|rb|ribu|k))?)$/i
  );
  if (!match) return null;

  const symbol = match[1].toUpperCase();
  const rawQty = parseDecimal(match[2]);
  const unit = (match[3] ?? "lot").toLowerCase();
  const pricePerUnit = parsePositiveAmount(match[4]);
  if (!rawQty || !pricePerUnit) return null;

  const quantity = unit === "lot" ? rawQty * 100 : rawQty;

  return {
    assetType: "STOCK",
    symbol,
    displayName: symbol,
    quantity,
    unit: "share",
    pricePerUnit
  };
};

const parseCryptoAdd = (text: string): ParsedAddAsset | null => {
  const directSymbolFirst = text.match(
    /^(?:tambah|catat|punya)\s+([a-z0-9]{2,10})\s+([\d.,]+)\s+harga\s+([\d.,]+(?:\s*(?:jt|juta|rb|ribu|k))?)$/i
  );
  if (directSymbolFirst) {
    const symbol = directSymbolFirst[1].toUpperCase();
    if (/^(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|DOT|AVAX|USDT)$/i.test(symbol)) {
      const quantity = parseDecimal(directSymbolFirst[2]);
      const pricePerUnit = parsePositiveAmount(directSymbolFirst[3]);
      if (quantity && pricePerUnit) {
        return {
          assetType: "CRYPTO",
          symbol,
          displayName: symbol,
          quantity,
          unit: "coin",
          pricePerUnit
        };
      }
    }
  }

  const match = text.match(
    /^(?:tambah|catat|punya)\s+(?:crypto\s+|kripto\s+)?([a-z0-9]{2,10})\s+([\d.,]+)\s+harga\s+([\d.,]+(?:\s*(?:jt|juta|rb|ribu|k))?)$/i
  );
  if (!match) return null;

  const symbol = match[1].toUpperCase();
  if (!/^[A-Z]{2,10}$/.test(symbol)) return null;

  const quantity = parseDecimal(match[2]);
  const pricePerUnit = parsePositiveAmount(match[3]);
  if (!quantity || !pricePerUnit) return null;

  return {
    assetType: "CRYPTO",
    symbol,
    displayName: symbol,
    quantity,
    unit: "coin",
    pricePerUnit
  };
};

const parseSimpleAssetAdd = (text: string): ParsedAddAsset | null => {
  const directAmountMatch = text.match(
    /^(?:tambah|catat|punya)\s+(tabungan|cash|kas|deposito)\s+([\d.,]+(?:\s*(?:jt|juta|rb|ribu|k))?)$/i
  );
  if (directAmountMatch) {
    const rawType = directAmountMatch[1].toLowerCase();
    const price = parsePositiveAmount(directAmountMatch[2]);
    if (!price) return null;

    const directTypeMap: Record<string, ParsedAddAsset> = {
      tabungan: {
        assetType: "OTHER",
        symbol: "TABUNGAN",
        displayName: "Tabungan",
        quantity: 1,
        unit: "unit",
        pricePerUnit: price
      },
      cash: {
        assetType: "OTHER",
        symbol: "CASH",
        displayName: "Cash",
        quantity: 1,
        unit: "unit",
        pricePerUnit: price
      },
      kas: {
        assetType: "OTHER",
        symbol: "KAS",
        displayName: "Kas",
        quantity: 1,
        unit: "unit",
        pricePerUnit: price
      },
      deposito: {
        assetType: "DEPOSIT",
        symbol: "DEPOSITO",
        displayName: "Deposito",
        quantity: 1,
        unit: "unit",
        pricePerUnit: price
      }
    };

    return directTypeMap[rawType] ?? null;
  }

  const match = text.match(
    /^(?:tambah|catat|punya)\s+(tabungan|cash|kas|reksa dana|reksadana|deposito|properti|bisnis)(?:\s+(.+?))?\s+(?:senilai|sebesar|harga|nilai)\s+([\d.,]+(?:\s*(?:jt|juta|rb|ribu|k))?)$/i
  );
  if (!match) return null;

  const rawType = match[1].toLowerCase();
  const defaultNameMap: Record<string, string> = {
    tabungan: "Tabungan",
    cash: "Cash",
    kas: "Kas",
    "reksa dana": "Reksa Dana",
    reksadana: "Reksa Dana",
    deposito: "Deposito",
    properti: "Properti",
    bisnis: "Bisnis"
  };
  const name = normalizeSpaces(match[2] ?? defaultNameMap[rawType] ?? "Aset");
  const price = parsePositiveAmount(match[3]);
  if (!name || !price) return null;

  const typeMap: Record<string, PortfolioAssetType> = {
    tabungan: "OTHER",
    cash: "OTHER",
    kas: "OTHER",
    "reksa dana": "MUTUAL_FUND",
    reksadana: "MUTUAL_FUND",
    deposito: "DEPOSIT",
    properti: "PROPERTY",
    bisnis: "BUSINESS"
  };

  return {
    assetType: typeMap[rawType] ?? "OTHER",
    symbol: name.toUpperCase().slice(0, 24),
    displayName: name,
    quantity: 1,
    unit: "unit",
    pricePerUnit: price
  };
};

const parseAddAssetCommand = (text: string): ParsedAddAsset | null =>
  parseGoldAdd(text) ?? parseStockAdd(text) ?? parseCryptoAdd(text) ?? parseSimpleAssetAdd(text);

const getPortfolioModel = () => (prisma as { portfolioAsset?: any }).portfolioAsset;

const createOrUpdateAsset = async (params: { userId: string; input: ParsedAddAsset }) => {
  const portfolioModel = getPortfolioModel();
  if (!portfolioModel) {
    throw new Error("Model portfolio belum tersedia. Jalankan prisma generate.");
  }

  const existing = await portfolioModel.findUnique({
    where: {
      userId_assetType_symbol: {
        userId: params.userId,
        assetType: params.input.assetType,
        symbol: params.input.symbol
      }
    }
  });

  if (!existing) {
    return portfolioModel.create({
      data: {
        userId: params.userId,
        assetType: params.input.assetType,
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
    data: {
      quantity: mergedQty,
      averageBuyPrice: mergedAvgPrice
    }
  });
};

const buildPortfolioSummary = async (userId: string) => {
  const portfolioModel = getPortfolioModel();
  if (!portfolioModel) {
    return "Model portfolio belum aktif. Jalankan migrasi + `prisma generate` dulu.";
  }

  const assets = await portfolioModel.findMany({
    where: { userId },
    orderBy: [{ assetType: "asc" }, { displayName: "asc" }]
  });
  if (!assets.length) {
    return "Portfolio masih kosong. Contoh: `Tambah saham BBCA 10 lot harga 9000`.";
  }

  const snapshot = await getUserPortfolioValuation(userId);
  const topAssets = snapshot.items.slice(0, 5);
  const gainPrefix = snapshot.totalUnrealizedGain >= 0 ? "+" : "-";
  const gainValue = Math.abs(snapshot.totalUnrealizedGain);

  const lines = [
    "Ringkasan portfolio:",
    `- Nilai saat ini: ${formatMoney(snapshot.totalCurrentValue)}`,
    `- Modal tercatat: ${formatMoney(snapshot.totalBookValue)}`,
    `- Unrealized P/L: ${gainPrefix}${formatMoney(gainValue)}`,
    `- Aset likuid terdeteksi: ${formatMoney(snapshot.totalLiquidValue)}`,
    `- Rasio aset likuid: ${snapshot.liquidSharePercent.toFixed(1)}%`,
    `- Top holding: ${snapshot.topHoldingName ?? "-"}`,
    `- Konsentrasi aset terbesar: ${snapshot.largestAssetShare.toFixed(1)}%`,
    `- Tipe aset dominan: ${snapshot.dominantType ?? "-"} (${snapshot.dominantTypeShare.toFixed(1)}%)`,
    `- Risiko konsentrasi: ${snapshot.concentrationRisk}`,
    `- Sinyal rebalance: ${snapshot.rebalanceStatus}`,
    `- Cakupan harga market: ${snapshot.marketCoveragePercent.toFixed(1)}%`,
    `- Aset profit/rugi: ${snapshot.profitableAssetCount}/${snapshot.losingAssetCount}`,
    `- Skor diversifikasi: ${snapshot.diversificationScore.toFixed(1)}/100`
  ];

  const bestAsset = [...snapshot.items].sort((left, right) => right.unrealizedGain - left.unrealizedGain)[0];
  const worstAsset = [...snapshot.items].sort((left, right) => left.unrealizedGain - right.unrealizedGain)[0];
  if (bestAsset && bestAsset.unrealizedGain > 0) {
    lines.push(`- Aset paling cuan: ${bestAsset.displayName} (+${formatMoney(bestAsset.unrealizedGain)})`);
  }
  if (worstAsset && worstAsset.unrealizedGain < 0) {
    lines.push(`- Aset paling tertekan: ${worstAsset.displayName} (-${formatMoney(Math.abs(worstAsset.unrealizedGain))})`);
  }

  if (snapshot.typeBreakdown.length) {
    lines.push(
      `- Komposisi per tipe: ${snapshot.typeBreakdown
        .slice(0, 5)
        .map((item) => `${item.assetType} ${item.sharePercent.toFixed(1)}%`)
        .join(", ")}`
    );
  }

  if (snapshot.items.length) {
    lines.push("Komposisi terbesar:");
    for (const item of topAssets) {
      const percentage =
        snapshot.totalCurrentValue > 0
          ? (item.currentValue / snapshot.totalCurrentValue) * 100
          : 0;
      const itemGainPrefix = item.unrealizedGain >= 0 ? "+" : "-";
      const itemGainValue = Math.abs(item.unrealizedGain);
      const priceBasis =
        item.pricingMode === "market"
          ? `harga pasar ${formatMoney(item.currentPrice)}`
          : `harga buku ${formatMoney(item.averageBuyPrice)}`;
      lines.push(
        `- ${item.displayName}: ${formatMoney(item.currentValue)} (${percentage.toFixed(1)}%) | ${priceBasis} | P/L ${itemGainPrefix}${formatMoney(itemGainValue)}`
      );
    }
  }

  if (snapshot.bookFallbackCount > 0) {
    lines.push(
      `${snapshot.bookFallbackCount} aset masih dinilai pakai harga buku karena harga market belum tersedia.`
    );
  }

  return lines.join("\n");
};

const buildPortfolioPerformanceReply = async (userId: string) => {
  const snapshot = await getUserPortfolioValuation(userId);
  if (!snapshot.items.length) {
    return "Portfolio masih kosong. Contoh: `Tambah saham BBCA 10 lot harga 9000`.";
  }

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

const buildPortfolioDiversificationReply = async (userId: string) => {
  const snapshot = await getUserPortfolioValuation(userId);
  if (!snapshot.items.length) {
    return "Portfolio masih kosong. Contoh: `Tambah saham BBCA 10 lot harga 9000`.";
  }

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

const buildPortfolioRiskReply = async (userId: string) => {
  const snapshot = await getUserPortfolioValuation(userId);
  if (!snapshot.items.length) {
    return "Portfolio masih kosong. Contoh: `Tambah saham BBCA 10 lot harga 9000`.";
  }

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
    for (const reason of snapshot.rebalanceReasons.slice(0, 3)) {
      lines.push(`- ${reason}`);
    }
  }

  if (snapshot.rebalanceStatus === "ACTION") {
    lines.push(
      "Saran: kurangi dominasi aset terbesar, tambah tipe aset lain, dan jaga buffer aset likuid minimal 10-20%."
    );
  } else if (snapshot.rebalanceStatus === "WATCH") {
    lines.push(
      "Saran: portfolio belum gawat, tapi komposisinya perlu dipantau supaya tidak makin terkonsentrasi."
    );
  } else {
    lines.push("Saran: komposisi portfolio relatif sehat untuk ukuran diversifikasi dasar saat ini.");
  }

  return lines.join("\n");
};

const buildPortfolioDominanceReply = async (userId: string) => {
  const snapshot = await getUserPortfolioValuation(userId);
  if (!snapshot.items.length) {
    return "Portfolio masih kosong. Contoh: `Tambah saham BBCA 10 lot harga 9000`.";
  }

  const biggestAsset = snapshot.items[0];
  const biggestType = snapshot.typeBreakdown[0];
  const lines = [
    "Aset dominan portfolio kamu:",
    `- Holding terbesar: ${biggestAsset.displayName} (${snapshot.largestAssetShare.toFixed(1)}%)`,
    `- Tipe terbesar: ${biggestType?.assetType ?? "-"} (${snapshot.dominantTypeShare.toFixed(1)}%)`,
    `- Risiko konsentrasi: ${snapshot.concentrationRisk}`,
    `- Status rebalance: ${snapshot.rebalanceStatus}`
  ];

  if (snapshot.rebalanceReasons.length) {
    lines.push(`- Alasan utama: ${snapshot.rebalanceReasons[0]}`);
  }

  return lines.join("\n");
};

export const tryHandlePortfolioCommand = async (params: { userId: string; text: string }) => {
  const text = normalizeSpaces(params.text);
  const portfolioModelReady = Boolean(getPortfolioModel());
  if (
    /^(portfolio|portofolio|aset investasi|lihat portfolio|lihat portofolio|portfolio aku|portofolio aku|aset aku|nilai aset|komposisi aset)\b/i.test(
      text
    )
  ) {
    if (!portfolioModelReady) {
      return {
        handled: true as const,
        replyText: "Fitur portfolio butuh migrasi DB + `prisma generate` sebelum dipakai."
      };
    }
    const replyText = await buildPortfolioSummary(params.userId);
    return { handled: true as const, replyText };
  }

  if (
    /\b(risiko portfolio|risiko portofolio|portfolio .* aman|portofolio .* aman|perlu rebalance|rebalance gak|rebalance portfolio|portfolio terlalu numpuk|portofolio terlalu numpuk|komposisi portfolio .* aman|komposisi portofolio .* aman)\b/i.test(
      text
    )
  ) {
    if (!portfolioModelReady) {
      return {
        handled: true as const,
        replyText: "Fitur portfolio butuh migrasi DB + `prisma generate` sebelum dipakai."
      };
    }
    const replyText = await buildPortfolioRiskReply(params.userId);
    return { handled: true as const, replyText };
  }

  if (
    /\b(aset paling cuan|aset paling rugi|profit portfolio|rugi portfolio|performa portfolio|portfolio cuan|portfolio rugi)\b/i.test(
      text
    )
  ) {
    if (!portfolioModelReady) {
      return {
        handled: true as const,
        replyText: "Fitur portfolio butuh migrasi DB + `prisma generate` sebelum dipakai."
      };
    }
    const replyText = await buildPortfolioPerformanceReply(params.userId);
    return { handled: true as const, replyText };
  }

  if (
    /\b(diversifikasi portfolio|diversifikasi portofolio|portfolio terdiversifikasi|portofolio terdiversifikasi|portfolio tersebar|portofolio tersebar)\b/i.test(
      text
    )
  ) {
    if (!portfolioModelReady) {
      return {
        handled: true as const,
        replyText: "Fitur portfolio butuh migrasi DB + `prisma generate` sebelum dipakai."
      };
    }
    const replyText = await buildPortfolioDiversificationReply(params.userId);
    return { handled: true as const, replyText };
  }

  if (
    /\b(aset paling dominan|holding terbesar|aset terbesar|portfolio paling besar di mana|portfolio paling dominan|aset yang paling numpuk)\b/i.test(
      text
    )
  ) {
    if (!portfolioModelReady) {
      return {
        handled: true as const,
        replyText: "Fitur portfolio butuh migrasi DB + `prisma generate` sebelum dipakai."
      };
    }
    const replyText = await buildPortfolioDominanceReply(params.userId);
    return { handled: true as const, replyText };
  }

  const addCommand = parseAddAssetCommand(text);
  if (!addCommand) return { handled: false as const };
  if (!portfolioModelReady) {
    return {
      handled: true as const,
      replyText: "Fitur portfolio butuh migrasi DB + `prisma generate` sebelum dipakai."
    };
  }

  const saved = await createOrUpdateAsset({
    userId: params.userId,
    input: addCommand
  });

  return {
    handled: true as const,
    replyText: [
      `Aset berhasil dicatat: ${saved.displayName}`,
      `- Qty: ${toNumber(saved.quantity).toFixed(4)} ${saved.unit}`,
      `- Harga rata-rata: ${formatMoney(toNumber(saved.averageBuyPrice))}`,
      "Ketik `portfolio aku` untuk lihat nilai aset dan komposisinya."
    ].join("\n")
  };
};
