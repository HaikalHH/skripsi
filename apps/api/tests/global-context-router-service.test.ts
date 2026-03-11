import { describe, expect, it } from "vitest";
import { routeGlobalTextContext } from "@/lib/services/global-context-router-service";

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
      targetAmount: 50000000
    });
    expect(routeGlobalTextContext("status tabungan aku gimana").command).toEqual({
      kind: "GOAL_STATUS"
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
    expect(routeGlobalTextContext("kategori mana yang paling naik dibanding bulan lalu").command).toEqual({
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
    expect(routeGlobalTextContext("kategori apa yang lonjakannya paling besar dibanding bulan lalu").command).toEqual({
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
    expect(routeGlobalTextContext("tambah tabungan 5 juta").moduleOrder[0]).toBe("PORTFOLIO");
  });
});
