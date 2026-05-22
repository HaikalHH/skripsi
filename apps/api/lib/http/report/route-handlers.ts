import { reportPeriodSchema } from "@finance/shared";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findOrCreateUserByWaNumber } from "@/lib/services/user/identity";
import { buildReportText, getReportChartBase64, getUserReportData } from "@/lib/services/reporting/report-builder";


const requestSchema = z.object({
  waNumber: z.string().min(6),
  period: reportPeriodSchema
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const userResult = await findOrCreateUserByWaNumber(parsed.data.waNumber);
  const report = await getUserReportData(userResult.user.id, parsed.data.period);
  const summary = buildReportText(
    parsed.data.period,
    report.incomeTotal,
    report.expenseTotal,
    report.categoryBreakdown,
    report.periodLabel,
    report.transactions,
    {
      savingTotal: report.savingTotal ?? 0,
      categoryBudgets: report.categoryBudgets
    }
  );

  let imageBase64: string | undefined;
  if (report.incomeTotal > 0 || report.expenseTotal > 0) {
    imageBase64 = await getReportChartBase64(report).catch(() => undefined);
  }

  return NextResponse.json({
    period: parsed.data.period,
    summary,
    imageBase64,
    report
  });
}
