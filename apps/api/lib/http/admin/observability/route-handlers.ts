import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { getIntentObservabilitySummary } from "@/lib/services/observability/observability-service";


export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const daysParam = Number(request.nextUrl.searchParams.get("days") ?? "7");
  const summary = await getIntentObservabilitySummary(daysParam);

  return NextResponse.json(summary);
}
