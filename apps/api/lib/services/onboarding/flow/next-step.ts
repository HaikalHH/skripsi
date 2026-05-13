import {
  BudgetMode,
  EmploymentType,
  OnboardingStep
} from "@prisma/client";
import {
  ASSET_NONE_VALUE,
  GOAL_NONE_VALUE
} from "@/lib/services/onboarding/flow/shared/questions/answer-options";
import type { OnboardingPromptContext } from "@/lib/services/onboarding/flow/shared/questions/question-types";
import {
  STEP_ACTIVE_INCOME_COUNT,
  STEP_ACTIVE_INCOME_CYCLE_CONFIRM
} from "@/lib/services/onboarding/flow/helpers/custom-step-keys";

const normalizeEmploymentTypeList = (
  employmentTypes: EmploymentType[] | EmploymentType | null | undefined
) =>
  Array.isArray(employmentTypes)
    ? employmentTypes
    : employmentTypes
      ? [employmentTypes]
      : [];

const needsActiveIncomeQuestion = (
  employmentTypes: EmploymentType[] | EmploymentType | null | undefined
) => {
  const normalizedEmploymentTypes = normalizeEmploymentTypeList(employmentTypes);
  if (normalizedEmploymentTypes.includes(EmploymentType.EMPLOYEE)) return false;
  return normalizedEmploymentTypes.some(
    (item) => item === EmploymentType.STUDENT || item === EmploymentType.OTHER
  );
};

const usesEstimatedIncome = (
  employmentTypes: EmploymentType[] | EmploymentType | null | undefined
) => {
  const normalizedEmploymentTypes = normalizeEmploymentTypeList(employmentTypes);
  if (normalizedEmploymentTypes.includes(EmploymentType.EMPLOYEE)) return false;
  if (
    normalizedEmploymentTypes.some(
      (item) => item === EmploymentType.STUDENT || item === EmploymentType.OTHER
    )
  ) {
    return false;
  }
  return true;
};

const getCompletionStep = (context: OnboardingPromptContext) =>
  context.needsPhoneVerification ? OnboardingStep.VERIFY_PHONE : OnboardingStep.SHOW_ANALYSIS;

const getPostGoalStep = (_context: OnboardingPromptContext) => OnboardingStep.ASK_BUDGET_MODE;

const getNextPersonalizationStep = (context: OnboardingPromptContext) => {
  if (context.pendingGoalStep) {
    return context.pendingGoalStep;
  }

  return getCompletionStep(context);
};

const getPostExpenseStep = (_context: OnboardingPromptContext) =>
  OnboardingStep.ASK_ASSET_SELECTION;

const getPostAssetStep = (context: OnboardingPromptContext) =>
  context.hasPersonalizationPending
    ? getNextPersonalizationStep(context)
    : getCompletionStep(context);

const getPostIncomeStep = (context: OnboardingPromptContext) => {
  if (context.budgetMode === BudgetMode.MANUAL_PLAN) return OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN;
  if (context.budgetMode === BudgetMode.GUIDED_PLAN) return OnboardingStep.ASK_GUIDED_EXPENSE_FOOD;
  if (context.hasExpenseDependentGoal && !context.expenseAvailable) {
    return OnboardingStep.ASK_GOAL_EXPENSE_STRATEGY;
  }
  return getPostExpenseStep(context);
};

export const getNextOnboardingStep = (
  currentStep: OnboardingStep,
  context: OnboardingPromptContext,
  answer: unknown
): OnboardingStep => {
  const goalSelections = Array.isArray(answer) ? answer : [answer];
  const assetSelections = Array.isArray(answer) ? answer : [answer];
  const hasGoalSelection = goalSelections.some((item) => item !== GOAL_NONE_VALUE && item !== null);
  const hasAssetSelection = assetSelections.some((item) => item !== ASSET_NONE_VALUE && item !== null);

  switch (currentStep) {
    case OnboardingStep.WAIT_REGISTER:
      return OnboardingStep.ASK_GOAL_SELECTION;
    case OnboardingStep.VERIFY_PHONE:
      return OnboardingStep.SHOW_ANALYSIS;
    case OnboardingStep.ASK_PRIMARY_GOAL:
    case OnboardingStep.ASK_GOAL_SELECTION:
      return !hasGoalSelection || goalSelections.every((item) => item === GOAL_NONE_VALUE)
        ? OnboardingStep.ASK_BUDGET_MODE
        : OnboardingStep.ASK_BUDGET_MODE;
    case OnboardingStep.ASK_GOAL_CUSTOM_NAME:
      return getNextPersonalizationStep(context);
    case OnboardingStep.ASK_GOAL_TARGET_AMOUNT:
      return getNextPersonalizationStep(context);
    case OnboardingStep.ASK_GOAL_TARGET_DATE:
      return getNextPersonalizationStep(context);
    case OnboardingStep.ASK_GOAL_ADD_MORE:
      return answer === true ? OnboardingStep.ASK_GOAL_SELECTION : getPostGoalStep(context);
    case OnboardingStep.ASK_GOAL_ALLOCATION_MODE:
      return getNextPersonalizationStep(context);
    case OnboardingStep.ASK_GOAL_PRIORITY_FOCUS:
      return getNextPersonalizationStep(context);
    case OnboardingStep.ASK_ASSET_SELECTION:
      if (!hasAssetSelection || assetSelections.every((item) => item === ASSET_NONE_VALUE)) {
        return getPostAssetStep(context);
      }
      return context.pendingAssetStep ?? OnboardingStep.ASK_ASSET_ADD_MORE;
    case OnboardingStep.ASK_ASSET_SAVINGS_NAME:
    case OnboardingStep.ASK_ASSET_SAVINGS_BALANCE:
    case OnboardingStep.ASK_ASSET_GOLD_TYPE:
    case OnboardingStep.ASK_ASSET_GOLD_BRAND:
    case OnboardingStep.ASK_ASSET_GOLD_NAME:
    case OnboardingStep.ASK_ASSET_GOLD_GRAMS:
    case OnboardingStep.ASK_ASSET_GOLD_KARAT:
    case OnboardingStep.ASK_ASSET_GOLD_PLATFORM:
    case OnboardingStep.ASK_ASSET_STOCK_SYMBOL:
    case OnboardingStep.ASK_ASSET_STOCK_LOTS:
    case OnboardingStep.ASK_ASSET_CRYPTO_SYMBOL:
    case OnboardingStep.ASK_ASSET_CRYPTO_QUANTITY:
    case OnboardingStep.ASK_ASSET_MUTUAL_FUND_SYMBOL:
    case OnboardingStep.ASK_ASSET_MUTUAL_FUND_UNITS:
    case OnboardingStep.ASK_ASSET_PROPERTY_NAME:
    case OnboardingStep.ASK_ASSET_PROPERTY_ESTIMATED_VALUE:
    case OnboardingStep.ASK_ASSET_NAME:
    case OnboardingStep.ASK_ASSET_ESTIMATED_VALUE:
      return context.pendingAssetStep ?? OnboardingStep.ASK_ASSET_ADD_MORE;
    case OnboardingStep.ASK_ASSET_ADD_MORE:
      return answer === true ? OnboardingStep.ASK_ASSET_SELECTION : getPostAssetStep(context);
    case OnboardingStep.ASK_PERSONALIZATION_CHOICE:
      return getNextPersonalizationStep(context);
    case OnboardingStep.ASK_BUDGET_MODE:
      return OnboardingStep.ASK_EMPLOYMENT_TYPES;
    case OnboardingStep.ASK_EMPLOYMENT_TYPES:
      if (needsActiveIncomeQuestion(context.employmentTypes)) {
        return OnboardingStep.ASK_HAS_ACTIVE_INCOME;
      }
      if (usesEstimatedIncome(context.employmentTypes)) {
        return OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME;
      }
      return STEP_ACTIVE_INCOME_COUNT;
    case OnboardingStep.ASK_HAS_ACTIVE_INCOME:
      return answer === true ? STEP_ACTIVE_INCOME_COUNT : OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME;
    case STEP_ACTIVE_INCOME_COUNT:
      return OnboardingStep.ASK_ACTIVE_INCOME;
    case OnboardingStep.ASK_ACTIVE_INCOME:
      return OnboardingStep.ASK_SALARY_DATE;
    case OnboardingStep.ASK_SALARY_DATE:
      if ((context.activeIncomeCount ?? 1) <= 1) return OnboardingStep.ASK_HAS_PASSIVE_INCOME;
      if (context.activeIncomeCycleStartDay) {
        return (context.activeIncomeAmountCount ?? 0) < (context.activeIncomeCount ?? 1)
          ? OnboardingStep.ASK_ACTIVE_INCOME
          : OnboardingStep.ASK_HAS_PASSIVE_INCOME;
      }
      if ((context.activeIncomePaydayCount ?? 0) >= (context.activeIncomeCount ?? 1)) {
        return OnboardingStep.ASK_HAS_PASSIVE_INCOME;
      }
      return STEP_ACTIVE_INCOME_CYCLE_CONFIRM;
    case STEP_ACTIVE_INCOME_CYCLE_CONFIRM:
      return (context.activeIncomeAmountCount ?? 0) < (context.activeIncomeCount ?? 1)
        ? OnboardingStep.ASK_ACTIVE_INCOME
        : OnboardingStep.ASK_HAS_PASSIVE_INCOME;
    case OnboardingStep.ASK_HAS_PASSIVE_INCOME:
      return answer === true ? OnboardingStep.ASK_PASSIVE_INCOME : getPostIncomeStep(context);
    case OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME:
      return OnboardingStep.ASK_SALARY_DATE;
    case OnboardingStep.ASK_PASSIVE_INCOME:
      return getPostIncomeStep(context);
    case OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN:
      return getPostExpenseStep(context);
    case OnboardingStep.ASK_GUIDED_EXPENSE_FOOD:
      return OnboardingStep.ASK_GUIDED_EXPENSE_TRANSPORT;
    case OnboardingStep.ASK_GUIDED_EXPENSE_TRANSPORT:
      return OnboardingStep.ASK_GUIDED_EXPENSE_BILLS;
    case OnboardingStep.ASK_GUIDED_EXPENSE_BILLS:
      return OnboardingStep.ASK_GUIDED_EXPENSE_ENTERTAINMENT;
    case OnboardingStep.ASK_GUIDED_EXPENSE_ENTERTAINMENT:
      return OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS;
    case OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS:
      if (answer && typeof answer === "object" && "kind" in answer) {
        const guidedAnswer = answer as Record<string, unknown>;
        if (guidedAnswer.kind === "presence") {
          return guidedAnswer.hasOtherExpense === true
            ? OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS
            : getPostExpenseStep(context);
        }

        if (guidedAnswer.kind === "category_name") {
          return OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS;
        }

        if (guidedAnswer.kind === "category_amount") {
          return OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS;
        }

        if (guidedAnswer.kind === "add_more") {
          return guidedAnswer.addMore === true
            ? OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS
            : getPostExpenseStep(context);
        }
      }

      return getPostExpenseStep(context);
    case OnboardingStep.ASK_GOAL_EXPENSE_STRATEGY:
      if (answer === "HELP_CALCULATE") return OnboardingStep.ASK_GUIDED_EXPENSE_FOOD;
      if (answer === "HAVE_DATA") return OnboardingStep.ASK_GOAL_EXPENSE_TOTAL;
      return getPostExpenseStep(context);
    case OnboardingStep.ASK_GOAL_EXPENSE_TOTAL:
      return getPostExpenseStep(context);
    case OnboardingStep.SHOW_ANALYSIS:
      return OnboardingStep.COMPLETED;
    case OnboardingStep.COMPLETED:
      return OnboardingStep.COMPLETED;
  }

  throw new Error(`Unsupported onboarding step: ${currentStep}`);
};
