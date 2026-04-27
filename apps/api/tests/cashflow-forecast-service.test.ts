import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  user: {
    id: "user_1",
    salaryDate: 25 as number | null
  } as { id: string; salaryDate: number | null },
  profile: {
    activeIncomeMonthly: BigInt(6000000),
    passiveIncomeMonthly: BigInt(0),
    monthlyIncomeTotal: BigInt(6000000),
    monthlyExpenseTotal: BigInt(3000000)
  },
  liquidAssets: [{ estimatedValue: BigInt(500000) }],
  transactions: [
    {
      id: "tx_1",
      userId: "user_1",
      type: "INCOME",
      amount: 6000000,
      category: "Salary",
      merchant: null,
      note: null,
      occurredAt: new Date("2026-02-25T09:00:00.000Z"),
      rawText: "gaji masuk"
    },
    {
      id: "tx_2",
      userId: "user_1",
      type: "EXPENSE",
      amount: 1000000,
      category: "Bills",
      merchant: "Biznet",
      note: null,
      occurredAt: new Date("2026-03-02T09:00:00.000Z"),
      rawText: "bayar internet"
    },
    {
      id: "tx_3",
      userId: "user_1",
      type: "EXPENSE",
      amount: 800000,
      category: "Food & Drink",
      merchant: "Resto",
      note: null,
      occurredAt: new Date("2026-03-06T09:00:00.000Z"),
      rawText: "makan"
    }
  ]
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => hoisted.user)
    },
    financialProfile: {
      findUnique: vi.fn(async () => hoisted.profile)
    },
    asset: {
      findMany: vi.fn(async () => hoisted.liquidAssets)
    },
    transaction: {
      findMany: vi.fn(async ({ where }: any) =>
        hoisted.transactions.filter((transaction) => {
          if (where?.userId && transaction.userId !== where.userId) return false;
          if (where?.type && transaction.type !== where.type) return false;
          if (where?.occurredAt?.gte && transaction.occurredAt < where.occurredAt.gte) return false;
          if (where?.occurredAt?.lte && transaction.occurredAt > where.occurredAt.lte) return false;
          return true;
        })
      )
    }
  }
}));

import {
  buildCashflowForecastReply,
  parseCashflowForecastQuery
} from "@/lib/services/planning/cashflow-forecast-service";

describe("cashflow forecast service", () => {
  beforeEach(() => {
    hoisted.user = {
      id: "user_1",
      salaryDate: 25
    };
    hoisted.profile = {
      activeIncomeMonthly: BigInt(6000000),
      passiveIncomeMonthly: BigInt(0),
      monthlyIncomeTotal: BigInt(6000000),
      monthlyExpenseTotal: BigInt(3000000)
    };
    hoisted.liquidAssets = [{ estimatedValue: BigInt(500000) }];
    hoisted.transactions = [
      {
        id: "tx_1",
        userId: "user_1",
        type: "INCOME",
        amount: 6000000,
        category: "Salary",
        merchant: null,
        note: null,
        occurredAt: new Date("2026-02-25T09:00:00.000Z"),
        rawText: "gaji masuk"
      },
      {
        id: "tx_2",
        userId: "user_1",
        type: "EXPENSE",
        amount: 1000000,
        category: "Bills",
        merchant: "Biznet",
        note: null,
        occurredAt: new Date("2026-03-02T09:00:00.000Z"),
        rawText: "bayar internet"
      },
      {
        id: "tx_3",
        userId: "user_1",
        type: "EXPENSE",
        amount: 800000,
        category: "Food & Drink",
        merchant: "Resto",
        note: null,
        occurredAt: new Date("2026-03-06T09:00:00.000Z"),
        rawText: "makan"
      }
    ];
  });

  it("parses flexible payday and month-end phrasing", () => {
    expect(parseCashflowForecastQuery("gue masih kuat sampe gajian gak")).toEqual({
      horizon: "PAYDAY",
      mode: "SAFETY"
    });
    expect(parseCashflowForecastQuery("ujung bulan kira-kira sisa uang berapa")).toEqual({
      horizon: "MONTH_END",
      mode: "REMAINING"
    });
    expect(parseCashflowForecastQuery("weekend ini masih aman gak")).toEqual({
      horizon: "WEEKEND",
      mode: "SAFETY"
    });
    expect(parseCashflowForecastQuery("kalau bayar cicilan 1 juta besok masih aman gak")).toEqual({
      horizon: "TOMORROW",
      mode: "SAFETY",
      scenarioExpenseAmount: 1000000,
      scenarioExpenseLabel: "cicilan"
    });
  });

  it("builds a payday safety estimate", async () => {
    const reply = await buildCashflowForecastReply({
      userId: "user_1",
      query: {
        horizon: "PAYDAY",
        mode: "SAFETY"
      },
      now: new Date("2026-03-10T12:00:00.000Z")
    });

    expect(reply).toContain("masih aman sampai gajian berikutnya");
    expect(reply).toContain("25 Maret 2026");
    expect(reply).toContain("Income berjalan: Rp. 6.000.000");
    expect(reply).toContain("Aset likuid tercatat: Rp. 500.000");
  });

  it("falls back safely when salary date is missing", async () => {
    hoisted.user = {
      id: "user_1",
      salaryDate: null
    };

    const reply = await buildCashflowForecastReply({
      userId: "user_1",
      query: {
        horizon: "PAYDAY",
        mode: "SAFETY"
      },
      now: new Date("2026-03-10T12:00:00.000Z")
    });

    expect(reply).toContain("tanggal gajian kamu belum ada");
  });

  it("includes scenario spending for tomorrow forecast", async () => {
    const reply = await buildCashflowForecastReply({
      userId: "user_1",
      query: {
        horizon: "TOMORROW",
        mode: "SAFETY",
        scenarioExpenseAmount: 1000000,
        scenarioExpenseLabel: "cicilan"
      },
      now: new Date("2026-03-10T12:00:00.000Z")
    });

    expect(reply).toContain("sampai besok");
    expect(reply).toContain("Skenario tambahan: Rp. 1.000.000 untuk cicilan");
    expect(reply).toContain("Estimasi posisi di");
  });
});

