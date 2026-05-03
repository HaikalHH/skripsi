import { NextRequest, NextResponse } from "next/server";
import {
  verifyAirwallexWebhookSignature,
  parseAirwallexWebhook
} from "@/lib/services/payments/airwallex-service";
import { processAirwallexBillingWebhook } from "@/lib/services/payments/payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getHeaderValue = (request: NextRequest, names: string[]) => {
  for (const name of names) {
    const value = request.headers.get(name);
    if (value) return value;
  }
  return null;
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const timestamp = getHeaderValue(request, ["x-timestamp", "x-awx-timestamp"]);
  const signature = getHeaderValue(request, ["x-signature", "x-awx-signature"]);

  if (!verifyAirwallexWebhookSignature({ rawBody, timestamp, signature })) {
    return NextResponse.json({ ok: false, error: "Invalid Airwallex webhook signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  try {
    const result = await processAirwallexBillingWebhook(payload);
    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      eventType: result.eventType
    });
  } catch (error) {
    const parsed = parseAirwallexWebhook(payload);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Webhook processing failed",
        eventType: parsed.eventType || null
      },
      { status: 400 }
    );
  }
}
