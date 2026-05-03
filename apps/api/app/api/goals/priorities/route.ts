import { FinancialGoalType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { syncFinancialGoalPriorities } from "@/lib/services/onboarding/onboarding-calculation-service";
import {
  resolveUserIdentity,
  toJsonSafe
} from "@/lib/services/onboarding/onboarding-route-helper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    userId: z.string().min(1).optional(),
    waNumber: z.string().min(6).optional(),
    goals: z
      .array(
        z.object({
          goalType: z.nativeEnum(FinancialGoalType),
          goalName: z.string().min(1).max(120)
        })
      )
      .min(1)
  })
  .refine((value) => Boolean(value.userId || value.waNumber), {
    message: "userId or waNumber is required"
  });

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await resolveUserIdentity(parsed.data);
  const goals = await syncFinancialGoalPriorities({
    userId: user.id,
    goals: parsed.data.goals
  });

  return NextResponse.json(toJsonSafe(goals));
}
