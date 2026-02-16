import { buildReportSummaryText, reportPeriodSchema, reportingChartRequestSchema } from "@finance/shared";
import type { ReportPeriod } from "@finance/shared";
import { prisma } from "../prisma";
import { env } from "../env";
import { aggregateTransactions, getPeriodRange } from "./aggregation";

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

export const parseReportPeriod = (value: string | null | undefined): ReportPeriod => {
  if (!value) return "monthly";
  const parsed = reportPeriodSchema.safeParse(value.toLowerCase());
  if (!parsed.success) return "monthly";
  return parsed.data;
};

export const getUserReportData = async (userId: string, period: ReportPeriod) => {
  const range = getPeriodRange(period, new Date());
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      occurredAt: {
        gte: range.start,
        lte: range.end
      }
    },
    orderBy: { occurredAt: "asc" }
  });

  const aggregated = aggregateTransactions(
    transactions.map((tx) => ({
      type: tx.type,
      amount: toNumber(tx.amount),
      category: tx.category,
      occurredAt: tx.occurredAt
    })),
    range
  );

  return {
    period,
    ...aggregated
  };
};

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

export const buildReportText = (
  period: ReportPeriod,
  incomeTotal: number,
  expenseTotal: number,
  categoryBreakdown: Array<{ category: string; total: number }>
) => {
  const topCategory = categoryBreakdown[0];
  const topCategoryText = topCategory
    ? `Top expense category: ${topCategory.category} (${topCategory.total.toFixed(2)}).`
    : "No expense category data.";

  return `${buildReportSummaryText(period, incomeTotal, expenseTotal)} ${topCategoryText}`;
};
