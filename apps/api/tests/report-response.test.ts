import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  getUserReportData: vi.fn(),
  buildReportText: vi.fn(),
  buildMonthlyReportPdfAttachment: vi.fn()
}));

vi.mock("@/lib/services/reporting/report-service", () => ({
  getUserReportData: hoisted.getUserReportData,
  buildReportText: hoisted.buildReportText
}));

vi.mock("@/lib/services/reporting/monthly-report-pdf-service", () => ({
  buildMonthlyReportPdfAttachment: hoisted.buildMonthlyReportPdfAttachment
}));

import { buildReportResponse, toReportReplyBody } from "@/lib/features/inbound/report";

describe("report response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("attaches monthly PDF for full monthly reports", async () => {
    const dateRange = {
      start: new Date("2026-03-01T00:00:00.000Z"),
      end: new Date("2026-03-31T23:59:59.999Z"),
      label: "Maret 2026"
    };

    hoisted.getUserReportData.mockResolvedValue({
      period: "monthly",
      periodLabel: "Maret 2026",
      incomeTotal: 10000000,
      expenseTotal: 4500000,
      categoryBreakdown: [{ category: "Bills", total: 1750000 }],
      trend: []
    });
    hoisted.buildReportText.mockReturnValue("Ringkasan Maret 2026");
    hoisted.buildMonthlyReportPdfAttachment.mockResolvedValue({
      documentBase64: "JVBERi0x",
      documentMimeType: "application/pdf",
      documentFileName: "laporan-maret-2026.pdf"
    });

    const result = await buildReportResponse("user_1", {
      period: "monthly",
      dateRange
    });

    expect(hoisted.buildMonthlyReportPdfAttachment).toHaveBeenCalledWith({
      userId: "user_1",
      dateRange,
      reportData: expect.objectContaining({
        periodLabel: "Maret 2026",
        incomeTotal: 10000000,
        expenseTotal: 4500000
      })
    });
    expect(result.replyText).toContain("Ringkasan Maret 2026");
    expect(result.replyText).toContain("PDF report bulanan");
    expect(toReportReplyBody(result)).toEqual({
      replyText: result.replyText,
      documentBase64: "JVBERi0x",
      documentMimeType: "application/pdf",
      documentFileName: "laporan-maret-2026.pdf"
    });
  });

  it("keeps partial monthly ranges as text-only", async () => {
    hoisted.getUserReportData.mockResolvedValue({
      period: "monthly",
      periodLabel: "1-15 Maret 2026",
      incomeTotal: 6000000,
      expenseTotal: 2500000,
      categoryBreakdown: [{ category: "Food & Drink", total: 1000000 }],
      trend: []
    });
    hoisted.buildReportText.mockReturnValue("Ringkasan 1-15 Maret 2026");

    const result = await buildReportResponse("user_1", {
      period: "monthly",
      dateRange: {
        start: new Date("2026-03-01T00:00:00.000Z"),
        end: new Date("2026-03-15T23:59:59.999Z"),
        label: "1-15 Maret 2026"
      }
    });

    expect(hoisted.buildMonthlyReportPdfAttachment).not.toHaveBeenCalled();
    expect(result).toEqual({
      replyText: "Ringkasan 1-15 Maret 2026"
    });
  });

  it("keeps weekly reports as text-only", async () => {
    hoisted.getUserReportData.mockResolvedValue({
      period: "weekly",
      periodLabel: "minggu ini",
      incomeTotal: 5000000,
      expenseTotal: 1500000,
      categoryBreakdown: [{ category: "Entertainment", total: 350000 }],
      trend: []
    });
    hoisted.buildReportText.mockReturnValue("Ringkasan minggu ini");

    const result = await buildReportResponse("user_1", { period: "weekly" });

    expect(hoisted.buildMonthlyReportPdfAttachment).not.toHaveBeenCalled();
    expect(result).toEqual({
      replyText: "Ringkasan minggu ini"
    });
  });
});
