import type { ReportPeriod } from "@finance/shared";
import { logger } from "@/lib/logger";
import { formatMoney } from "@/lib/services/shared/money-format";
import { getPeriodRange } from "@/lib/services/reporting/aggregation";
import { buildMonthlyReportPdfAttachment } from "@/lib/services/reporting/monthly-report-pdf-service";
import {
  buildReportText,
  getUserReportData,
  type ReportComparisonRange,
  type ReportDateRange
} from "@/lib/services/reporting/report-service";

export type ReportResponse = {
  replyText: string;
  documentBase64?: string;
  documentMimeType?: string;
  documentFileName?: string;
};

type BuildReportParams =
  | ReportPeriod
  | {
      period: ReportPeriod;
      dateRange?: ReportDateRange | null;
      comparisonRange?: ReportComparisonRange | null;
    };

const buildDeltaLabel = (value: number) =>
  value > 0 ? `naik ${formatMoney(value)}` : value < 0 ? `turun ${formatMoney(Math.abs(value))}` : "stabil";

const isCalendarMonthlyRange = (dateRange: ReportDateRange) => {
  const sameMonth =
    dateRange.start.getUTCFullYear() === dateRange.end.getUTCFullYear() &&
    dateRange.start.getUTCMonth() === dateRange.end.getUTCMonth();
  if (!sameMonth) return false;

  const isMonthStart =
    dateRange.start.getUTCDate() === 1 &&
    dateRange.start.getUTCHours() === 0 &&
    dateRange.start.getUTCMinutes() === 0;
  const monthEnd = new Date(
    Date.UTC(dateRange.start.getUTCFullYear(), dateRange.start.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );
  const isMonthEnd = dateRange.end.getTime() === monthEnd.getTime();

  return isMonthStart && isMonthEnd;
};

const shouldAttachMonthlyPdf = (period: ReportPeriod, dateRange: ReportDateRange | null) => {
  if (period !== "monthly") return false;
  if (!dateRange) return true;
  return isCalendarMonthlyRange(dateRange);
};

const buildComparisonReportText = (params: {
  current: Awaited<ReturnType<typeof getUserReportData>>;
  previous: Awaited<ReturnType<typeof getUserReportData>>;
}) => {
  const currentSaving = params.current.savingTotal ?? 0;
  const previousSaving = params.previous.savingTotal ?? 0;
  const currentBalance = params.current.incomeTotal - params.current.expenseTotal - currentSaving;
  const previousBalance = params.previous.incomeTotal - params.previous.expenseTotal - previousSaving;
  const currentTopCategory = params.current.categoryBreakdown[0];
  const previousTopCategory = params.previous.categoryBreakdown[0];

  return [
    `Ringkasan ${params.current.periodLabel} dibanding ${params.previous.periodLabel}:`,
    `- Income sekarang: ${formatMoney(params.current.incomeTotal)}`,
    `- Expense sekarang: ${formatMoney(params.current.expenseTotal)}`,
    currentSaving > 0 ? `- Saving/goal sekarang: ${formatMoney(currentSaving)}` : null,
    `- Sisa sekarang: ${formatMoney(currentBalance)}`,
    `- Income sebelumnya: ${formatMoney(params.previous.incomeTotal)}`,
    `- Expense sebelumnya: ${formatMoney(params.previous.expenseTotal)}`,
    previousSaving > 0 ? `- Saving/goal sebelumnya: ${formatMoney(previousSaving)}` : null,
    `- Sisa sebelumnya: ${formatMoney(previousBalance)}`,
    `- Perubahan expense: ${buildDeltaLabel(params.current.expenseTotal - params.previous.expenseTotal)}`,
    `- Perubahan sisa: ${buildDeltaLabel(currentBalance - previousBalance)}`,
    currentTopCategory
      ? `- Top kategori sekarang: ${currentTopCategory.category} (${formatMoney(currentTopCategory.total)})`
      : null,
    previousTopCategory
      ? `- Top kategori sebelumnya: ${previousTopCategory.category} (${formatMoney(previousTopCategory.total)})`
      : null
  ]
    .filter(Boolean)
    .join("\n");
};

export const buildReportResponse = async (
  userId: string,
  paramsOrPeriod: BuildReportParams
): Promise<ReportResponse> => {
  const params =
    typeof paramsOrPeriod === "string" ? { period: paramsOrPeriod } : paramsOrPeriod;

  if (params.comparisonRange) {
    const [currentData, previousData] = await Promise.all([
      getUserReportData(userId, params.period, params.comparisonRange.current),
      getUserReportData(userId, params.period, params.comparisonRange.previous)
    ]);

    if (
      currentData.incomeTotal === 0 &&
      currentData.expenseTotal === 0 &&
      (currentData.savingTotal ?? 0) === 0 &&
      previousData.incomeTotal === 0 &&
      previousData.expenseTotal === 0 &&
      (previousData.savingTotal ?? 0) === 0
    ) {
      return {
        replyText: `Belum ada transaksi untuk report ${params.comparisonRange.current.label}.`
      };
    }

    return {
      replyText: buildComparisonReportText({
        current: currentData,
        previous: previousData
      })
    };
  }

  const reportData = await getUserReportData(userId, params.period, params.dateRange ?? null);
  const attachMonthlyPdf = shouldAttachMonthlyPdf(params.period, params.dateRange ?? null);
  const summaryText = buildReportText(
    params.period,
    reportData.incomeTotal,
    reportData.expenseTotal,
    reportData.categoryBreakdown,
    reportData.periodLabel,
    reportData.transactions,
    { includeTransactions: !attachMonthlyPdf, savingTotal: reportData.savingTotal ?? 0 }
  );

  if (reportData.incomeTotal === 0 && reportData.expenseTotal === 0 && (reportData.savingTotal ?? 0) === 0) {
    return {
      replyText: `Belum ada transaksi untuk report ${reportData.periodLabel}.`
    };
  }

  const resolvedDateRange =
    params.dateRange ??
    (() => {
      const range = getPeriodRange(params.period, new Date());
      return {
        ...range,
        label: reportData.periodLabel
      };
    })();

  if (attachMonthlyPdf) {
    try {
      const document = await buildMonthlyReportPdfAttachment({
        userId,
        dateRange: resolvedDateRange,
        reportData
      });
      return {
        replyText: `${summaryText}\n\nSaya lampirkan PDF report bulanan ya Boss.`,
        ...document
      };
    } catch (error) {
      logger.error({ err: error }, "Failed to generate monthly PDF report");
      return {
        replyText: `${summaryText}\n\nPDF report bulanan belum berhasil dibuat sementara.`
      };
    }
  }

  return { replyText: summaryText };
};

export const toReportReplyBody = (report: ReportResponse) => ({
  replyText: report.replyText,
  documentBase64: report.documentBase64,
  documentMimeType: report.documentMimeType,
  documentFileName: report.documentFileName
});
