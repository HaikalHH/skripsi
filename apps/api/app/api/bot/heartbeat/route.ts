import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { upsertHeartbeat } from "@/lib/services/system-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const heartbeatSchema = z.object({
  serviceName: z.string().min(2).default("bot")
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = heartbeatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, issues: parsed.error.issues }, { status: 400 });
  }

  await upsertHeartbeat(parsed.data.serviceName);
  return NextResponse.json({ ok: true });
}
