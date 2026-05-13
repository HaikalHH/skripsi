import { type ManualExpenseBreakdownDetail } from "@/lib/services/onboarding/flow/shared/parser/onboarding-parser-service";

export type ExpenseBucketSummary = Array<{
  categoryKey: string;
  amount: number;
}>;

export type UserFinancialContextData = {
  registrationStatus: string | null;
  onboardingStatus: string | null;
  analysisReady: boolean;
  hasAssets: boolean;
  hasPassiveIncome: boolean | null;
  monthlyIncomeTotal: number | null;
  monthlyExpenseTotal: number | null;
  potentialMonthlySaving: number | null;
  savingRate: number | null;
  expenseBuckets: ExpenseBucketSummary;
  manualExpenseDetails: ManualExpenseBreakdownDetail[];
  goals: Array<{
    goalName: string;
    targetAmount: number | null;
    status: string;
    estimatedMonthsToGoal: number | null;
    currentProgress: number | null;
    remainingAmount: number | null;
    progressPercent: number | null;
  }>;
  assets: Array<{
    assetName: string;
    assetType: string;
    estimatedValue: number | null;
  }>;
  recentExpenseDetailTags: string[];
  recentMessages: string[];
};
