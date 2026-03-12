import { NextRequest, NextResponse } from "next/server";
import { submitOnboardingAnswer } from "@/lib/services/onboarding/onboarding-service";
import { onboardingAnswerBodySchema, resolveUserIdentity, toJsonSafe } from "@/lib/services/onboarding/onboarding-route-helper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = onboardingAnswerBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await resolveUserIdentity(parsed.data);
  const state = await submitOnboardingAnswer({ userId: user.id, answer: parsed.data.answer });
  return NextResponse.json(toJsonSafe(state));
}
