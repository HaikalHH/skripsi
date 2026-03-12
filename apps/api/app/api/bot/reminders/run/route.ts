import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runProactiveReminders } from "@/lib/services/reminders/reminder-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isBotAuthorized = (request: NextRequest) =>
  request.headers.get("x-bot-token") === env.BOT_INTERNAL_TOKEN;

export async function POST(request: NextRequest) {
  if (!isBotAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runProactiveReminders(new Date());
  return NextResponse.json({
    ok: true,
    ...result
  });
}
