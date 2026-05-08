import { TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    userId: string;
  };
};

const dateInputSchema = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date");

const querySchema = z.object({
  type: z.nativeEnum(TransactionType).optional(),
  startDate: dateInputSchema.optional(),
  endDate: dateInputSchema.optional()
});

const getMonthStart = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

export async function GET(request: NextRequest, { params }: RouteContext) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    include: {
      _count: {
        select: {
          transactions: true,
          messageLogs: true
        }
      },
      savingsGoal: true,
      reminderPreference: true,
      onboardingSessions: {
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          stepKey: true,
          questionKey: true,
          isCompleted: true,
          createdAt: true,
          updatedAt: true
        }
      },
      reminderEvents: {
        orderBy: { sentAt: "desc" },
        take: 10,
        select: {
          id: true,
          reminderType: true,
          marker: true,
          sentAt: true
        }
      }
    }
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { type, startDate, endDate } = parsed.data;
  const monthStart = getMonthStart();

  const [transactions, monthlyTransactions, topExpenseCategories] =
    await Promise.all([
      prisma.transaction.findMany({
        where: {
          userId: user.id,
          type,
          occurredAt:
            startDate || endDate
              ? {
                  gte: startDate ? new Date(startDate) : undefined,
                  lte: endDate ? new Date(endDate) : undefined
                }
              : undefined
        },
        orderBy: { occurredAt: "desc" },
        take: 500
      }),
      prisma.transaction.findMany({
        where: {
          userId: user.id,
          occurredAt: { gte: monthStart }
        },
        select: {
          type: true,
          amount: true
        }
      }),
      prisma.transaction.groupBy({
        by: ["category"],
        where: {
          userId: user.id,
          type: "EXPENSE",
          occurredAt: { gte: monthStart }
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: "desc" } },
        take: 5
      })
    ]);

  const monthlyIncome = monthlyTransactions
    .filter((transaction) => transaction.type === "INCOME")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const monthlyExpense = monthlyTransactions
    .filter((transaction) => transaction.type === "EXPENSE")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const monthlySaving = monthlyTransactions
    .filter((transaction) => transaction.type === "SAVING")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  return NextResponse.json({
    user: {
      id: user.id,
      waNumber: user.waNumber,
      name: user.name,
      currency: user.currency,
      monthlyBudget: user.monthlyBudget ? Number(user.monthlyBudget) : null,
      registrationStatus: user.registrationStatus,
      onboardingStatus: user.onboardingStatus,
      onboardingStep: user.onboardingStep,
      onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      transactionCount: user._count.transactions,
      messageCount: user._count.messageLogs,
      savingsGoalTarget: user.savingsGoal
        ? Number(user.savingsGoal.targetAmount)
        : null,
      savingsGoalProgress: user.savingsGoal
        ? Number(user.savingsGoal.currentProgress)
        : null
    },
    monthlySummary: {
      income: monthlyIncome,
      expense: monthlyExpense,
      saving: monthlySaving,
      net: monthlyIncome - monthlyExpense - monthlySaving
    },
    topExpenseCategories: topExpenseCategories.map((category) => ({
      category: category.category,
      amount: Number(category._sum.amount ?? 0)
    })),
    reminderPreference: user.reminderPreference
      ? {
          budgetEnabled: user.reminderPreference.budgetEnabled,
          weeklyEnabled: user.reminderPreference.weeklyEnabled,
          weeklyReviewEnabled: user.reminderPreference.weeklyReviewEnabled,
          recurringEnabled: user.reminderPreference.recurringEnabled,
          cashflowEnabled: user.reminderPreference.cashflowEnabled,
          goalEnabled: user.reminderPreference.goalEnabled,
          monthlyClosingEnabled:
            user.reminderPreference.monthlyClosingEnabled,
          quietHoursStart: user.reminderPreference.quietHoursStart,
          quietHoursEnd: user.reminderPreference.quietHoursEnd,
          minIntervalHours: user.reminderPreference.minIntervalHours,
          maxPerDay: user.reminderPreference.maxPerDay,
          snoozedUntil:
            user.reminderPreference.snoozedUntil?.toISOString() ?? null,
          updatedAt: user.reminderPreference.updatedAt.toISOString()
        }
      : null,
    reminderEvents: user.reminderEvents.map((event) => ({
      id: event.id,
      reminderType: event.reminderType,
      marker: event.marker,
      sentAt: event.sentAt.toISOString()
    })),
    onboardingHistory: user.onboardingSessions.map((session) => ({
      id: session.id,
      stepKey: session.stepKey,
      questionKey: session.questionKey,
      isCompleted: session.isCompleted,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString()
    })),
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: Number(transaction.amount),
      category: transaction.category,
      merchant: transaction.merchant,
      note: transaction.note,
      occurredAt: transaction.occurredAt.toISOString(),
      source: transaction.source,
      createdAt: transaction.createdAt.toISOString()
    }))
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (body?.action !== "reset-onboarding") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true }
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.onboardingSession.deleteMany({ where: { userId: params.userId } }),
    prisma.user.update({
      where: { id: params.userId },
      data: {
        registrationStatus: "PENDING",
        onboardingStatus: "NOT_STARTED",
        onboardingStep: "WAIT_REGISTER",
        onboardingCompletedAt: null,
        analysisReady: false,
        primaryGoal: null,
        employmentType: null,
        incomeStability: null,
        hasPassiveIncome: null,
        salaryDate: null,
        targetFinancialFreedomAge: null,
        goalExecutionMode: null,
        priorityGoalType: null,
        budgetMode: null,
        hasAssets: null
      }
    })
  ]);

  return NextResponse.json({ success: true });
}
