import type { ReportPeriod } from "@finance/shared";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/services/shared/money";
import { getPeriodRange } from "@/lib/services/reporting/transaction-summary";
import { buildMonthlyReportPdfAttachment } from "@/lib/services/reporting/monthly-pdf";
import {
  buildFinancialCycleDateRange,
  buildMonthToDateRange,
  buildReportText,
  getUserReportData,
  type ReportComparisonRange,
  type ReportDateRange
} from "@/lib/services/reporting/report-builder";
import { buildExplicitRangeLabel } from "@/lib/services/reporting/report-builder/date-ranges";
import type { ReportRangeMode } from "@/lib/services/assistant/commands/slash-command-parser";

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
    reportMode?: ReportRangeMode;
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

const shouldAttachMonthlyPdf = (
  period: ReportPeriod,
  dateRange: ReportDateRange | null,
  hasExplicitDateRange: boolean
) => {
  if (period !== "monthly") return false;
  if (hasExplicitDateRange && dateRange) return isCalendarMonthlyRange(dateRange);
  return true;
};

const getUserFinancialCycleStartDay = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { salaryDate: true }
  });
  return user?.salaryDate ?? null;
};

const resolveMonthlyReportRange = async (params: {
  userId: string;
  reportMode: ReportRangeMode | undefined;
  dateRange: ReportDateRange | null | undefined;
}) => {
  if (params.dateRange) {
    return {
      dateRange: params.dateRange,
      cycleStartDay: null as number | null,
      note: null as string | null
    };
  }

  if (params.reportMode === "calendar") {
    return {
      dateRange: buildMonthToDateRange(new Date()),
      cycleStartDay: null,
      note: null
    };
  }

  const cycleStartDay = await getUserFinancialCycleStartDay(params.userId);
  if (cycleStartDay && cycleStartDay >= 1 && cycleStartDay <= 31) {
    return {
      dateRange: buildFinancialCycleDateRange(cycleStartDay, new Date()),
      cycleStartDay,
      note:
        params.reportMode === "financial_cycle" || params.reportMode === "default"
          ? `Berdasarkan siklus gajian Boss setiap tanggal ${cycleStartDay}.`
          : null
    };
  }

  return {
    dateRange: buildMonthToDateRange(new Date()),
    cycleStartDay: null,
    note:
      params.reportMode === "financial_cycle"
        ? "Tanggal mulai siklus gajian belum diset, jadi sementara saya pakai bulan kalender."
        : null
  };
};

const buildFinancialComparisonRange = (
  currentRange: ReportDateRange,
  cycleStartDay: number | null
): ReportComparisonRange => {
  if (cycleStartDay && cycleStartDay >= 1 && cycleStartDay <= 31) {
    const prevStart = new Date(
      Date.UTC(
        currentRange.start.getUTCFullYear(),
        currentRange.start.getUTCMonth() - 1,
        currentRange.start.getUTCDate(),
        0, 0, 0, 0
      )
    );
    const prevEnd = new Date(currentRange.start.getTime() - 1);
    return {
      current: currentRange,
      previous: {
        start: prevStart,
        end: prevEnd,
        label: buildExplicitRangeLabel(prevStart, prevEnd)
      }
    };
  }

  const DAY_MS = 24 * 60 * 60 * 1000;
  const daySpan = Math.max(
    1,
    Math.round(
      (new Date(currentRange.end.getUTCFullYear(), currentRange.end.getUTCMonth(), currentRange.end.getUTCDate()).getTime() -
        new Date(currentRange.start.getUTCFullYear(), currentRange.start.getUTCMonth(), currentRange.start.getUTCDate()).getTime()) /
      DAY_MS
    ) + 1
  );
  const prevEnd = new Date(currentRange.start.getTime() - 1);
  const prevStart = new Date(currentRange.start.getTime() - daySpan * DAY_MS);
  return {
    current: currentRange,
    previous: {
      start: prevStart,
      end: prevEnd,
      label: buildExplicitRangeLabel(prevStart, prevEnd)
    }
  };
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
  const expenseDelta = params.current.expenseTotal - params.previous.expenseTotal;
  const balanceDelta = currentBalance - previousBalance;
  const expensePercentText =
    params.previous.expenseTotal > 0
      ? ` (${expenseDelta > 0 ? "+" : ""}${((expenseDelta / params.previous.expenseTotal) * 100).toFixed(1)}%)`
      : "";

  return [
    `Perbandingan ${params.current.periodLabel} vs ${params.previous.periodLabel}:`,
    "",
    `Bulan ini (${params.current.periodLabel}):`,
    `- Income: ${formatMoney(params.current.incomeTotal)}`,
    `- Expense: ${formatMoney(params.current.expenseTotal)}`,
    currentSaving > 0 ? `- Saving/goal: ${formatMoney(currentSaving)}` : null,
    `- Sisa: ${formatMoney(currentBalance)}`,
    currentTopCategory
      ? `- Top kategori: ${currentTopCategory.category} (${formatMoney(currentTopCategory.total)})`
      : "- Top kategori: -",
    "",
    `Bulan lalu (${params.previous.periodLabel}):`,
    `- Income: ${formatMoney(params.previous.incomeTotal)}`,
    `- Expense: ${formatMoney(params.previous.expenseTotal)}`,
    previousSaving > 0 ? `- Saving/goal: ${formatMoney(previousSaving)}` : null,
    `- Sisa: ${formatMoney(previousBalance)}`,
    previousTopCategory
      ? `- Top kategori: ${previousTopCategory.category} (${formatMoney(previousTopCategory.total)})`
      : "- Top kategori: -",
    "",
    "Perubahan:",
    `- Expense: ${buildDeltaLabel(expenseDelta)}${expensePercentText}`,
    `- Sisa: ${buildDeltaLabel(balanceDelta)}`
  ]
    .filter((line) => line !== null)
    .join("\n");
};

export const buildReportResponse = async (
  userId: string,
  paramsOrPeriod: BuildReportParams
): Promise<ReportResponse> => {
  const params =
    typeof paramsOrPeriod === "string" ? { period: paramsOrPeriod } : paramsOrPeriod;

  if (params.comparisonRange) {
    let resolvedComparison = params.comparisonRange;
    if (params.period === "monthly" && !params.dateRange) {
      const resolved = await resolveMonthlyReportRange({
        userId,
        reportMode: (params as { reportMode?: ReportRangeMode }).reportMode,
        dateRange: null
      });
      resolvedComparison = buildFinancialComparisonRange(resolved.dateRange, resolved.cycleStartDay);
    }

    const [currentData, previousData] = await Promise.all([
      getUserReportData(userId, params.period, resolvedComparison.current),
      getUserReportData(userId, params.period, resolvedComparison.previous)
    ]);

    const currentEmpty =
      currentData.incomeTotal === 0 &&
      currentData.expenseTotal === 0 &&
      (currentData.savingTotal ?? 0) === 0;

    const previousEmpty =
      previousData.incomeTotal === 0 &&
      previousData.expenseTotal === 0 &&
      (previousData.savingTotal ?? 0) === 0;

    if (currentEmpty && previousEmpty) {
      return {
        replyText: `Belum ada transaksi untuk report ${resolvedComparison.current.label}.`
      };
    }

    if (previousEmpty) {
      return {
        replyText: [
          `Bulan lalu (${resolvedComparison.previous.label}) tidak ada transaksi yang tercatat.`,
          `Jadi tidak bisa dibandingkan dengan bulan ini (${resolvedComparison.current.label}).`,
          "",
          `Ringkasan bulan ini (${resolvedComparison.current.label}):`,
          `- Income: ${formatMoney(currentData.incomeTotal)}`,
          `- Expense: ${formatMoney(currentData.expenseTotal)}`,
          (currentData.savingTotal ?? 0) > 0
            ? `- Saving/goal: ${formatMoney(currentData.savingTotal ?? 0)}`
            : null,
          `- Sisa: ${formatMoney(currentData.incomeTotal - currentData.expenseTotal - (currentData.savingTotal ?? 0))}`
        ].filter((line) => line !== null).join("\n")
      };
    }

    if (currentEmpty) {
      return {
        replyText: [
          `Bulan ini (${resolvedComparison.current.label}) belum ada transaksi yang tercatat.`,
          `Tidak bisa dibandingkan dengan bulan lalu (${resolvedComparison.previous.label}).`
        ].join("\n")
      };
    }

    return {
      replyText: buildComparisonReportText({
        current: currentData,
        previous: previousData
      })
    };
  }

  const resolvedMonthlyRange =
    params.period === "monthly"
      ? await resolveMonthlyReportRange({
        userId,
        reportMode: params.reportMode,
        dateRange: params.dateRange ?? null
      })
      : { dateRange: params.dateRange ?? null, note: null };
  const reportData = await getUserReportData(userId, params.period, resolvedMonthlyRange.dateRange);
  const attachMonthlyPdf = shouldAttachMonthlyPdf(
    params.period,
    resolvedMonthlyRange.dateRange,
    Boolean(params.dateRange)
  );
  const summaryText = buildReportText(
    params.period,
    reportData.incomeTotal,
    reportData.expenseTotal,
    reportData.categoryBreakdown,
    reportData.periodLabel,
    reportData.transactions,
    {
      includeTransactions: !attachMonthlyPdf,
      savingTotal: reportData.savingTotal ?? 0,
      categoryBudgets: reportData.categoryBudgets
    }
  );

  if (reportData.incomeTotal === 0 && reportData.expenseTotal === 0 && (reportData.savingTotal ?? 0) === 0) {
    return {
      replyText: [
        `Belum ada transaksi untuk report ${reportData.periodLabel}.`,
        resolvedMonthlyRange.note
      ].filter(Boolean).join("\n")
    };
  }

  const resolvedDateRange =
    resolvedMonthlyRange.dateRange ??
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
        replyText: [summaryText, resolvedMonthlyRange.note, "Saya lampirkan PDF report bulanan ya Boss."]
          .filter(Boolean)
          .join("\n\n"),
        ...document
      };
    } catch (error) {
      logger.error({ err: error }, "Failed to generate monthly PDF report");
      return {
        replyText: [summaryText, resolvedMonthlyRange.note, "PDF report bulanan belum berhasil dibuat sementara."]
          .filter(Boolean)
          .join("\n\n")
      };
    }
  }

  return { replyText: [summaryText, resolvedMonthlyRange.note].filter(Boolean).join("\n\n") };
};

export const toReportReplyBody = (report: ReportResponse) => ({
  replyText: report.replyText,
  documentBase64: report.documentBase64,
  documentMimeType: report.documentMimeType,
  documentFileName: report.documentFileName
});
