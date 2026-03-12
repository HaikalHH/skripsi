import { NextRequest, NextResponse } from "next/server";
import { buildInitialFinancialProfile } from "@/lib/services/onboarding/onboarding-calculation-service";
import { resolveUserIdentity, toJsonSafe, userIdentitySchema } from "@/lib/services/onboarding/onboarding-route-helper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = userIdentitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await resolveUserIdentity(parsed.data);
  const profile = await buildInitialFinancialProfile(user.id);
  return NextResponse.json(toJsonSafe(profile));
}
