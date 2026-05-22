import {
  AssetType,
  OnboardingQuestionKey,
  OnboardingStep,
  type OnboardingSession
} from "@prisma/client";
import {
  ASSET_NONE_VALUE,
  ASSET_OPTIONS
} from "@/lib/services/onboarding/flow/shared/questions/answer-options";
import type {
  AssetSelectionValue,
  GoldAssetTypeValue
} from "@/lib/services/onboarding/flow/shared/questions/question-types";
import {
  getSessionNormalizedValue,
  latestSessionForQuestion
} from "@/lib/services/onboarding/flow/shared/answers/common-input";
import { parseGoldAssetType } from "@/lib/services/onboarding/flow/shared/answers/choice-parsers";
import {
  getConfirmedSessions,
  normalizeStoredValues
} from "@/lib/services/onboarding/flow/helpers/session-values";

export type PendingAssetDetail = {
  step: OnboardingStep;
  assetType: AssetType;
  goldType?: GoldAssetTypeValue | null;
};

const ACTIVE_ONBOARDING_ASSET_TYPES = new Set(
  ASSET_OPTIONS.map((option) => option.value).filter((value) => value !== ASSET_NONE_VALUE)
);

const getLatestAssetSelectionSession = (sessions: OnboardingSession[]) =>
  [...getConfirmedSessions(sessions)]
    .reverse()
    .find((item) => item.questionKey === OnboardingQuestionKey.ASSET_SELECTION) ?? null;

const getCurrentAssetBatchSessions = (sessions: OnboardingSession[]) => {
  const confirmedSessions = getConfirmedSessions(sessions);
  const latestSelection = getLatestAssetSelectionSession(confirmedSessions);
  if (!latestSelection) return confirmedSessions;

  const latestSelectionIndex = confirmedSessions.findIndex((item) => item.id === latestSelection.id);
  return latestSelectionIndex >= 0
    ? confirmedSessions.slice(latestSelectionIndex)
    : confirmedSessions;
};

const getCurrentBatchSelectedAssetTypes = (sessions: OnboardingSession[]) => {
  const latestSelection = getLatestAssetSelectionSession(sessions);
  if (!latestSelection) return [] as AssetType[];

  return normalizeStoredValues(
    getSessionNormalizedValue<AssetSelectionValue | AssetSelectionValue[]>(latestSelection)
  ).filter(
    (value): value is AssetType =>
      Boolean(value) && value !== ASSET_NONE_VALUE && ACTIVE_ONBOARDING_ASSET_TYPES.has(value)
  );
};

const getQuestionValueCount = (
  sessions: OnboardingSession[],
  questionKeys: OnboardingQuestionKey[]
) => sessions.filter((item) => questionKeys.includes(item.questionKey)).length;

const getGoldTypeAnswers = (sessions: OnboardingSession[]) =>
  sessions
    .flatMap((item) => {
      if (item.questionKey === OnboardingQuestionKey.ASSET_GOLD_TYPE) {
        return normalizeStoredValues(
          getSessionNormalizedValue<GoldAssetTypeValue | GoldAssetTypeValue[]>(item)
        );
      }

      if (item.questionKey === OnboardingQuestionKey.ASSET_GOLD_NAME) {
        const rawValue =
          getSessionNormalizedValue<string>(item) ??
          (typeof item.rawAnswerJson === "string" ? item.rawAnswerJson : null);
        const parsed = rawValue ? parseGoldAssetType(rawValue) : null;
        return parsed ? [parsed] : [];
      }

      return [];
    })
    .filter((value): value is GoldAssetTypeValue => Boolean(value));

const getAssetDetailStepMap = (assetType: AssetType) => {
  switch (assetType) {
    case AssetType.SAVINGS:
      return {
        nameStep: OnboardingStep.ASK_ASSET_SAVINGS_NAME,
        nameKeys: [OnboardingQuestionKey.ASSET_SAVINGS_NAME],
        valueStep: OnboardingStep.ASK_ASSET_SAVINGS_BALANCE,
        valueKeys: [OnboardingQuestionKey.ASSET_SAVINGS_BALANCE]
      };
    case AssetType.STOCK:
      return {
        nameStep: OnboardingStep.ASK_ASSET_STOCK_SYMBOL,
        nameKeys: [OnboardingQuestionKey.ASSET_STOCK_SYMBOL],
        valueStep: OnboardingStep.ASK_ASSET_STOCK_LOTS,
        valueKeys: [OnboardingQuestionKey.ASSET_STOCK_LOTS]
      };
    case AssetType.PROPERTY:
      return {
        nameStep: OnboardingStep.ASK_ASSET_PROPERTY_NAME,
        nameKeys: [OnboardingQuestionKey.ASSET_PROPERTY_NAME],
        valueStep: OnboardingStep.ASK_ASSET_PROPERTY_ESTIMATED_VALUE,
        valueKeys: [OnboardingQuestionKey.ASSET_PROPERTY_ESTIMATED_VALUE]
      };
    default:
      return {
        nameStep: OnboardingStep.ASK_ASSET_NAME,
        nameKeys: [OnboardingQuestionKey.ASSET_NAME],
        valueStep: OnboardingStep.ASK_ASSET_ESTIMATED_VALUE,
        valueKeys: [OnboardingQuestionKey.ASSET_ESTIMATED_VALUE]
      };
  }
};

const getAssetTypeFromQuestionKey = (questionKey: OnboardingQuestionKey): AssetType | null => {
  switch (questionKey) {
    case OnboardingQuestionKey.ASSET_SAVINGS_NAME:
    case OnboardingQuestionKey.ASSET_SAVINGS_BALANCE:
      return AssetType.SAVINGS;
    case OnboardingQuestionKey.ASSET_GOLD_TYPE:
    case OnboardingQuestionKey.ASSET_GOLD_NAME:
    case OnboardingQuestionKey.ASSET_GOLD_BRAND:
    case OnboardingQuestionKey.ASSET_GOLD_GRAMS:
    case OnboardingQuestionKey.ASSET_GOLD_KARAT:
    case OnboardingQuestionKey.ASSET_GOLD_PLATFORM:
      return AssetType.GOLD;
    case OnboardingQuestionKey.ASSET_STOCK_SYMBOL:
    case OnboardingQuestionKey.ASSET_STOCK_LOTS:
      return AssetType.STOCK;
    case OnboardingQuestionKey.ASSET_PROPERTY_NAME:
    case OnboardingQuestionKey.ASSET_PROPERTY_ESTIMATED_VALUE:
      return AssetType.PROPERTY;
    default:
      return null;
  }
};

export const getPendingAssetDetail = (sessions: OnboardingSession[]): PendingAssetDetail | null => {
  const currentBatchSessions = getCurrentAssetBatchSessions(sessions);
  const selectedAssets = getCurrentBatchSelectedAssetTypes(currentBatchSessions);
  const goldTypeAnswers = getGoldTypeAnswers(currentBatchSessions);
  const genericAssetNameCount = {
    value: getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_NAME])
  };
  const genericAssetValueCount = {
    value: getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_ESTIMATED_VALUE])
  };

  let remainingGoldTypes = goldTypeAnswers.length;
  let remainingGoldBrands = getQuestionValueCount(currentBatchSessions, [
    OnboardingQuestionKey.ASSET_GOLD_BRAND
  ]);
  let remainingGoldGrams = getQuestionValueCount(currentBatchSessions, [
    OnboardingQuestionKey.ASSET_GOLD_GRAMS
  ]);
  let remainingGoldKarats = getQuestionValueCount(currentBatchSessions, [
    OnboardingQuestionKey.ASSET_GOLD_KARAT
  ]);
  let remainingGoldPlatforms = getQuestionValueCount(currentBatchSessions, [
    OnboardingQuestionKey.ASSET_GOLD_PLATFORM
  ]);
  const remainingSpecificNameCounts = new Map<AssetType, number>([
    [AssetType.SAVINGS, getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_SAVINGS_NAME])],
    [AssetType.STOCK, getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_STOCK_SYMBOL])],
    [AssetType.PROPERTY, getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_PROPERTY_NAME])]
  ]);
  const remainingSpecificValueCounts = new Map<AssetType, number>([
    [AssetType.SAVINGS, getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_SAVINGS_BALANCE])],
    [AssetType.STOCK, getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_STOCK_LOTS])],
    [AssetType.PROPERTY, getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_PROPERTY_ESTIMATED_VALUE])]
  ]);

  const consumeDetailAnswer = (params: {
    assetType: AssetType;
    countMap: Map<AssetType, number>;
    genericCount: { value: number };
  }) => {
    const specificCount = params.countMap.get(params.assetType) ?? 0;
    if (specificCount > 0) {
      params.countMap.set(params.assetType, specificCount - 1);
      return "specific";
    }

    if (params.genericCount.value > 0) {
      params.genericCount.value -= 1;
      return "generic";
    }

    return null;
  };

  for (const assetType of selectedAssets) {
    if (assetType === AssetType.GOLD) {
      if (remainingGoldTypes <= 0) {
        return { step: OnboardingStep.ASK_ASSET_GOLD_TYPE, assetType, goldType: null };
      }
      const goldType = goldTypeAnswers[goldTypeAnswers.length - remainingGoldTypes] ?? null;
      remainingGoldTypes -= 1;

      if (goldType === "BULLION") {
        if (remainingGoldBrands <= 0) {
          return { step: OnboardingStep.ASK_ASSET_GOLD_BRAND, assetType, goldType };
        }
        remainingGoldBrands -= 1;

        if (remainingGoldGrams <= 0) {
          return { step: OnboardingStep.ASK_ASSET_GOLD_GRAMS, assetType, goldType };
        }
        remainingGoldGrams -= 1;
        continue;
      }

      if (goldType === "JEWELRY") {
        if (remainingGoldGrams <= 0) {
          return { step: OnboardingStep.ASK_ASSET_GOLD_GRAMS, assetType, goldType };
        }
        remainingGoldGrams -= 1;

        if (remainingGoldKarats <= 0) {
          return { step: OnboardingStep.ASK_ASSET_GOLD_KARAT, assetType, goldType };
        }
        remainingGoldKarats -= 1;
        continue;
      }

      if (goldType === "DIGITAL") {
        if (remainingGoldGrams <= 0) {
          return { step: OnboardingStep.ASK_ASSET_GOLD_GRAMS, assetType, goldType };
        }
        remainingGoldGrams -= 1;

        if (remainingGoldPlatforms <= 0) {
          return { step: OnboardingStep.ASK_ASSET_GOLD_PLATFORM, assetType, goldType };
        }
        remainingGoldPlatforms -= 1;
        continue;
      }

      return { step: OnboardingStep.ASK_ASSET_GOLD_TYPE, assetType, goldType: null };
    }

    const detailMap = getAssetDetailStepMap(assetType);
    if (
      !consumeDetailAnswer({
        assetType,
        countMap: remainingSpecificNameCounts,
        genericCount: genericAssetNameCount
      })
    ) {
      return { step: detailMap.nameStep, assetType };
    }

    const valueAnswerSource = consumeDetailAnswer({
      assetType,
      countMap: remainingSpecificValueCounts,
      genericCount: genericAssetValueCount
    });
    if (!valueAnswerSource) {
      return { step: detailMap.valueStep, assetType };
    }
  }

  return null;
};

export const getCurrentAssetType = (
  sessions: OnboardingSession[],
  currentStep?: OnboardingStep | null
) => {
  if (currentStep === OnboardingStep.ASK_ASSET_ESTIMATED_VALUE) {
    const latestAssetDetailSession = [...getConfirmedSessions(sessions)]
      .reverse()
      .find((session) => getAssetTypeFromQuestionKey(session.questionKey));
    const assetTypeFromLatestStep = latestAssetDetailSession
      ? getAssetTypeFromQuestionKey(latestAssetDetailSession.questionKey)
      : null;
    if (assetTypeFromLatestStep) return assetTypeFromLatestStep;
  }

  const pendingDetail = getPendingAssetDetail(sessions);
  if (pendingDetail) return pendingDetail.assetType;

  const latestSelection = latestSessionForQuestion(
    getConfirmedSessions(sessions),
    OnboardingQuestionKey.ASSET_SELECTION
  );
  const values = normalizeStoredValues(
    getSessionNormalizedValue<AssetSelectionValue | AssetSelectionValue[]>(latestSelection)
  ).filter(
    (item): item is AssetType =>
      Boolean(item) && item !== ASSET_NONE_VALUE && ACTIVE_ONBOARDING_ASSET_TYPES.has(item)
  );
  return values.at(-1) ?? null;
};

export const getCurrentGoldType = (sessions: OnboardingSession[]) => {
  const pendingDetail = getPendingAssetDetail(sessions);
  if (pendingDetail?.assetType === AssetType.GOLD) {
    return pendingDetail.goldType ?? null;
  }

  return getGoldTypeAnswers(getConfirmedSessions(sessions)).at(-1) ?? null;
};

export const getLatestAssetName = (
  sessions: OnboardingSession[],
  questionKey: OnboardingQuestionKey
) =>
  getSessionNormalizedValue<string>(
    latestSessionForQuestion(getConfirmedSessions(sessions), questionKey)
  );
