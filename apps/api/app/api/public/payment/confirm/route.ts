import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  confirmPaymentByToken,
  getPaymentSessionByToken
} from "@/lib/services/payments/payment-service";

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

  const existingSession = await getPaymentSessionByToken(parsed.data.token);
  if (!existingSession) {
    return NextResponse.json({ ok: false, error: "Payment session not found" }, { status: 404 });
  }

  if (existingSession.provider === "AIRWALLEX") {
    return NextResponse.json(
      {
        ok: false,
        error: "Konfirmasi manual dimatikan untuk Airwallex. Tunggu webhook pembayaran masuk.",
        provider: existingSession.provider,
        status: existingSession.status,
        providerStatus: existingSession.providerStatus ?? null,
        paidAt: existingSession.paidAt?.toISOString() ?? null,
        checkoutUrl: existingSession.checkoutUrl ?? null
      },
      { status: 409 }
    );
  }

  try {
    const session = await confirmPaymentByToken(parsed.data.token);
    return NextResponse.json({
      ok: true,
      provider: session.provider,
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
