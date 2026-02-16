import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getHeartbeatStatus } from "@/lib/services/system-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let dbStatus: "healthy" | "down" = "healthy";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "down";
  }

  let reportingStatus: "healthy" | "down" = "healthy";
  try {
    const response = await fetch(`${env.REPORTING_SERVICE_URL}/health`);
    if (!response.ok) reportingStatus = "down";
  } catch {
    reportingStatus = "down";
  }

  const botHeartbeat = await getHeartbeatStatus(env.BOT_HEARTBEAT_STALE_SECONDS);

  return NextResponse.json({
    dbStatus,
    reportingStatus,
    botHeartbeat,
    checkedAt: new Date().toISOString()
  });
}
