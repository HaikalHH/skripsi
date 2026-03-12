import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  profile: {
    monthlyIncomeTotal: BigInt(10000000),
    monthlyExpenseTotal: BigInt(6000000),
    potentialMonthlySaving: BigInt(4000000),
    emergencyFundTarget: BigInt(12000000)
  },
  goals: [
    {
      goalType: "HOUSE",
      goalName: "Beli Rumah",
      targetAmount: BigInt(300000000)
    }
  ]
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({
        employmentType: "EMPLOYEE",
        incomeStability: "STABLE",
        hasAssets: true
      }))
    },
    financialProfile: {
      findUnique: vi.fn(async () => hoisted.profile)
    },
    financialGoal: {
      findMany: vi.fn(async () => hoisted.goals)
    },
    transaction: {
      aggregate: vi.fn(async ({ where }: any) => ({
        _sum: {
          amount: where.type === "INCOME" ? 10000000 : 6000000
        }
      }))
    }
  }
}));

vi.mock("@/lib/services/planning/goal-service", () => ({
  getSavingsGoalStatus: vi.fn(async () => ({
    targetAmount: 300000000,
    currentProgress: 50000000,
    remainingAmount: 250000000,
    progressPercent: 16.7,
    recommendedPlan: [
      {
        goalName: "Beli Rumah",
        recommendedMonthlyContribution: 2500000,
        sharePercent: 62.5
      }
    ]
  }))
}));

vi.mock("@/lib/services/market/portfolio-valuation-service", () => ({
  getUserPortfolioValuation: vi.fn(async () => ({
    items: [],
    totalBookValue: 2000000,
    totalCurrentValue: 2000000,
    totalUnrealizedGain: 0,
    totalLiquidValue: 2000000,
    liquidSharePercent: 100,
    marketValuedCount: 0,
    bookFallbackCount: 0,
    marketCoveragePercent: 0,
    topHoldingName: "Tabungan",
    concentrationRisk: "LOW",
    dominantType: "OTHER",
    dominantTypeShare: 100,
    rebalanceStatus: "WATCH",
    rebalanceReasons: ["aset likuid terlalu besar dibanding aset bertumbuh"],
    profitableAssetCount: 0,
    losingAssetCount: 0,
    typeBreakdown: [],
    diversificationScore: 45
  }))
}));

import { tryHandleSmartAllocation } from "@/lib/services/planning/smart-allocation-service";

describe("smart allocation service", () => {
  beforeEach(() => {
    hoisted.profile = {
      monthlyIncomeTotal: BigInt(10000000),
      monthlyExpenseTotal: BigInt(6000000),
      potentialMonthlySaving: BigInt(4000000),
      emergencyFundTarget: BigInt(12000000)
    };
    hoisted.goals = [
      {
        goalType: "HOUSE",
        goalName: "Beli Rumah",
        targetAmount: BigInt(300000000)
      }
    ];
  });

  it("returns goal-aware allocation using profile and emergency gap", async () => {
    const result = await tryHandleSmartAllocation({
      userId: "user_1",
      text: "sisa uang bulan ini sebaiknya kemana"
    });

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("Income bulanan: Rp10.000.000");
    expect(result.replyText).toContain("Profil alokasi:");
    expect(result.replyText).toContain("Goal prioritas (Beli Rumah)");
    expect(result.replyText).toContain("Gap dana darurat saat ini: Rp10.000.000");
    expect(result.replyText).toContain("Referensi setoran goal: Beli Rumah Rp2.500.000/bulan");
    expect(result.replyText).toContain("Fokus investasi:");
  });
});

