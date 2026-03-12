import { NextRequest, NextResponse } from "next/server";
import { generateOnboardingAnalysis, getOnboardingAnalysisData } from "@/lib/services/onboarding/onboarding-calculation-service";
import { resolveUserIdentity, toJsonSafe, userIdentitySchema } from "@/lib/services/onboarding/onboarding-route-helper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const parsed = userIdentitySchema.safeParse({
    userId: request.nextUrl.searchParams.get("userId") ?? undefined,
    waNumber: request.nextUrl.searchParams.get("waNumber") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await resolveUserIdentity(parsed.data);
  const [analysisText, analysisData] = await Promise.all([
    generateOnboardingAnalysis(user.id),
    getOnboardingAnalysisData(user.id)
  ]);
  return NextResponse.json(toJsonSafe({ analysisText, analysisData }));
}
