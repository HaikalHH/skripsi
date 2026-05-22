export {
  HAVE_EXPENSE_DATA_STRATEGY,
  HELP_CALCULATE_STRATEGY
} from "@/lib/services/onboarding/flow/shared/questions/answer-recognition";

export {
  getSessionNormalizedValue,
  hasWholePhrase,
  isCanonicalWaPhone,
  isReadyCommand,
  isSkipChoice,
  latestSessionForQuestion,
  normalizeText,
  normalizeToken,
  parseAddMoreAnswer,
  parseBooleanAnswer,
  parseDecimalInput,
  parseDecimalInputPreservingRange,
  parsePhoneInput,
  type GuidedOtherExpenseAnswer,
  type GuidedOtherExpenseItem,
  type GuidedOtherExpenseStage,
  type MoneyRangeAnswer,
  type NumericRangeAnswer,
  type SessionAnswerValue
} from "@/lib/services/onboarding/flow/shared/answers/common-input";

export {
  hasMixedNoneAssetSelection,
  parseAssetSelection,
  parseAssetSelectionConflict,
  parseAssetSelections,
  parseBudgetMode,
  parseEmploymentTypes,
  parseGoalAllocationMode,
  parseGoalExpenseStrategy,
  parseGoalSelection,
  parseGoalSelectionConflict,
  parseGoalSelections,
  parseGoldAssetBrand,
  parseGoldAssetKarat,
  parseGoldAssetPlatform,
  parseGoldAssetType,
  parseMultiChoiceInput,
  parsePersonalizationChoice,
  validateAssetSelections,
  validateExclusiveOption,
  validateGoalSelections,
  type ExclusiveOptionValidation
} from "@/lib/services/onboarding/flow/shared/answers/choice-parsers";

export {
  getMoneyAnswerLowerBound,
  getNumericAnswerMidpoint,
  isMoneyRangeAnswer,
  isNumericRangeAnswer,
  parseAssetQuantityInput,
  parseAssetFreeText,
  parseDayOfMonth,
  parseGuidedOtherExpenseCategoryName,
  parseGuidedOtherExpenseInput,
  parseMoneyInput,
  parseMoneyInputPreservingRange,
  parseStockSymbolInput
} from "@/lib/services/onboarding/flow/shared/answers/value-parsers";

export {
  getGoalTargetAnswerFromStoredValue,
  isStoredGoalTargetAnswer,
  looksLikeGoalTargetDateInput,
  parseMonthYearInput,
  parseOptionalGoalTargetDate,
  type GoalTargetEvaluationStatus,
  type GoalTargetUserDecision,
  type MonthYearTargetAnswer,
  type StoredGoalTargetAnswer
} from "@/lib/services/onboarding/flow/shared/answers/goal-target-date-parser";

export * from "@/lib/services/onboarding/flow/02-income/parser/income-parser";
export * from "@/lib/services/onboarding/flow/03-expenses/parser/expense-parser";
export * from "@/lib/services/onboarding/flow/04-goal-planning/parser/goal-parser";
export * from "@/lib/services/onboarding/flow/05-assets/parser/asset-parser";
