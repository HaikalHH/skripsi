export const calculateDiversificationScore = (shares: number[]) => {
  if (!shares.length) return 0;
  const normalizedShares = shares.filter((share) => share > 0).map((share) => share / 100);
  if (!normalizedShares.length) return 0;
  const herfindahlIndex = normalizedShares.reduce((sum, share) => sum + share ** 2, 0);
  const effectiveAssetCount = herfindahlIndex > 0 ? 1 / herfindahlIndex : 0;
  return Number(
    Math.max(0, Math.min(100, (effectiveAssetCount / normalizedShares.length) * 100)).toFixed(1)
  );
};

export const resolveRebalanceSignal = (params: {
  largestAssetShare: number;
  dominantTypeShare: number;
  liquidSharePercent: number;
  diversificationScore: number;
}) => {
  const reasons: string[] = [];

  if (params.largestAssetShare >= 60) {
    reasons.push("satu aset sudah mendominasi lebih dari 60% portfolio");
  } else if (params.largestAssetShare >= 40) {
    reasons.push("aset terbesar mulai terlalu dominan");
  }

  if (params.dominantTypeShare >= 70) {
    reasons.push("satu tipe aset mendominasi lebih dari 70%");
  } else if (params.dominantTypeShare >= 50) {
    reasons.push("komposisi tipe aset masih cukup terkonsentrasi");
  }

  if (params.liquidSharePercent < 10) {
    reasons.push("porsi aset likuid masih tipis");
  } else if (params.liquidSharePercent > 75) {
    reasons.push("aset likuid terlalu besar dibanding aset bertumbuh");
  }

  if (params.diversificationScore < 45) {
    reasons.push("diversifikasi masih rendah");
  }

  return {
    rebalanceStatus:
      params.largestAssetShare >= 60 ||
      params.dominantTypeShare >= 70 ||
      params.liquidSharePercent < 10
        ? "ACTION"
        : reasons.length
          ? "WATCH"
          : "HEALTHY",
    reasons
  } as const;
};
