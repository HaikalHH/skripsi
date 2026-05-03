import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getPaymentSessionByToken,
  initializePaymentSessionCheckout
} from "@/lib/services/payments/payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  token: z.string().min(10)
});

const bodySchema = z.object({
  token: z.string().min(10),
  customerEmail: z.string().optional().nullable()
});

const emailSchema = z.string().email();

const serializePaymentSession = (session: NonNullable<Awaited<ReturnType<typeof getPaymentSessionByToken>>>) => ({
  token: session.token,
  provider: session.provider,
  status: session.status,
  providerStatus: session.providerStatus ?? null,
  amount: Number(session.amount),
  currency: session.currency,
  checkoutUrl: session.checkoutUrl ?? null,
  checkoutExpiresAt: session.checkoutExpiresAt?.toISOString() ?? null,
  customerEmail: session.customerEmail ?? null,
  waNumber: session.user.waNumber,
  paidAt: session.paidAt?.toISOString() ?? null,
  createdAt: session.createdAt.toISOString()
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

  return NextResponse.json(serializePaymentSession(session));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const customerEmail = parsed.data.customerEmail?.trim() || undefined;
  if (customerEmail && !emailSchema.safeParse(customerEmail).success) {
    return NextResponse.json({ error: "Invalid customer email" }, { status: 400 });
  }

  try {
    const session = await initializePaymentSessionCheckout({
      token: parsed.data.token,
      customerEmail
    });
    return NextResponse.json({
      ok: true,
      ...serializePaymentSession(session)
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Payment checkout init failed"
      },
      { status: 400 }
    );
  }
}
