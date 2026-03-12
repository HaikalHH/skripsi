import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildInitialFinancialProfile, createOnboardingAsset } from "@/lib/services/onboarding/onboarding-calculation-service";
import { assetCreateBodySchema, resolveUserIdentity, toJsonSafe, userIdentitySchema } from "@/lib/services/onboarding/onboarding-route-helper";

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
  const assets = await prisma.asset.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(toJsonSafe(assets));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = assetCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await resolveUserIdentity(parsed.data);
  const asset = await createOnboardingAsset({
    userId: user.id,
    assetType: parsed.data.assetType,
    assetName: parsed.data.assetName,
    quantity: parsed.data.quantity ?? null,
    unit: parsed.data.unit ?? null,
    estimatedValue: parsed.data.estimatedValue ?? null,
    notes: parsed.data.notes ?? null
  });
  await buildInitialFinancialProfile(user.id);
  return NextResponse.json(toJsonSafe(asset));
}
