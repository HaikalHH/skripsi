import { formatMoney, formatPercent } from "@/lib/services/shared/money";
import { formatDurationFromMonths } from "@/lib/services/shared/projection";
import {
  type ExpenseBucketSummary,
  type UserFinancialContextData
} from "@/lib/services/user/financial-context/types";

const stringifyExpenseBuckets = (expenseBuckets: ExpenseBucketSummary) =>
  expenseBuckets
    .filter((item) => item.amount > 0)
    .map((item) => `${item.categoryKey}:${formatMoney(item.amount)}`)
    .join(", ");

const stringifyManualExpenseDetails = (details: UserFinancialContextData["manualExpenseDetails"]) =>
  details
    .slice(0, 8)
    .map((item) => `${item.label}:${formatMoney(item.amount)}->${item.bucket}`)
    .join(", ");

const stringifyGoals = (goals: UserFinancialContextData["goals"]) =>
  goals
    .slice(0, 5)
    .map((goal) => {
      const amount = goal.targetAmount !== null ? formatMoney(goal.targetAmount) : "pending";
      const eta =
        goal.estimatedMonthsToGoal !== null
          ? `, eta=${formatDurationFromMonths(goal.estimatedMonthsToGoal)}`
          : "";
      const progress =
        goal.progressPercent !== null && goal.currentProgress !== null
          ? `, progress=${formatPercent(goal.progressPercent)} (${formatMoney(goal.currentProgress)})`
          : "";
      return `${goal.goalName}:${amount}, status=${goal.status}${progress}${eta}`;
    })
    .join(", ");

const stringifyAssets = (assets: UserFinancialContextData["assets"]) =>
  assets
    .slice(0, 5)
    .map((asset) => `${asset.assetName}(${asset.assetType})=${formatMoney(asset.estimatedValue ?? 0)}`)
    .join(", ");

const stringifyExpenseDetailTags = (detailTags: string[]) => detailTags.slice(0, 8).join(", ");

export const buildUserFinancialContextSummary = (context: UserFinancialContextData) => {
  const lines = [
    `registrationStatus=${context.registrationStatus ?? "UNKNOWN"}`,
    `onboardingStatus=${context.onboardingStatus ?? "UNKNOWN"}`,
    `analysisReady=${context.analysisReady ? "yes" : "no"}`,
    `hasAssets=${context.hasAssets ? "yes" : "no"}`
  ];

  if (context.hasPassiveIncome !== null) {
    lines.push(`hasPassiveIncome=${context.hasPassiveIncome ? "yes" : "no"}`);
  }

  if (context.monthlyIncomeTotal !== null) {
    lines.push(`monthlyIncomeTotal=${formatMoney(context.monthlyIncomeTotal)}`);
  }
  if (context.monthlyExpenseTotal !== null) {
    lines.push(`monthlyExpenseTotal=${formatMoney(context.monthlyExpenseTotal)}`);
  }
  if (context.potentialMonthlySaving !== null) {
    lines.push(`potentialMonthlySaving=${formatMoney(context.potentialMonthlySaving)}`);
  }
  if (context.savingRate !== null && Number.isFinite(context.savingRate)) {
    lines.push(`savingRate=${formatPercent(context.savingRate, 1)}`);
  }

  const bucketText = stringifyExpenseBuckets(context.expenseBuckets);
  if (bucketText) {
    lines.push(`expenseBuckets=${bucketText}`);
  }

  const detailText = stringifyManualExpenseDetails(context.manualExpenseDetails);
  if (detailText) {
    lines.push(`onboardingExpenseDetails=${detailText}`);
  }

  const goalText = stringifyGoals(context.goals);
  if (goalText) {
    lines.push(`goals=${goalText}`);
  }

  const assetText = stringifyAssets(context.assets);
  if (assetText) {
    lines.push(`assets=${assetText}`);
  }

  const detailTagsText = stringifyExpenseDetailTags(context.recentExpenseDetailTags);
  if (detailTagsText) {
    lines.push(`recentExpenseDetails=${detailTagsText}`);
  }

  return lines.join("\n");
};
