import { reportingChartRequestSchema, type ReportPeriod } from "@finance/shared";
import { env } from "@/lib/env";

export const getReportChartBase64 = async (reportData: {
  period: ReportPeriod;
  incomeTotal: number;
  expenseTotal: number;
  categoryBreakdown: Array<{ category: string; total: number }>;
  trend: Array<{ date: string; income: number; expense: number }>;
}) => {
  const payload = reportingChartRequestSchema.parse(reportData);
  const response = await fetch(`${env.REPORTING_SERVICE_URL}/charts/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Reporting service error: ${response.status} ${errorBody}`);
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());
  return imageBuffer.toString("base64");
};
