import type { ReportPeriod } from "@finance/shared";
import { logger } from "@/lib/logger";
import { buildReportText, getReportChartBase64, getUserReportData } from "@/lib/services/report-service";

export type ReportResponse = {
  replyText: string;
  imageBase64?: string;
};

export const buildReportResponse = async (
  userId: string,
  period: ReportPeriod
): Promise<ReportResponse> => {
  const reportData = await getUserReportData(userId, period);
  const summaryText = buildReportText(
    period,
    reportData.incomeTotal,
    reportData.expenseTotal,
    reportData.categoryBreakdown
  );

  if (reportData.incomeTotal === 0 && reportData.expenseTotal === 0) {
    return {
      replyText: `Belum ada transaksi untuk report ${period}.`,
      imageBase64: undefined
    };
  }

  try {
    const imageBase64 = await getReportChartBase64(reportData);
    return { replyText: summaryText, imageBase64 };
  } catch (error) {
    logger.error({ err: error }, "Failed to generate chart image");
    return { replyText: `${summaryText} (Chart unavailable sementara.)`, imageBase64: undefined };
  }
};

export const toReportReplyBody = (report: ReportResponse) => ({
  replyText: report.replyText,
  imageBase64: report.imageBase64,
  imageMimeType: report.imageBase64 ? "image/png" : undefined
});
