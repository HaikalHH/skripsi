import {
  BudgetMode,
  EmploymentType,
  FinancialGoalType,
  GoalExecutionMode,
  OnboardingStep
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  getNextOnboardingStep,
  type OnboardingPromptContext
} from "@/lib/services/onboarding/onboarding-flow-service";

const baseContext: OnboardingPromptContext = {
  needsPhoneVerification: false,
  budgetMode: null,
  employmentTypes: [],
  activeGoalCount: 0,
  selectedGoalTypes: [],
  latestCustomGoalName: null,
  goalExecutionMode: null,
  priorityGoalType: null,
  hasChosenGoalExecutionMode: false,
  hasChosenPriorityGoal: false,
  hasFinancialFreedomTargetPreference: false,
  hasPersonalizationPending: false,
  pendingGoalStep: null,
  currentGoalType: null,
  pendingAssetStep: null,
  currentAssetType: null,
  currentGoldType: null,
  hasCurrentMutualFundUnits: false,
  expenseAvailable: false,
  hasExpenseDependentGoal: false,
  hasFinancialFreedomGoal: false,
  goalExpenseStrategy: null,
  monthlyIncomeTotal: null,
  monthlyExpenseTotal: null,
  potentialMonthlySaving: null,
  guidedOtherExpenseStage: "presence",
  guidedOtherExpensePendingLabel: null,
  guidedOtherExpenseItems: [],
  financialFreedomEtaMonths: null,
  financialFreedomTargetAmount: null,
  financialFreedomMonthlyAllocation: null,
  financialFreedomProjectionBasis: null,
  financialFreedomPriorityGoalName: null,
  financialFreedomStartLabel: null,
  financialFreedomProjectedMonthlyContribution: null,
  financialFreedomSafeWithdrawalRate: null,
  financialFreedomSafeAnnualWithdrawal: null,
  financialFreedomSafeMonthlyWithdrawal: null
};

describe("onboarding web parity", () => {
  it("keeps the web journey on quick setup before personalization details", () => {
    const afterGoals: OnboardingPromptContext = {
      ...baseContext,
      activeGoalCount: 2,
      selectedGoalTypes: [
        FinancialGoalType.EMERGENCY_FUND,
        FinancialGoalType.FINANCIAL_FREEDOM
      ],
      hasExpenseDependentGoal: true,
      hasFinancialFreedomGoal: true
    };

    expect(
      getNextOnboardingStep(OnboardingStep.WAIT_REGISTER, baseContext, "START")
    ).toBe(OnboardingStep.ASK_GOAL_SELECTION);
    expect(
      getNextOnboardingStep(
        OnboardingStep.ASK_GOAL_SELECTION,
        afterGoals,
        [FinancialGoalType.EMERGENCY_FUND, FinancialGoalType.FINANCIAL_FREEDOM]
      )
    ).toBe(OnboardingStep.ASK_BUDGET_MODE);
    expect(
      getNextOnboardingStep(
        OnboardingStep.ASK_BUDGET_MODE,
        { ...afterGoals, budgetMode: BudgetMode.GUIDED_PLAN },
        BudgetMode.GUIDED_PLAN
      )
    ).toBe(OnboardingStep.ASK_EMPLOYMENT_TYPES);
    expect(
      getNextOnboardingStep(
        OnboardingStep.ASK_EMPLOYMENT_TYPES,
        {
          ...afterGoals,
          budgetMode: BudgetMode.GUIDED_PLAN,
          employmentTypes: [EmploymentType.EMPLOYEE]
        },
        [EmploymentType.EMPLOYEE]
      )
    ).toBe("ASK_ACTIVE_INCOME_COUNT");
    expect(
      getNextOnboardingStep(
        "ASK_ACTIVE_INCOME_COUNT" as OnboardingStep,
        {
          ...afterGoals,
          budgetMode: BudgetMode.GUIDED_PLAN,
          employmentTypes: [EmploymentType.EMPLOYEE],
          activeIncomeCount: 1
        },
        1
      )
    ).toBe(OnboardingStep.ASK_ACTIVE_INCOME);
    expect(
      getNextOnboardingStep(
        OnboardingStep.ASK_ACTIVE_INCOME,
        {
          ...afterGoals,
          budgetMode: BudgetMode.GUIDED_PLAN,
          employmentTypes: [EmploymentType.EMPLOYEE]
        },
        15000000
      )
    ).toBe(OnboardingStep.ASK_SALARY_DATE);
    expect(
      getNextOnboardingStep(
        OnboardingStep.ASK_HAS_PASSIVE_INCOME,
        {
          ...afterGoals,
          budgetMode: BudgetMode.GUIDED_PLAN,
          employmentTypes: [EmploymentType.EMPLOYEE]
        },
        false
      )
    ).toBe(OnboardingStep.ASK_GUIDED_EXPENSE_FOOD);
    expect(
      getNextOnboardingStep(
        OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS,
        {
          ...afterGoals,
          budgetMode: BudgetMode.GUIDED_PLAN,
          expenseAvailable: true,
          monthlyIncomeTotal: 15000000,
          monthlyExpenseTotal: 7000000,
          potentialMonthlySaving: 8000000
        },
        { kind: "presence", hasOtherExpense: false }
      )
    ).toBe(OnboardingStep.ASK_ASSET_SELECTION);
  });

  it("keeps personalization after the optional asset step and defaults to sequential planning", () => {
    const personalizationContext: OnboardingPromptContext = {
      ...baseContext,
      activeGoalCount: 2,
      selectedGoalTypes: [FinancialGoalType.HOUSE, FinancialGoalType.VACATION],
      hasPersonalizationPending: true,
      expenseAvailable: true,
      monthlyIncomeTotal: 10000000,
      monthlyExpenseTotal: 3500000,
      potentialMonthlySaving: 6500000
    };

    expect(
      getNextOnboardingStep(
        OnboardingStep.ASK_ASSET_SELECTION,
        personalizationContext,
        "NONE"
      )
    ).toBe(OnboardingStep.SHOW_ANALYSIS);
    expect(
      getNextOnboardingStep(
        OnboardingStep.ASK_PERSONALIZATION_CHOICE,
        {
          ...personalizationContext,
          hasChosenGoalExecutionMode: false,
          hasChosenPriorityGoal: false
        },
        false
      )
    ).toBe(OnboardingStep.SHOW_ANALYSIS);
    expect(
      getNextOnboardingStep(
        OnboardingStep.ASK_GOAL_ALLOCATION_MODE,
        {
          ...personalizationContext,
          hasChosenGoalExecutionMode: true,
          goalExecutionMode: GoalExecutionMode.SEQUENTIAL
        },
        GoalExecutionMode.SEQUENTIAL
      )
    ).toBe(OnboardingStep.SHOW_ANALYSIS);
  });
});
