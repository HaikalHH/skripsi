import { describe, expect, it } from "vitest";
import { routeGlobalTextContext } from "@/lib/services/assistant/global-context-router-service";

describe("global context router service", () => {
  it("parses flexible budget command", () => {
    const route = routeGlobalTextContext("budget makan sekitar 2 juta per bulan");
    expect(route.command).toEqual({
      kind: "BUDGET_SET",
      category: "makan",
      monthlyLimit: 2000000
    });
  });

  it("parses flexible goal commands", () => {
    expect(routeGlobalTextContext("mau nabung 50 juta").command).toEqual({
      kind: "GOAL_SET",
      targetAmount: 50000000,
      goalName: null,
      goalType: null
    });
    expect(routeGlobalTextContext("status tabungan aku gimana").command).toEqual({
      kind: "GOAL_STATUS",
      goalQuery: null,
      goalType: null
    });
    expect(routeGlobalTextContext("target rumah 800 juta").command).toEqual({
      kind: "GOAL_SET",
      targetAmount: 800000000,
      goalName: "Beli Rumah",
      goalType: "HOUSE"
    });
    expect(routeGlobalTextContext("status goal rumah gimana").command).toEqual({
      kind: "GOAL_STATUS",
      goalQuery: "Beli Rumah",
      goalType: "HOUSE"
    });
    expect(routeGlobalTextContext("setor 500rb ke rumah").command).toEqual({
      kind: "GOAL_CONTRIBUTE",
      amount: 500000,
      goalQuery: "Beli Rumah",
      goalType: "HOUSE"
    });
    expect(routeGlobalTextContext("nabung untuk dana darurat 1 juta").command).toEqual({
      kind: "GOAL_CONTRIBUTE",
      amount: 1000000,
      goalQuery: "Dana Darurat",
      goalType: "EMERGENCY_FUND"
    });
    expect(routeGlobalTextContext("kalau fokus rumah 6 bulan dulu gimana").command).toEqual({
      kind: "GOAL_PLAN",
      mode: "FOCUS_DURATION",
      goalQuery: "Beli Rumah",
      goalType: "HOUSE",
      focusMonths: 6
    });
    expect(routeGlobalTextContext("kalau tabungan dibagi 60:40 hasilnya gimana").command).toEqual({
      kind: "GOAL_PLAN",
      mode: "SPLIT_RATIO",
      goalQuery: null,
      goalType: null,
      splitRatio: {
        primary: 60,
        secondary: 40
      }
    });
    expect(routeGlobalTextContext("kalau expense naik 5% per tahun target mundur berapa").command).toEqual({
      kind: "GOAL_PLAN",
      mode: "EXPENSE_GROWTH",
      goalQuery: null,
      goalType: null,
      annualExpenseGrowthRate: 5
    });
  });

  it("parses report and advice intents from natural language", () => {
    expect(routeGlobalTextContext("laporan minggu ini dong").command).toEqual({
      kind: "REPORT",
      period: "weekly"
    });
    expect(routeGlobalTextContext("detail entertainment bulan ini apa saja").command).toEqual({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Entertainment",
      filterText: null,
      mode: "LIST",
      limit: null,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("entertainment terbesar bulan ini apa").command).toEqual({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Entertainment",
      filterText: null,
      mode: "TOP",
      limit: null,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("spotify bulan ini total berapa").command).toEqual({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Entertainment",
      filterText: "spotify",
      mode: "TOTAL",
      limit: null,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("laporan entertainment bulan ini").command).toEqual({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Entertainment",
      filterText: null,
      mode: "LIST",
      limit: null,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("rincian bills yang internet aja").command).toEqual({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Bills",
      filterText: "internet",
      mode: "LIST",
      limit: null,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("entertainment naik dibanding minggu lalu gak").command).toEqual({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "weekly",
      category: "Entertainment",
      filterText: null,
      mode: "COMPARE_PREVIOUS",
      limit: null,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("spotify naik berapa persen dibanding bulan lalu").command).toEqual({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Entertainment",
      filterText: "spotify",
      mode: "COMPARE_PREVIOUS",
      limit: null,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("spotify rata-rata per bulan berapa").command).toEqual({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Entertainment",
      filterText: "spotify",
      mode: "AVERAGE_MONTHLY",
      limit: null,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("spotify kontribusinya berapa persen dari entertainment bulan ini").command).toEqual({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Entertainment",
      filterText: "spotify",
      mode: "SHARE_OF_BUCKET",
      limit: null,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("rata-rata spending bills per minggu").command).toEqual({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Bills",
      filterText: null,
      mode: "AVERAGE_WEEKLY",
      limit: null,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("3 merchant entertainment terbesar bulan ini apa aja").command).toEqual({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Entertainment",
      filterText: null,
      mode: "TOP_MERCHANTS",
      limit: 3,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("merchant entertainment paling sering bulan ini").command).toEqual({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Entertainment",
      filterText: null,
      mode: "TOP_MERCHANTS_BY_COUNT",
      limit: 3,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("merchant bills paling rutin 6 bulan terakhir").command).toEqual({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Bills",
      filterText: null,
      mode: "TOP_MERCHANTS_BY_COUNT",
      limit: 3,
      rangeWindow: {
        unit: "month",
        count: 6
      }
    });
    expect(routeGlobalTextContext("top 5 merchant bills 3 bulan terakhir").command).toEqual({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Bills",
      filterText: null,
      mode: "TOP_MERCHANTS",
      limit: 5,
      rangeWindow: {
        unit: "month",
        count: 3
      }
    });
    expect(routeGlobalTextContext("kenapa entertainment naik bulan ini").command).toEqual({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Entertainment",
      filterText: null,
      mode: "EXPLAIN_CHANGE",
      limit: null,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("yang bikin bills naik apa").command).toEqual({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Bills",
      filterText: null,
      mode: "EXPLAIN_CHANGE",
      limit: null,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("kategori mana yang paling naik dibanding bulan lalu").command).toMatchObject({
      kind: "GENERAL_ANALYTICS_REPORT",
      mode: "TOP_CATEGORY_INCREASE",
      period: "monthly",
      limit: null,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("selisih terbesar datang dari merchant mana").command).toEqual({
      kind: "GENERAL_ANALYTICS_REPORT",
      mode: "TOP_MERCHANT_DELTA",
      period: "monthly",
      limit: 5,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("top recurring expense bulan ini").command).toEqual({
      kind: "GENERAL_ANALYTICS_REPORT",
      mode: "TOP_RECURRING_EXPENSES",
      period: "monthly",
      limit: 5,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("merchant baru bulan ini apa aja").command).toMatchObject({
      kind: "GENERAL_ANALYTICS_REPORT",
      mode: "NEW_MERCHANTS",
      period: "monthly"
    });
    expect(routeGlobalTextContext("weekend lebih boros gak").command).toMatchObject({
      kind: "GENERAL_ANALYTICS_REPORT",
      mode: "WEEKEND_VS_WEEKDAY",
      period: "monthly"
    });
    expect(routeGlobalTextContext("kebiasaan bocor halus aku apa").command).toMatchObject({
      kind: "GENERAL_ANALYTICS_REPORT",
      mode: "HABIT_LEAKS",
      period: "monthly"
    });
    expect(routeGlobalTextContext("gue masih kuat sampe gajian gak").command).toEqual({
      kind: "CASHFLOW_FORECAST",
      horizon: "PAYDAY",
      mode: "SAFETY"
    });
    expect(routeGlobalTextContext("ujung bulan kira-kira sisa uang berapa").command).toEqual({
      kind: "CASHFLOW_FORECAST",
      horizon: "MONTH_END",
      mode: "REMAINING"
    });
    expect(routeGlobalTextContext("pekan depan masih aman ga").command).toEqual({
      kind: "CASHFLOW_FORECAST",
      horizon: "NEXT_7_DAYS",
      mode: "SAFETY"
    });
    expect(routeGlobalTextContext("weekend ini masih aman gak").command).toEqual({
      kind: "CASHFLOW_FORECAST",
      horizon: "WEEKEND",
      mode: "SAFETY"
    });
    expect(routeGlobalTextContext("besok sisa uang kira-kira berapa").command).toEqual({
      kind: "CASHFLOW_FORECAST",
      horizon: "TOMORROW",
      mode: "REMAINING"
    });
    expect(routeGlobalTextContext("kalau bayar cicilan 1 juta besok masih aman gak").command).toEqual({
      kind: "CASHFLOW_FORECAST",
      horizon: "TOMORROW",
      mode: "SAFETY",
      scenarioExpenseAmount: 1000000,
      scenarioExpenseLabel: "cicilan"
    });
    expect(routeGlobalTextContext("kasih liat isi entertainment bulan ini").command).toEqual({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Entertainment",
      filterText: null,
      mode: "LIST",
      limit: null,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("spotify nyumbang berapa persen ke entertainment bulan ini").command).toEqual({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Entertainment",
      filterText: "spotify",
      mode: "SHARE_OF_BUCKET",
      limit: null,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("merchant entertainment yang paling sering kepake bulan ini").command).toEqual({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Entertainment",
      filterText: null,
      mode: "TOP_MERCHANTS_BY_COUNT",
      limit: 3,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("kategori apa yang lonjakannya paling besar dibanding bulan lalu").command).toMatchObject({
      kind: "GENERAL_ANALYTICS_REPORT",
      mode: "TOP_CATEGORY_INCREASE",
      period: "monthly",
      limit: null,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("merchant apa yang paling ngedorong kenaikan spending").command).toEqual({
      kind: "GENERAL_ANALYTICS_REPORT",
      mode: "TOP_MERCHANT_DELTA",
      period: "monthly",
      limit: 5,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("langganan rutin bulan ini apa aja").command).toEqual({
      kind: "GENERAL_ANALYTICS_REPORT",
      mode: "TOP_RECURRING_EXPENSES",
      period: "monthly",
      limit: 5,
      rangeWindow: null
    });
    expect(routeGlobalTextContext("keuangan aku sehat gak bulan ini?").command).toEqual({
      kind: "ADVICE",
      question: "keuangan aku sehat gak bulan ini?"
    });
  });

  it("prioritizes transaction mutation", () => {
    const route = routeGlobalTextContext("hapus transaksi listrik yang tadi");
    expect(route.moduleOrder[0]).toBe("TRANSACTION_MUTATION");
  });

  it("parses explicit date ranges and comparison windows", () => {
    const now = new Date();
    const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long" })
      .format(now)
      .toLowerCase();
    const monthWithYearLabel = new Intl.DateTimeFormat("id-ID", {
      month: "long",
      year: "numeric"
    }).format(now);

    const monthlyRoute = routeGlobalTextContext(`spotify ${monthLabel} ${now.getUTCFullYear()} total berapa`);
    expect(monthlyRoute.command).toMatchObject({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Entertainment",
      filterText: "spotify",
      mode: "TOTAL",
      rangeWindow: null
    });
    if (monthlyRoute.command.kind !== "CATEGORY_DETAIL_REPORT" || !monthlyRoute.command.dateRange) {
      throw new Error("Expected explicit monthly date range");
    }
    expect(monthlyRoute.command.dateRange.label).toBe(monthWithYearLabel);
    expect(monthlyRoute.command.dateRange.start).toEqual(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
    );
    expect(monthlyRoute.command.dateRange.end).toEqual(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999))
    );

    const daySpanRoute = routeGlobalTextContext(`entertainment 1-15 ${monthLabel} ${now.getUTCFullYear()} berapa`);
    expect(daySpanRoute.command).toMatchObject({
      kind: "CATEGORY_DETAIL_REPORT",
      period: "monthly",
      category: "Entertainment",
      filterText: null,
      mode: "TOTAL",
      rangeWindow: null
    });
    if (daySpanRoute.command.kind !== "CATEGORY_DETAIL_REPORT" || !daySpanRoute.command.dateRange) {
      throw new Error("Expected explicit day-span date range");
    }
    expect(daySpanRoute.command.dateRange.label).toBe(`1-15 ${monthWithYearLabel}`);
    expect(daySpanRoute.command.dateRange.start).toEqual(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
    );
    expect(daySpanRoute.command.dateRange.end).toEqual(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15, 23, 59, 59, 999))
    );

    const comparisonRoute = routeGlobalTextContext(
      "kategori mana yang paling naik 3 bulan terakhir vs 3 bulan sebelumnya"
    );
    expect(comparisonRoute.command).toMatchObject({
      kind: "GENERAL_ANALYTICS_REPORT",
      mode: "TOP_CATEGORY_INCREASE",
      period: "monthly",
      rangeWindow: {
        unit: "month",
        count: 3
      }
    });
    if (
      comparisonRoute.command.kind !== "GENERAL_ANALYTICS_REPORT" ||
      !comparisonRoute.command.comparisonRange
    ) {
      throw new Error("Expected comparison range for custom window");
    }
    expect(comparisonRoute.command.comparisonRange.current.label).toBe("3 bulan terakhir");
    expect(comparisonRoute.command.comparisonRange.previous.label).toBe("3 bulan sebelumnya");

    const monthlyGeneralReport = routeGlobalTextContext(`laporan ${monthLabel} ${now.getUTCFullYear()}`);
    expect(monthlyGeneralReport.command).toMatchObject({
      kind: "REPORT",
      period: "monthly"
    });
    if (monthlyGeneralReport.command.kind !== "REPORT" || !monthlyGeneralReport.command.dateRange) {
      throw new Error("Expected explicit monthly report date range");
    }
    expect(monthlyGeneralReport.command.dateRange.label).toBe(monthWithYearLabel);

    const daySpanGeneralReport = routeGlobalTextContext(`summary 1-15 ${monthLabel} ${now.getUTCFullYear()}`);
    expect(daySpanGeneralReport.command).toMatchObject({
      kind: "REPORT",
      period: "monthly"
    });
    if (daySpanGeneralReport.command.kind !== "REPORT" || !daySpanGeneralReport.command.dateRange) {
      throw new Error("Expected explicit day-span report date range");
    }
    expect(daySpanGeneralReport.command.dateRange.label).toBe(`1-15 ${monthWithYearLabel}`);

    const comparisonGeneralReport = routeGlobalTextContext("laporan 3 bulan terakhir vs 3 bulan sebelumnya");
    expect(comparisonGeneralReport.command).toMatchObject({
      kind: "REPORT",
      period: "monthly"
    });
    if (comparisonGeneralReport.command.kind !== "REPORT" || !comparisonGeneralReport.command.comparisonRange) {
      throw new Error("Expected comparison range for general report");
    }
    expect(comparisonGeneralReport.command.comparisonRange.current.label).toBe("3 bulan terakhir");
    expect(comparisonGeneralReport.command.comparisonRange.previous.label).toBe("3 bulan sebelumnya");
  });

  it("prioritizes market, news, projection, and portfolio contexts", () => {
    expect(routeGlobalTextContext("btc sekarang berapa").moduleOrder[0]).toBe("MARKET");
    expect(routeGlobalTextContext("berita finance pagi ini").moduleOrder[0]).toBe("NEWS");
    expect(
      routeGlobalTextContext("kalau invest 3 juta tiap bulan 10 tahun hasilnya berapa").moduleOrder[0]
    ).toBe("WEALTH_PROJECTION");
    expect(
      routeGlobalTextContext("kalau invest 3 juta per bulan target 1 miliar kapan tercapai")
        .moduleOrder[0]
    ).toBe("WEALTH_PROJECTION");
    expect(routeGlobalTextContext("tambah saham bbca 10 lot harga 9000").moduleOrder[0]).toBe(
      "PORTFOLIO"
    );
    expect(routeGlobalTextContext("beli emas 2 gram harga 1800000").moduleOrder[0]).toBe("PORTFOLIO");
    expect(routeGlobalTextContext("tambah tabungan 5 juta").moduleOrder[0]).toBe("PORTFOLIO");
    expect(routeGlobalTextContext("perlu rebalance gak").moduleOrder[0]).toBe("PORTFOLIO");
  });

  it("parses advanced date ranges and new planner commands", () => {
    const quarterReport = routeGlobalTextContext("laporan q1 2026");
    expect(quarterReport.command).toMatchObject({
      kind: "REPORT",
      period: "monthly"
    });
    if (quarterReport.command.kind !== "REPORT" || !quarterReport.command.dateRange) {
      throw new Error("Expected quarter report date range");
    }
    expect(quarterReport.command.dateRange.label).toBe("Q1 2026");
    expect(quarterReport.command.dateRange.start).toEqual(
      new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0))
    );
    expect(quarterReport.command.dateRange.end).toEqual(
      new Date(Date.UTC(2026, 2, 31, 23, 59, 59, 999))
    );

    const semesterDetail = routeGlobalTextContext("detail entertainment semester 1 2026");
    expect(semesterDetail.command).toMatchObject({
      kind: "CATEGORY_DETAIL_REPORT",
      category: "Entertainment",
      mode: "LIST"
    });
    if (semesterDetail.command.kind !== "CATEGORY_DETAIL_REPORT" || !semesterDetail.command.dateRange) {
      throw new Error("Expected semester date range");
    }
    expect(semesterDetail.command.dateRange.label).toBe("Semester 1 2026");

    const monthToDate = routeGlobalTextContext("summary awal bulan sampai sekarang");
    expect(monthToDate.command).toMatchObject({
      kind: "REPORT",
      period: "monthly"
    });
    if (monthToDate.command.kind !== "REPORT" || !monthToDate.command.dateRange) {
      throw new Error("Expected month-to-date range");
    }
    expect(monthToDate.command.dateRange.start.getUTCDate()).toBe(1);

    expect(routeGlobalTextContext("kalau fokus rumah dulu gimana").command).toEqual({
      kind: "GOAL_PLAN",
      mode: "FOCUS",
      goalQuery: "Beli Rumah",
      goalType: "HOUSE"
    });
    expect(routeGlobalTextContext("tabungan bulan ini paling baik dibagi ke target apa").command).toEqual({
      kind: "GOAL_PLAN",
      mode: "SPLIT",
      goalQuery: null,
      goalType: null
    });
    expect(routeGlobalTextContext("target mana yang paling realistis dulu").command).toEqual({
      kind: "GOAL_PLAN",
      mode: "PRIORITY",
      goalQuery: null,
      goalType: null
    });

    expect(routeGlobalTextContext("matikan reminder budget").command).toEqual({
      kind: "REMINDER_PREFERENCE",
      command: {
        action: "UPDATE",
        updates: {
          budgetEnabled: false
        }
      }
    });
    expect(routeGlobalTextContext("status reminder aku").command).toEqual({
      kind: "REMINDER_PREFERENCE",
      command: {
        action: "STATUS"
      }
    });
    expect(routeGlobalTextContext("batasi reminder 2 per hari").command).toEqual({
      kind: "REMINDER_PREFERENCE",
      command: {
        action: "UPDATE",
        updates: {
          maxPerDay: 2
        }
      }
    });

    const healthCommand = routeGlobalTextContext("closing januari 2026");
    expect(healthCommand.command).toMatchObject({
      kind: "FINANCIAL_HEALTH",
      mode: "CLOSING",
      period: "monthly"
    });
    if (healthCommand.command.kind !== "FINANCIAL_HEALTH" || !healthCommand.command.dateRange) {
      throw new Error("Expected closing date range");
    }
    expect(healthCommand.command.dateRange.label).toBe("Januari 2026");
  });
});

