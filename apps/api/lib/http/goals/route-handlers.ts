import { FinancialGoalStatus, FinancialGoalType, GoalCalculationType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildInitialFinancialProfile,
  createOrUpdateFinancialGoal
} from "@/lib/services/onboarding/flow/shared/calculation/onboarding-calculation-service";
import { GOAL_OPTIONS } from "@/lib/services/onboarding/flow/shared/questions/answer-options";
import {
  goalCreateBodySchema,
  resolveUserIdentity,
  toJsonSafe,
  userIdentitySchema
} from "@/lib/services/onboarding/flow/shared/route/onboarding-route-helper";

const SUPPORTED_GOAL_TYPES = new Set(GOAL_OPTIONS.map((option) => option.value));

const isSupportedGoalType = (goalType: FinancialGoalType) => SUPPORTED_GOAL_TYPES.has(goalType);

export async function GET(request: NextRequest) {
  const parsed = userIdentitySchema.safeParse({
    userId: request.nextUrl.searchParams.get("userId") ?? undefined,
    waNumber: request.nextUrl.searchParams.get("waNumber") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await resolveUserIdentity(parsed.data);
  const goals = await prisma.financialGoal.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" }
  });
  const supportedGoals = goals.filter((goal) => isSupportedGoalType(goal.goalType));
  return NextResponse.json(toJsonSafe(supportedGoals));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = goalCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!isSupportedGoalType(parsed.data.goalType)) {
    return NextResponse.json(
      { error: "Goal type tersebut sudah tidak didukung." },
      { status: 400 }
    );
  }

  const user = await resolveUserIdentity(parsed.data);
  const calculationType =
    parsed.data.goalType === FinancialGoalType.EMERGENCY_FUND
      ? GoalCalculationType.FORMULA_BASED
      : GoalCalculationType.MANUAL;
  const status = parsed.data.targetAmount == null ? FinancialGoalStatus.PENDING_CALCULATION : FinancialGoalStatus.ACTIVE;

  const goal = await createOrUpdateFinancialGoal({
    userId: user.id,
    goalType: parsed.data.goalType,
    goalName: parsed.data.goalName,
    targetAmount: parsed.data.targetAmount ?? null,
    targetAge: parsed.data.targetAge ?? null,
    calculationType,
    status
  });
  await buildInitialFinancialProfile(user.id);
  return NextResponse.json(toJsonSafe(goal));
}
