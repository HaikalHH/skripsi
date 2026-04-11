import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const profile = {
    userId: "user_1",
    enabled: false,
    monthlyExpense: 0,
    targetYears: 15,
    safeWithdrawalRate: 0.04
  };

  return {
    freedomProfile: profile
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financialFreedomProfile: {
      upsert: vi.fn(async () => hoisted.freedomProfile),
      update: vi.fn(async ({ data }: any) => {
        Object.assign(hoisted.freedomProfile, data);
        return hoisted.freedomProfile;
      })
    },
    financialProfile: {
      findUnique: vi.fn(async () => ({
        monthlyExpenseTotal: BigInt(8000000),
        potentialMonthlySaving: BigInt(3000000),
        financialFreedomTarget: BigInt(2400000000)
      }))
    },
    user: {
      update: vi.fn(async ({ data }: any) => ({
        id: "user_1",
        targetFinancialFreedomAge: data.targetFinancialFreedomAge ?? null
      })),
      findUnique: vi.fn(async () => ({
        targetFinancialFreedomAge: 45
      }))
    },
    transaction: {
      aggregate: vi.fn(async ({ where }: any) => ({
        _sum: {
          amount: where.type === "INCOME" ? 120000000 : 30000000
        }
      }))
    }
  }
}));

vi.mock("@/lib/services/market/portfolio-valuation-service", () => ({
  getUserPortfolioValuation: vi.fn(async () => ({
    items: [],
    totalBookValue: 300000000,
    totalCurrentValue: 300000000,
    totalUnrealizedGain: 0,
    totalLiquidValue: 50000000,
    marketValuedCount: 0,
    bookFallbackCount: 0
  }))
}));

import { tryHandleFinancialFreedomCommand } from "@/lib/services/planning/financial-freedom-service";

describe("financial freedom service", () => {
  beforeEach(() => {
    hoisted.freedomProfile.enabled = false;
    hoisted.freedomProfile.monthlyExpense = 0;
    hoisted.freedomProfile.targetYears = 15;
    hoisted.freedomProfile.safeWithdrawalRate = 0.04;
  });

  it("returns richer financial freedom status with eta", async () => {
    const result = await tryHandleFinancialFreedomCommand({
      userId: "user_1",
      text: "aktifkan financial freedom pengeluaran aku 8 juta/bulan financial freedom 15 tahun"
    });

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("Financial Freedom Tracker:");
    expect(result.replyText).toContain("Target lean");
    expect(result.replyText).toContain("Target dana bebas finansial: Rp. 2.400.000.000,00");
    expect(result.replyText).toContain("Passive income aman yang dibutuhkan:");
    expect(result.replyText).toContain("Coverage expense dari aset saat ini:");
    expect(result.replyText).toContain("Gap setoran bulanan");
    expect(result.replyText).toContain("Estimasi waktu di ritme sekarang:");
    expect(result.replyText).toContain("Status:");
  });
});

