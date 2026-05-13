import { FinancialGoalStatus, OnboardingQuestionKey } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSavingsGoalStatus } from "@/lib/services/planning/goal";
import {
  getGuidedOtherExpenseState,
  parseManualExpenseBreakdownDetails,
  type ManualExpenseBreakdownDetail
} from "@/lib/services/onboarding/flow/shared/parser/onboarding-parser-service";
import { buildTransactionDetailLabel, inferTransactionDetailTag } from "@/lib/services/transactions/detail-tags";
import { normalizeStoredOnboardingAssetValue } from "@/lib/services/onboarding/flow/shared/calculation/onboarding-calculation-service";
import { type UserFinancialContextData } from "@/lib/services/user/financial-context/types";

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

export const loadUserFinancialContext = async (params: {
  userId: string;
  recentMessagesLimit?: number;
}): Promise<UserFinancialContextData> => {
  const recentMessagesLimit = params.recentMessagesLimit ?? 0;

  const [user, latestManualBreakdownSession, guidedOtherExpenseSessions, recentMessages, recentExpenseTransactions, goalStatusSummary] = await Promise.all([
    prisma.user.findUnique({
      where: { id: params.userId },
      select: {
        registrationStatus: true,
        onboardingStatus: true,
        analysisReady: true,
        hasAssets: true,
        hasPassiveIncome: true,
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
    prisma.onboardingSession.findMany({
      where: {
        userId: params.userId,
        questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_OTHERS
      },
      orderBy: { createdAt: "asc" }
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
  const guidedOtherExpenseDetails = getGuidedOtherExpenseState(guidedOtherExpenseSessions).items.map(
    (item) =>
      ({
        label: item.label,
        amount: item.amount,
        bucket: "others"
      }) satisfies ManualExpenseBreakdownDetail
  );

  return {
    registrationStatus: user?.registrationStatus ?? null,
    onboardingStatus: user?.onboardingStatus ?? null,
    analysisReady: Boolean(user?.analysisReady),
    hasAssets: Boolean(user?.hasAssets),
    hasPassiveIncome: typeof user?.hasPassiveIncome === "boolean" ? user.hasPassiveIncome : null,
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
    manualExpenseDetails: [
      ...(manualExpenseRaw ? parseManualExpenseBreakdownDetails(manualExpenseRaw) : []),
      ...guidedOtherExpenseDetails
    ],
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
        estimatedValue:
          asset.estimatedValue !== null ? normalizeStoredOnboardingAssetValue(asset) : null
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
