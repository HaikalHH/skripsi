import { OnboardingQuestionKey, type OnboardingSession } from "@prisma/client";
import {
  GOLD_BRAND_OPTIONS,
  GOLD_KARAT_OPTIONS,
  GOLD_PLATFORM_OPTIONS,
  GOLD_TYPE_OPTIONS
} from "@/lib/services/onboarding/flow/shared/questions/answer-options";
import type {
  GoldAssetBrandValue,
  GoldAssetKaratValue,
  GoldAssetPlatformValue,
  GoldAssetTypeValue
} from "@/lib/services/onboarding/flow/shared/questions/question-types";
import {
  getSessionNormalizedValue,
  latestSessionForQuestion
} from "@/lib/services/onboarding/flow/shared/answers/common-input";
import { getCurrentAssetBatchSessions } from "@/lib/services/onboarding/flow/05-assets/service/asset-state";

type AssetValuationSource = "MARKET_LIVE" | "NAV_DELAYED" | "MANUAL_USER";

const findOptionLabel = (options: Array<{ value: string; label: string }>, value: string) =>
  options.find((item) => item.value === value)?.label ?? value;

export const getGoldTypeLabel = (value: GoldAssetTypeValue | null | undefined) =>
  value ? findOptionLabel(GOLD_TYPE_OPTIONS, value) : "Emas";

export const getGoldBrandLabel = (value: GoldAssetBrandValue | null | undefined) =>
  value ? findOptionLabel(GOLD_BRAND_OPTIONS, value) : "Lainnya";

export const getGoldKaratLabel = (value: GoldAssetKaratValue | null | undefined) =>
  value ? findOptionLabel(GOLD_KARAT_OPTIONS, value) : "24K";

export const getGoldPlatformLabel = (value: GoldAssetPlatformValue | null | undefined) =>
  value ? findOptionLabel(GOLD_PLATFORM_OPTIONS, value) : "Lainnya";

export const getGoldPurityMultiplier = (value: GoldAssetKaratValue | null | undefined) => {
  switch (value) {
    case "24K":
      return 1;
    case "23K":
      return 23 / 24;
    case "22K":
      return 22 / 24;
    case "18K":
      return 18 / 24;
    case "17K":
      return 17 / 24;
    default:
      return 1;
  }
};

const getLatestBatchAnswerValue = <T>(
  sessions: OnboardingSession[],
  questionKey: OnboardingQuestionKey
) =>
  getSessionNormalizedValue<T>(
    latestSessionForQuestion(getCurrentAssetBatchSessions(sessions), questionKey)
  );

export const buildGoldAssetName = (context: {
  currentGoldType?: GoldAssetTypeValue | null;
  sessions: OnboardingSession[];
}) => {
  const goldType =
    context.currentGoldType ??
    getLatestBatchAnswerValue<GoldAssetTypeValue>(
      context.sessions,
      OnboardingQuestionKey.ASSET_GOLD_TYPE
    );
  if (goldType === "BULLION") {
    const brand = getLatestBatchAnswerValue<GoldAssetBrandValue>(
      context.sessions,
      OnboardingQuestionKey.ASSET_GOLD_BRAND
    );
    return `Emas batangan ${getGoldBrandLabel(brand)}`;
  }
  if (goldType === "JEWELRY") {
    const karat = getLatestBatchAnswerValue<GoldAssetKaratValue>(
      context.sessions,
      OnboardingQuestionKey.ASSET_GOLD_KARAT
    );
    return `Perhiasan emas ${getGoldKaratLabel(karat)}`;
  }
  if (goldType === "DIGITAL") {
    const platform = getLatestBatchAnswerValue<GoldAssetPlatformValue>(
      context.sessions,
      OnboardingQuestionKey.ASSET_GOLD_PLATFORM
    );
    return `Emas digital ${getGoldPlatformLabel(platform)}`;
  }
  return "Emas";
};

export const stringifyAssetNotes = (payload: Record<string, unknown>) => JSON.stringify(payload);

export const buildAssetValuationNotes = (
  valuationSource: AssetValuationSource,
  payload: Record<string, unknown> = {}
) =>
  stringifyAssetNotes({
    source: "onboarding",
    valuationSource,
    ...payload
  });

export const formatQuantityValue = (value: number) => {
  if (!Number.isFinite(value)) return String(value);
  const formatted = value.toFixed(8).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  return formatted === "-0" ? "0" : formatted;
};
