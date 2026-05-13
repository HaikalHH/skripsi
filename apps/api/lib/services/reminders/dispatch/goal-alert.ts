import { formatMoney } from "@/lib/services/shared/money";

export const buildGoalReachedAlertText = (goalStatus: {
  targetAmount: number;
  currentProgress: number;
}) => {
  if (goalStatus.targetAmount <= 0) return null;
  if (goalStatus.currentProgress < goalStatus.targetAmount) return null;
  return `Target tabungan tercapai: ${formatMoney(goalStatus.currentProgress)} dari target ${formatMoney(goalStatus.targetAmount)}.`;
};
