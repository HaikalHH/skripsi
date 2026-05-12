import { formatDurationFromMonths } from "@/lib/services/shared/projection-math-service";

export const formatEta = (monthsRaw: number) => {
  if (!Number.isFinite(monthsRaw)) return "estimasi belum tersedia";
  if (monthsRaw <= 0) return "estimasi sudah tercapai";
  return `estimasi ${formatDurationFromMonths(monthsRaw)}`;
};
