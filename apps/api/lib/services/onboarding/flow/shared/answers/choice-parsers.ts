import {
  AssetType,
  BudgetMode,
  EmploymentType,
  FinancialGoalType,
  GoalExecutionMode
} from "@prisma/client";
import {
  ASSET_NONE_VALUE,
  ASSET_OPTIONS,
  GOAL_NONE_VALUE,
  GOAL_OPTIONS
} from "@/lib/services/onboarding/flow/shared/questions/answer-options";
import {
  ASSET_INTENT_OPTIONS,
  BUDGET_MODE_INTENT_OPTIONS,
  EMPLOYMENT_INTENT_OPTIONS,
  GOAL_ALLOCATION_MODE_INTENT_OPTIONS,
  GOAL_EXPENSE_STRATEGY_INTENT_OPTIONS,
  GOAL_INTENT_OPTIONS,
  GOLD_BRAND_INTENT_OPTIONS,
  GOLD_KARAT_INTENT_OPTIONS,
  GOLD_PLATFORM_INTENT_OPTIONS,
  GOLD_TYPE_INTENT_OPTIONS,
  PERSONALIZATION_INTENT_OPTIONS
} from "@/lib/services/onboarding/flow/shared/questions/answer-recognition";
import type {
  AssetSelectionValue,
  GoldAssetBrandValue,
  GoldAssetKaratValue,
  GoldAssetPlatformValue,
  GoldAssetTypeValue,
  GoalExecutionModeValue,
  GoalExpenseStrategyValue,
  GoalSelectionValue
} from "@/lib/services/onboarding/flow/shared/questions/question-types";
import {
  hasWholePhrase,
  normalizeToken
} from "@/lib/services/onboarding/flow/shared/answers/common-input";
import {
  matchMultiSelectIntent,
  matchSingleSelectIntent,
  parseMultiChoiceInput as parseIndexedMultiChoiceInput
} from "@/lib/services/onboarding/flow/shared/intent/onboarding-intent-service";

export const parseEmploymentTypes = (raw: unknown): EmploymentType[] | null => {
  if (Array.isArray(raw)) {
    const values = raw
      .map((item) =>
        typeof item === "string"
          ? (matchSingleSelectIntent(item, EMPLOYMENT_INTENT_OPTIONS) as EmploymentType | null)
          : null
      )
      .filter((item): item is EmploymentType => Boolean(item));
    return values.length ? Array.from(new Set(values)) : null;
  }

  if (typeof raw !== "string") return null;
  const values = matchMultiSelectIntent(raw, EMPLOYMENT_INTENT_OPTIONS).filter(
    (item): item is EmploymentType => Boolean(item)
  );
  return values.length ? Array.from(new Set(values)) : null;
};

export const parseBudgetMode = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(raw, BUDGET_MODE_INTENT_OPTIONS) as BudgetMode | null)
    : null;

export const parseGoalSelection = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(raw, GOAL_INTENT_OPTIONS) as GoalSelectionValue | null)
    : null;

export type ExclusiveOptionValidation<T extends string> = {
  isValid: boolean;
  selectedOptions: T[];
  exclusiveOption: T;
  nonExclusiveOptions: T[];
};

export const validateExclusiveOption = <T extends string>(
  selectedOptions: T[],
  exclusiveOption: T
): ExclusiveOptionValidation<T> => {
  const uniqueValues = Array.from(new Set(selectedOptions));
  const nonExclusiveOptions = uniqueValues.filter((item) => item !== exclusiveOption);

  return {
    isValid: !uniqueValues.includes(exclusiveOption) || uniqueValues.length <= 1,
    selectedOptions: uniqueValues,
    exclusiveOption,
    nonExclusiveOptions
  };
};

export const parseMultiChoiceInput = (input: string, maxOption: number) =>
  parseIndexedMultiChoiceInput(input, maxOption);

const mapIndexedSelectionsToOptionValues = <T extends string>(
  raw: unknown,
  options: Array<{ value: T }>
): T[] => {
  if (typeof raw !== "string") return [];

  const indexedSelections = parseIndexedMultiChoiceInput(raw, options.length);
  if (!indexedSelections?.length) return [];

  return indexedSelections
    .map((selection) => options[selection - 1]?.value ?? null)
    .filter((value): value is T => Boolean(value));
};

const collectGoalSelections = (raw: unknown): GoalSelectionValue[] => {
  if (Array.isArray(raw)) {
    return raw
      .map((item) =>
        typeof item === "string"
          ? (matchSingleSelectIntent(item, GOAL_INTENT_OPTIONS) as GoalSelectionValue | null)
          : null
      )
      .filter((item): item is GoalSelectionValue => Boolean(item));
  }

  if (typeof raw !== "string") return [];
  const indexedSelections = mapIndexedSelectionsToOptionValues<GoalSelectionValue>(
    raw,
    GOAL_OPTIONS as Array<{ value: GoalSelectionValue }>
  );
  if (indexedSelections.length) return indexedSelections;
  return matchMultiSelectIntent(raw, GOAL_INTENT_OPTIONS).filter(
    (item): item is GoalSelectionValue => Boolean(item)
  );
};

export const validateGoalSelections = (raw: unknown) =>
  validateExclusiveOption(collectGoalSelections(raw), GOAL_NONE_VALUE);

export const parseGoalSelectionConflict = (raw: unknown) => {
  const validation = validateGoalSelections(raw);
  return validation.isValid ? null : validation;
};

export const parseGoalSelections = (raw: unknown): GoalSelectionValue[] | null => {
  const validation = validateGoalSelections(raw);
  if (!validation.selectedOptions.length) return null;
  return validation.selectedOptions;
};

export const parseGoalExpenseStrategy = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(
        raw,
        GOAL_EXPENSE_STRATEGY_INTENT_OPTIONS
      ) as GoalExpenseStrategyValue | null)
    : null;

export const parseGoalAllocationMode = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(
        raw,
        GOAL_ALLOCATION_MODE_INTENT_OPTIONS
      ) as GoalExecutionModeValue | null)
    : null;

export const parsePersonalizationChoice = (raw: unknown) => {
  if (typeof raw !== "string") return null;
  const matched = matchSingleSelectIntent(raw, PERSONALIZATION_INTENT_OPTIONS) as
    | "YES"
    | "NO"
    | null;
  if (matched === "YES") return true;
  if (matched === "NO") return false;
  return null;
};

export const parseAssetSelection = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(raw, ASSET_INTENT_OPTIONS) as AssetSelectionValue | null)
    : null;

const OPTIONAL_ASSET_SKIP_PHRASES = [
  "skip",
  "skip dulu",
  "lewati",
  "lewati dulu",
  "nanti",
  "nanti aja",
  "ga dulu",
  "gak dulu",
  "nggak dulu",
  "belum dulu",
  "nanti di dashboard",
  "dashboard aja"
] as const;

const isOptionalAssetSkip = (raw: unknown) =>
  typeof raw === "string" &&
  OPTIONAL_ASSET_SKIP_PHRASES.some((phrase) => hasWholePhrase(normalizeToken(raw), phrase));

const collectAssetSelections = (raw: unknown): AssetSelectionValue[] => {
  if (isOptionalAssetSkip(raw)) {
    return [ASSET_NONE_VALUE];
  }

  if (Array.isArray(raw)) {
    return raw
      .map((item) =>
        typeof item === "string"
          ? (matchSingleSelectIntent(item, ASSET_INTENT_OPTIONS) as AssetSelectionValue | null)
          : null
      )
      .filter((item): item is AssetSelectionValue => Boolean(item));
  }

  if (typeof raw !== "string") return [];
  const indexedSelections = mapIndexedSelectionsToOptionValues<AssetSelectionValue>(
    raw,
    ASSET_OPTIONS as Array<{ value: AssetSelectionValue }>
  );
  if (indexedSelections.length) return indexedSelections;
  return matchMultiSelectIntent(raw, ASSET_INTENT_OPTIONS).filter(
    (item): item is AssetSelectionValue => Boolean(item)
  );
};

export const validateAssetSelections = (raw: unknown) =>
  validateExclusiveOption(collectAssetSelections(raw), ASSET_NONE_VALUE);

export const parseAssetSelectionConflict = (raw: unknown) => {
  const validation = validateAssetSelections(raw);
  return validation.isValid ? null : validation;
};

export const hasMixedNoneAssetSelection = (raw: unknown): boolean =>
  !validateAssetSelections(raw).isValid;

export const parseAssetSelections = (raw: unknown): AssetSelectionValue[] | null => {
  const validation = validateAssetSelections(raw);
  if (!validation.isValid || !validation.selectedOptions.length) return null;
  return validation.selectedOptions;
};

export const parseGoldAssetType = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(raw, GOLD_TYPE_INTENT_OPTIONS) as GoldAssetTypeValue | null)
    : null;

export const parseGoldAssetBrand = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(raw, GOLD_BRAND_INTENT_OPTIONS) as GoldAssetBrandValue | null)
    : null;

export const parseGoldAssetKarat = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(raw, GOLD_KARAT_INTENT_OPTIONS) as GoldAssetKaratValue | null)
    : null;

export const parseGoldAssetPlatform = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(raw, GOLD_PLATFORM_INTENT_OPTIONS) as GoldAssetPlatformValue | null)
    : null;

export type {
  AssetSelectionValue,
  GoldAssetBrandValue,
  GoldAssetKaratValue,
  GoldAssetPlatformValue,
  GoldAssetTypeValue,
  GoalExecutionModeValue,
  GoalExpenseStrategyValue,
  GoalSelectionValue
};
