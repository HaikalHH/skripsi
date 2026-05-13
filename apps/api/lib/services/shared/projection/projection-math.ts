export const formatDurationFromMonths = (months: number | null) => {
  if (months === null || !Number.isFinite(months)) return "belum terestimasi";
  if (months <= 0) return "sudah tercapai";

  const wholeMonths = Math.floor(months);
  const remainingDays = Math.round((months - wholeMonths) * 30);

  if (wholeMonths <= 0) {
    return `${Math.max(1, remainingDays)} hari`;
  }

  if (remainingDays === 0) {
    return `${wholeMonths} bulan`;
  }

  return `${wholeMonths} bulan ${remainingDays} hari`;
};
