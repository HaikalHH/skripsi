import { reportPeriodSchema } from "@finance/shared";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  buildInitialFinancialProfile,
  generateOnboardingAnalysis,
  getOnboardingAnalysisData,
  normalizeStoredOnboardingAssetValue
} from "@/lib/services/onboarding/onboarding-calculation-service";
import { resolveUserIdentity, toJsonSafe } from "@/lib/services/onboarding/onboarding-route-helper";
import {
  buildReportText,
  getUserReportData
} from "@/lib/services/reporting/report-service";
import { ensureUsableSubscription } from "@/lib/services/payments/subscription-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    userId: z.string().min(1).optional(),
    waNumber: z.string().min(6).optional(),
    period: reportPeriodSchema.optional().default("monthly")
  })
  .refine((value) => Boolean(value.userId || value.waNumber), {
    message: "userId or waNumber is required"
  });

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    userId: request.nextUrl.searchParams.get("userId") ?? undefined,
    waNumber: request.nextUrl.searchParams.get("waNumber") ?? undefined,
    period: request.nextUrl.searchParams.get("period") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await resolveUserIdentity(parsed.data);
  await ensureUsableSubscription(user.id);

  let financialProfile = await prisma.financialProfile.findUnique({
    where: { userId: user.id }
  });
  if (!financialProfile) {
    financialProfile = await buildInitialFinancialProfile(user.id).catch(() => null);
  }

  const [report, latestSubscription, goals, assets, activePlan, recentTransactions, freedomProfile] =
    await Promise.all([
      getUserReportData(user.id, parsed.data.period),
      prisma.subscription.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" }
      }),
      prisma.financialGoal.findMany({
        where: { userId: user.id },
        orderBy: [{ priorityOrder: "asc" }, { createdAt: "asc" }]
      }),
      prisma.asset.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" }
      }),
      prisma.expensePlan.findFirst({
        where: { userId: user.id, isActive: true },
        include: { items: true },
        orderBy: { createdAt: "desc" }
      }),
      prisma.transaction.findMany({
        where: { userId: user.id },
        orderBy: { occurredAt: "desc" },
        take: 8
      }),
      prisma.financialFreedomProfile.findUnique({
        where: { userId: user.id },
        select: { targetYears: true }
      })
    ]);

  let analysisText: string | null = null;
  let analysisData: unknown = null;
  if (financialProfile) {
    [analysisText, analysisData] = await Promise.all([
      generateOnboardingAnalysis(user.id).catch(() => null),
      getOnboardingAnalysisData(user.id).catch(() => null)
    ]);
  }

  return NextResponse.json(
    toJsonSafe({
      user: {
        id: user.id,
        waNumber: user.waNumber,
        name: user.name,
        currency: user.currency,
        primaryGoal: user.primaryGoal,
        employmentType: user.employmentType,
        budgetMode: user.budgetMode,
        salaryDate: user.salaryDate,
        financialFreedomTargetYears: freedomProfile?.targetYears ?? null,
        onboardingStatus: user.onboardingStatus,
        registrationStatus: user.registrationStatus
      },
      subscription: latestSubscription
        ? {
            status: latestSubscription.status,
            provider: latestSubscription.provider,
            providerStatus: latestSubscription.providerStatus,
            currentPeriodEndAt: latestSubscription.currentPeriodEndAt,
            cancelAt: latestSubscription.cancelAt,
            cancelAtPeriodEnd: latestSubscription.cancelAtPeriodEnd
          }
        : null,
      profile: financialProfile,
      analysis: {
        text: analysisText,
        data: analysisData
      },
      paymentLink: null,
      report: {
        ...report,
        summary: buildReportText(
          parsed.data.period,
          report.incomeTotal,
          report.expenseTotal,
          report.categoryBreakdown,
          report.periodLabel
        )
      },
      goals: goals.map((goal) => ({
        id: goal.id,
        goalType: goal.goalType,
        goalName: goal.goalName,
        priorityOrder: goal.priorityOrder,
        status: goal.status,
        targetAmount: goal.targetAmount !== null ? toNumber(goal.targetAmount) : null,
        targetAge: goal.targetAge,
        estimatedMonthsToGoal:
          goal.estimatedMonthsToGoal !== null ? toNumber(goal.estimatedMonthsToGoal) : null,
        createdAt: goal.createdAt
      })),
      assets: assets.map((asset) => ({
        id: asset.id,
        assetType: asset.assetType,
        assetName: asset.assetName,
        estimatedValue:
          asset.estimatedValue !== null ? normalizeStoredOnboardingAssetValue(asset) : null,
        quantity: asset.quantity !== null ? toNumber(asset.quantity) : null,
        unit: asset.unit,
        createdAt: asset.createdAt
      })),
      expensePlan: activePlan
        ? {
            id: activePlan.id,
            source: activePlan.source,
            totalMonthlyExpense: toNumber(activePlan.totalMonthlyExpense),
            items: activePlan.items.map((item) => ({
              id: item.id,
              categoryKey: item.categoryKey,
              amount: toNumber(item.amount)
            }))
          }
        : null,
      recentTransactions: recentTransactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        category: transaction.category,
        detailTag: transaction.detailTag,
        merchant: transaction.merchant,
        note: transaction.note,
        amount: toNumber(transaction.amount),
        occurredAt: transaction.occurredAt
      }))
    })
  );
}
