import { FinancialGoalStatus, OnboardingQuestionKey } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSavingsGoalStatus } from "@/lib/services/planning/goal-service";
import {
  parseManualExpenseBreakdownDetails,
  type ManualExpenseBreakdownDetail
} from "@/lib/services/onboarding/onboarding-parser-service";
import { buildTransactionDetailLabel, inferTransactionDetailTag } from "@/lib/services/transactions/detail-tag-service";
import { formatMoney, formatPercent } from "@/lib/services/shared/money-format";

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

type ExpenseBucketSummary = Array<{
  categoryKey: string;
  amount: number;
}>;

export type UserFinancialContextData = {
  registrationStatus: string | null;
  onboardingStatus: string | null;
  analysisReady: boolean;
  hasAssets: boolean;
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

const stringifyExpenseBuckets = (expenseBuckets: ExpenseBucketSummary) =>
  expenseBuckets
    .filter((item) => item.amount > 0)
    .map((item) => `${item.categoryKey}:${formatMoney(item.amount)}`)
    .join(", ");

const stringifyManualExpenseDetails = (details: ManualExpenseBreakdownDetail[]) =>
  details
    .slice(0, 8)
    .map((item) => `${item.label}:${formatMoney(item.amount)}->${item.bucket}`)
    .join(", ");

const stringifyGoals = (goals: UserFinancialContextData["goals"]) =>
  goals
    .slice(0, 5)
    .map((goal) => {
      const amount = goal.targetAmount !== null ? formatMoney(goal.targetAmount) : "pending";
      const eta = goal.estimatedMonthsToGoal ? `, eta=${goal.estimatedMonthsToGoal.toFixed(1)} bln` : "";
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

export const loadUserFinancialContext = async (params: {
  userId: string;
  recentMessagesLimit?: number;
}): Promise<UserFinancialContextData> => {
  const recentMessagesLimit = params.recentMessagesLimit ?? 0;

  const [user, latestManualBreakdownSession, recentMessages, recentExpenseTransactions, goalStatusSummary] = await Promise.all([
    prisma.user.findUnique({
      where: { id: params.userId },
      select: {
        registrationStatus: true,
        onboardingStatus: true,
        analysisReady: true,
        hasAssets: true,
        financialProfile: {
          select: {
            monthlyIncomeTotal: true,
            monthlyExpenseTotal: true,
            potentialMonthlySaving: true,
            savingRate: true
          }
        },
        expensePlans: {
          where: { isActive: true },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            items: {
              select: {
                categoryKey: true,
                amount: true
              }
            }
          }
        },
        financialGoals: {
          where: {
            status: {
              in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION]
            }
          },
          orderBy: { createdAt: "asc" },
          select: {
            goalName: true,
            targetAmount: true,
            status: true,
            estimatedMonthsToGoal: true
          }
        },
        assets: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            assetName: true,
            assetType: true,
            estimatedValue: true
          }
        }
      }
    }),
    prisma.onboardingSession.findFirst({
      where: {
        userId: params.userId,
        questionKey: OnboardingQuestionKey.MANUAL_EXPENSE_BREAKDOWN
      },
      orderBy: { createdAt: "desc" },
      select: {
        rawAnswerJson: true
      }
    }),
    recentMessagesLimit > 0
      ? prisma.messageLog.findMany({
          where: {
            userId: params.userId,
            messageType: "TEXT"
          },
          orderBy: { sentAt: "desc" },
          take: recentMessagesLimit,
          select: { contentOrCaption: true }
        })
      : Promise.resolve([]),
    prisma.transaction.findMany({
      where: {
        userId: params.userId,
        type: "EXPENSE"
      },
      orderBy: { occurredAt: "desc" },
      take: 20,
      select: {
        category: true,
        detailTag: true,
        merchant: true,
        note: true,
        rawText: true
      }
    }),
    getSavingsGoalStatus(params.userId).catch(() => null)
  ]);

  const manualExpenseRaw =
    typeof latestManualBreakdownSession?.rawAnswerJson === "string"
      ? latestManualBreakdownSession.rawAnswerJson
      : null;

  return {
    registrationStatus: user?.registrationStatus ?? null,
    onboardingStatus: user?.onboardingStatus ?? null,
    analysisReady: Boolean(user?.analysisReady),
    hasAssets: Boolean(user?.hasAssets),
    monthlyIncomeTotal:
      user?.financialProfile?.monthlyIncomeTotal != null
        ? toNumber(user.financialProfile.monthlyIncomeTotal)
        : null,
    monthlyExpenseTotal:
      user?.financialProfile?.monthlyExpenseTotal != null
        ? toNumber(user.financialProfile.monthlyExpenseTotal)
        : null,
    potentialMonthlySaving:
      user?.financialProfile?.potentialMonthlySaving != null
        ? toNumber(user.financialProfile.potentialMonthlySaving)
        : null,
    savingRate:
      user?.financialProfile?.savingRate != null ? toNumber(user.financialProfile.savingRate) : null,
    expenseBuckets:
      user?.expensePlans[0]?.items.map((item) => ({
        categoryKey: item.categoryKey,
        amount: toNumber(item.amount)
      })) ?? [],
    manualExpenseDetails: manualExpenseRaw ? parseManualExpenseBreakdownDetails(manualExpenseRaw) : [],
    goals:
      goalStatusSummary?.goals.length
        ? goalStatusSummary.goals.map((goal) => ({
            goalName: goal.goalName,
            targetAmount: goal.targetAmount,
            status: goal.status,
            estimatedMonthsToGoal: goal.estimatedMonthsToGoal,
            currentProgress: goal.currentProgress,
            remainingAmount: goal.remainingAmount,
            progressPercent: goal.progressPercent
          }))
        : user?.financialGoals.map((goal) => ({
            goalName: goal.goalName,
            targetAmount: goal.targetAmount !== null ? toNumber(goal.targetAmount) : null,
            status: goal.status,
            estimatedMonthsToGoal:
              goal.estimatedMonthsToGoal !== null ? toNumber(goal.estimatedMonthsToGoal) : null,
            currentProgress: null,
            remainingAmount: null,
            progressPercent: null
          })) ?? [],
    assets:
      user?.assets.map((asset) => ({
        assetName: asset.assetName,
        assetType: asset.assetType,
        estimatedValue: asset.estimatedValue !== null ? toNumber(asset.estimatedValue) : null
      })) ?? [],
    recentExpenseDetailTags: recentExpenseTransactions
      .map((transaction) =>
        buildTransactionDetailLabel({
          detailTag:
            transaction.detailTag ??
            inferTransactionDetailTag({
              type: "EXPENSE",
              category: transaction.category,
              merchant: transaction.merchant ?? null,
              note: transaction.note ?? null,
              rawText: transaction.rawText ?? null
            }),
          merchant: transaction.merchant ?? null,
          note: transaction.note ?? null,
          rawText: transaction.rawText ?? null
        })
      )
      .filter(Boolean)
      .slice(0, 12),
    recentMessages: recentMessages
      .map((item) => item.contentOrCaption.trim())
      .filter(Boolean)
      .reverse()
  };
};
