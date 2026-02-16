import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { ackOutboundMessage } from "@/lib/services/outbound-message-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  id: z.string().min(1),
  status: z.enum(["SENT", "FAILED"]),
  errorMessage: z.string().max(191).optional()
});

const isBotAuthorized = (request: NextRequest) =>
  request.headers.get("x-bot-token") === env.BOT_INTERNAL_TOKEN;

export async function POST(request: NextRequest) {
  if (!isBotAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  await ackOutboundMessage(parsed.data);
  return NextResponse.json({ ok: true });
}
