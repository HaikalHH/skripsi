import { AssetType, FinancialGoalType } from "@prisma/client";
import { GOAL_OPTIONS } from "./answer-options";
import type {
  GoldAssetTypeValue,
  OnboardingOption,
  OnboardingPromptContext
} from "./question-types";

export const goalLabel = (goalType: FinancialGoalType | null) => {
  switch (goalType) {
    case FinancialGoalType.EMERGENCY_FUND:
      return "Dana Darurat";
    case FinancialGoalType.HOUSE:
      return "Beli Rumah";
    case FinancialGoalType.VEHICLE:
      return "Beli Kendaraan";
    case FinancialGoalType.VACATION:
      return "Liburan";
    case FinancialGoalType.CUSTOM:
      return "Custom Target";
    default:
      return "Target Keuangan";
  }
};

export const assetLabel = (assetType: AssetType | null) => {
  switch (assetType) {
    case AssetType.SAVINGS:
      return "Tabungan";
    case AssetType.GOLD:
      return "Emas";
    case AssetType.STOCK:
      return "Saham";
    case AssetType.PROPERTY:
      return "Properti";
    default:
      return "Aset";
  }
};

export const goalSelectionLabel = (
  goalType: FinancialGoalType,
  latestCustomGoalName?: string | null
) => {
  if (goalType === FinancialGoalType.CUSTOM) {
    return latestCustomGoalName?.trim() || "Custom target";
  }

  return GOAL_OPTIONS.find((option) => option.value === goalType)?.label ?? goalLabel(goalType);
};

export const goldTypeLabel = (goldType: GoldAssetTypeValue | null | undefined) => {
  switch (goldType) {
    case "BULLION":
      return "emas batangan";
    case "JEWELRY":
      return "perhiasan emas";
    case "DIGITAL":
      return "emas digital";
    default:
      return "emas";
  }
};

export const buildGoalPriorityOptions = (context: OnboardingPromptContext): OnboardingOption[] =>
  (context.selectedGoalTypes ?? []).map((goalType) => ({
    value: goalType,
    label: goalSelectionLabel(goalType, context.latestCustomGoalName)
  }));
