import { NextRequest, NextResponse } from "next/server";
import { processInboundBody } from "@/lib/features/inbound";
import { logger } from "@/lib/logger";
import { styleBotReplyPayload } from "@/lib/services/messaging/bot-text-style-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_TEXT =
  "Maaf, saya belum bisa memproses pesan Anda sekarang. Coba lagi beberapa saat lagi atau ketik /help.";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await processInboundBody(body);
    return NextResponse.json(styleBotReplyPayload(result.body), { status: result.status });
  } catch (error) {
    logger.error({ err: error }, "Inbound processing failed");
    return NextResponse.json(styleBotReplyPayload({ replyText: FALLBACK_TEXT }), { status: 500 });
  }
}
