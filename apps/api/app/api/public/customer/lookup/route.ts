import { NextRequest, NextResponse } from "next/server";
import { findExistingUserByWaNumber } from "@/lib/services/user/user-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const waNumber = request.nextUrl.searchParams.get("waNumber")?.trim();
  if (!waNumber) {
    return NextResponse.json({ error: "waNumber is required" }, { status: 400 });
  }

  const result = await findExistingUserByWaNumber(waNumber);
  return NextResponse.json({
    normalizedWaNumber: result.normalizedWaNumber,
    exists: Boolean(result.user),
    onboardingStatus: result.user?.onboardingStatus ?? null,
    registrationStatus: result.user?.registrationStatus ?? null
  });
}
