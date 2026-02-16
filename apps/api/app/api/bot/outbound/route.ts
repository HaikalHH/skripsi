import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { claimPendingOutboundMessages } from "@/lib/services/outbound-message-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(20).default(5)
});

const isBotAuthorized = (request: NextRequest) =>
  request.headers.get("x-bot-token") === env.BOT_INTERNAL_TOKEN;

export async function GET(request: NextRequest) {
  if (!isBotAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? 5
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", issues: parsed.error.issues }, { status: 400 });
  }

  const messages = await claimPendingOutboundMessages(parsed.data.limit);
  return NextResponse.json({
    messages: messages.map((item) => ({
      id: item.id,
      waNumber: item.waNumber,
      messageText: item.messageText
    }))
  });
}
