import type {
  AssetType,
  BudgetMode,
  EmploymentType,
  FinancialGoalType,
  GoalExecutionMode,
  OnboardingQuestionKey,
  OnboardingStep
} from "@prisma/client";

export type OnboardingInputType =
  | "single_select"
  | "multi_select"
  | "money"
  | "integer"
  | "decimal"
  | "month"
  | "text";

export type OnboardingOption = {
  value: string;
  label: string;
};

export type GoalSelectionValue = FinancialGoalType | "NONE_YET";
export type GoalExpenseStrategyValue = "HELP_CALCULATE" | "HAVE_DATA" | "SKIP";
export type AssetSelectionValue = AssetType | "NONE";
export type GoalExecutionModeValue = GoalExecutionMode;
export type GoldAssetTypeValue = "BULLION" | "JEWELRY" | "DIGITAL";
export type GoldAssetBrandValue = "ANTAM" | "UBS" | "GALERI24" | "OTHER";
export type GoldAssetKaratValue = "24K" | "23K" | "22K" | "18K" | "17K";
export type GoldAssetPlatformValue = "PEGADAIAN" | "OTHER";
export type ActiveIncomeFrequencyMode = "SINGLE" | "MULTIPLE";

export type OnboardingPromptContext = {
  needsPhoneVerification: boolean;
  budgetMode: BudgetMode | null;
  employmentTypes: EmploymentType[];
  activeGoalCount?: number;
  selectedGoalTypes?: FinancialGoalType[];
  latestCustomGoalName?: string | null;
  goalExecutionMode?: GoalExecutionMode | null;
  priorityGoalType?: FinancialGoalType | null;
  hasChosenGoalExecutionMode?: boolean;
  hasChosenPriorityGoal?: boolean;
  hasPersonalizationPending?: boolean;
  pendingGoalStep?: OnboardingStep | null;
  currentGoalType: FinancialGoalType | null;
  pendingAssetStep?: OnboardingStep | null;
  currentAssetType: AssetType | null;
  currentGoldType?: GoldAssetTypeValue | null;
  expenseAvailable: boolean;
  hasExpenseDependentGoal: boolean;
  goalExpenseStrategy: GoalExpenseStrategyValue | null;
  activeIncomeMode?: ActiveIncomeFrequencyMode | null;
  activeIncomeCount?: number | null;
  activeIncomePaydays?: number[];
  activeIncomeAmountCount?: number;
  activeIncomePaydayCount?: number;
  activeIncomeLatestPayday?: number | null;
  activeIncomeCycleStartDay?: number | null;
  monthlyIncomeTotal: number | null;
  monthlyExpenseTotal: number | null;
  potentialMonthlySaving: number | null;
  guidedOtherExpenseStage?: "presence" | "category_name" | "category_amount" | "add_more";
  guidedOtherExpensePendingLabel?: string | null;
  guidedOtherExpenseItems?: Array<{
    label: string;
    amount: number;
  }>;
};

export type OnboardingPrompt = {
  stepKey: OnboardingStep;
  questionKey: OnboardingQuestionKey;
  title: string;
  body: string;
  chatBubbleBodies?: string[];
  inputType: OnboardingInputType;
  options?: OnboardingOption[];
  allowSkip?: boolean;
};
