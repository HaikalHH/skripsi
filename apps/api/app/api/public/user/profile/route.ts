import { BudgetMode, PrimaryGoal } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { buildInitialFinancialProfile } from "@/lib/services/onboarding/onboarding-calculation-service";
import { resolveUserIdentity, toJsonSafe } from "@/lib/services/onboarding/onboarding-route-helper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const userIdentityPatchSchema = z
  .object({
    userId: z.string().min(1).optional(),
    waNumber: z.string().min(6).optional()
  })
  .refine((value) => Boolean(value.userId || value.waNumber), {
    message: "userId or waNumber is required"
  });

const profilePatchSchema = userIdentityPatchSchema.and(
  z.object({
    name: z.string().trim().min(2).max(120).optional(),
    currency: z.string().trim().min(3).max(6).optional(),
    primaryGoal: z.nativeEnum(PrimaryGoal).nullable().optional(),
    budgetMode: z.nativeEnum(BudgetMode).nullable().optional(),
    salaryDate: z.number().int().min(1).max(31).nullable().optional(),
    financialFreedomTargetYears: z.number().int().min(1).max(70).optional()
  })
);

export async function GET(request: NextRequest) {
  const parsed = userIdentityPatchSchema.safeParse({
    userId: request.nextUrl.searchParams.get("userId") ?? undefined,
    waNumber: request.nextUrl.searchParams.get("waNumber") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await resolveUserIdentity(parsed.data);
  const freedomProfile = await prisma.financialFreedomProfile.findUnique({
    where: { userId: user.id },
    select: { targetYears: true }
  });
  return NextResponse.json(
    toJsonSafe({
      id: user.id,
      waNumber: user.waNumber,
      name: user.name,
      currency: user.currency,
      primaryGoal: user.primaryGoal,
      budgetMode: user.budgetMode,
      salaryDate: user.salaryDate,
      financialFreedomTargetYears: freedomProfile?.targetYears ?? null
    })
  );
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = profilePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await resolveUserIdentity(parsed.data);
  const updates = Object.fromEntries(
    Object.entries({
      name: parsed.data.name,
      currency: parsed.data.currency,
      primaryGoal: parsed.data.primaryGoal,
      budgetMode: parsed.data.budgetMode,
      salaryDate: parsed.data.salaryDate
    }).filter(([, value]) => value !== undefined)
  );

  if (!Object.keys(updates).length && parsed.data.financialFreedomTargetYears === undefined) {
    return NextResponse.json({ error: "No profile changes supplied" }, { status: 400 });
  }

  const updatedUser =
    Object.keys(updates).length > 0
      ? await prisma.user.update({
          where: { id: user.id },
          data: updates
        })
      : user;

  if (parsed.data.financialFreedomTargetYears !== undefined) {
    await prisma.financialFreedomProfile.upsert({
      where: { userId: user.id },
      update: { targetYears: parsed.data.financialFreedomTargetYears },
      create: {
        userId: user.id,
        enabled: true,
        monthlyExpense: 0,
        targetYears: parsed.data.financialFreedomTargetYears,
        safeWithdrawalRate: 0.04
      }
    });
  }

  await buildInitialFinancialProfile(user.id).catch(() => null);

  const freedomProfile = await prisma.financialFreedomProfile.findUnique({
    where: { userId: user.id },
    select: { targetYears: true }
  });

  return NextResponse.json(
    toJsonSafe({
      id: updatedUser.id,
      waNumber: updatedUser.waNumber,
      name: updatedUser.name,
      currency: updatedUser.currency,
      primaryGoal: updatedUser.primaryGoal,
      budgetMode: updatedUser.budgetMode,
      salaryDate: updatedUser.salaryDate,
      financialFreedomTargetYears: freedomProfile?.targetYears ?? null
    })
  );
}
