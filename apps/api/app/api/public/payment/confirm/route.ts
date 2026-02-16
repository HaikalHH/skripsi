import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { confirmPaymentByToken } from "@/lib/services/payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().min(10)
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid token payload" }, { status: 400 });
  }

  try {
    const session = await confirmPaymentByToken(parsed.data.token);
    return NextResponse.json({
      ok: true,
      status: session.status,
      paidAt: session.paidAt?.toISOString() ?? null
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Payment confirm failed" },
      { status: 400 }
    );
  }
}
