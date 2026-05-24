import {
  AssetType,
  OnboardingQuestionKey,
  OnboardingStep,
  type OnboardingSession
} from "@prisma/client";
import type { GoldAssetTypeValue } from "@/lib/services/onboarding/flow/shared/questions/question-types";

const getConfirmedSessions = (sessions: OnboardingSession[]) =>
  sessions.filter((session) => session.isCompleted === true);

export const getCurrentAssetBatchSessions = (sessions: OnboardingSession[]) => {
  const confirmedSessions = getConfirmedSessions(sessions);
  const latestSelection = [...confirmedSessions]
    .reverse()
    .find((session) => session.questionKey === OnboardingQuestionKey.ASSET_SELECTION);

  if (!latestSelection) return confirmedSessions;

  const latestSelectionIndex = confirmedSessions.findIndex((session) => session.id === latestSelection.id);
  return latestSelectionIndex >= 0 ? confirmedSessions.slice(latestSelectionIndex) : confirmedSessions;
};

export const isFinalAssetStep = (context: {
  user: { onboardingStep: OnboardingStep };
  currentAssetType: AssetType | null;
  currentGoldType?: GoldAssetTypeValue | null;
}) => {
  if (context.user.onboardingStep === OnboardingStep.ASK_ASSET_SAVINGS_BALANCE) return true;
  if (context.user.onboardingStep === OnboardingStep.ASK_ASSET_STOCK_LOTS) return true;
  if (context.user.onboardingStep === OnboardingStep.ASK_ASSET_PROPERTY_ESTIMATED_VALUE) return true;
  if (
    context.user.onboardingStep === OnboardingStep.ASK_ASSET_ESTIMATED_VALUE &&
    (context.currentAssetType === AssetType.SAVINGS ||
      context.currentAssetType === AssetType.STOCK ||
      context.currentAssetType === AssetType.PROPERTY)
  ) {
    return true;
  }
  if (context.user.onboardingStep === OnboardingStep.ASK_ASSET_GOLD_KARAT) return true;
  if (context.user.onboardingStep === OnboardingStep.ASK_ASSET_GOLD_PLATFORM) return true;
  return (
    context.user.onboardingStep === OnboardingStep.ASK_ASSET_GOLD_GRAMS &&
    context.currentGoldType === "BULLION"
  );
};
