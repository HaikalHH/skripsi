import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveUserIdentity, toJsonSafe, userIdentitySchema } from "@/lib/services/onboarding-route-helper";

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
  const profile = await prisma.financialProfile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    return NextResponse.json({ error: "Financial profile not found" }, { status: 404 });
  }

  return NextResponse.json(toJsonSafe(profile));
}
