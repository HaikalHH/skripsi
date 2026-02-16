import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPaymentSessionByToken } from "@/lib/services/payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  token: z.string().min(10)
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    token: request.nextUrl.searchParams.get("token")
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const session = await getPaymentSessionByToken(parsed.data.token);
  if (!session) {
    return NextResponse.json({ error: "Payment session not found" }, { status: 404 });
  }

  return NextResponse.json({
    token: session.token,
    status: session.status,
    amount: Number(session.amount),
    waNumber: session.user.waNumber,
    paidAt: session.paidAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString()
  });
}
