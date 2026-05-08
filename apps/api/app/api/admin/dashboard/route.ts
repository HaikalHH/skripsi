import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getMonthStart = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const monthStart = getMonthStart();

  const [
    totalUsers,
    activeUsersThisMonth,
    transactionCount,
    failedOutboundMessages,
    onboardingInProgress,
    failedOutboundQueue,
    onboardingQueue
  ] = await Promise.all([
    prisma.user.count(),
    prisma.messageLog
      .groupBy({
        by: ["userId"],
        where: { sentAt: { gte: monthStart } }
      })
      .then((groups) => groups.length),
    prisma.transaction.count(),
    prisma.outboundMessage.count({ where: { status: "FAILED" } }),
    prisma.user.count({
      where: {
        onboardingStatus: { in: ["NOT_STARTED", "IN_PROGRESS"] }
      }
    }),
    prisma.outboundMessage.findMany({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        userId: true,
        waNumber: true,
        errorMessage: true,
        updatedAt: true,
        user: {
          select: {
            name: true
          }
        }
      }
    }),
    prisma.user.findMany({
      where: {
        onboardingStatus: { in: ["NOT_STARTED", "IN_PROGRESS"] }
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        waNumber: true,
        name: true,
        onboardingStatus: true,
        onboardingStep: true,
        updatedAt: true
      }
    })
  ]);

  return NextResponse.json({
    totalUsers,
    activeUsersThisMonth,
    transactionCount,
    supportSummary: {
      failedOutboundMessages,
      onboardingInProgress
    },
    supportQueue: [
      ...failedOutboundQueue.map((message) => ({
        id: message.id,
        userId: message.userId,
        userName: message.user.name,
        waNumber: message.waNumber,
        type: "FAILED_OUTBOUND",
        label: "Failed outbound",
        detail: message.errorMessage ?? "Unknown outbound error",
        updatedAt: message.updatedAt.toISOString()
      })),
      ...onboardingQueue.map((user) => ({
        id: user.id,
        userId: user.id,
        userName: user.name,
        waNumber: user.waNumber,
        type: "ONBOARDING",
        label: user.onboardingStatus,
        detail: user.onboardingStep,
        updatedAt: user.updatedAt.toISOString()
      }))
    ]
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      )
      .slice(0, 8)
  });
}
