import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          transactions: true,
          messageLogs: true
        }
      },
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1
      },
      savingsGoal: true
    }
  });

  return NextResponse.json({
    users: users.map((user) => ({
      id: user.id,
      waNumber: user.waNumber,
      name: user.name,
      currency: user.currency,
      monthlyBudget: user.monthlyBudget ? Number(user.monthlyBudget) : null,
      registrationStatus: user.registrationStatus,
      onboardingStep: user.onboardingStep,
      createdAt: user.createdAt.toISOString(),
      transactionCount: user._count.transactions,
      messageCount: user._count.messageLogs,
      subscriptionStatus: user.subscriptions[0]?.status ?? "NONE",
      savingsGoalTarget: user.savingsGoal ? Number(user.savingsGoal.targetAmount) : null,
      savingsGoalProgress: user.savingsGoal ? Number(user.savingsGoal.currentProgress) : null
    }))
  });
}

export async function DELETE(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, waNumber: true }
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({
    success: true,
    deletedUser: {
      id: user.id,
      waNumber: user.waNumber
    }
  });
}
