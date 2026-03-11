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

vi.mock("@/lib/services/goal-service", () => ({
  getSavingsGoalStatus: vi.fn(async () => ({
    targetAmount: 300000000,
    currentProgress: 50000000,
    remainingAmount: 250000000,
    progressPercent: 16.7
  }))
}));

vi.mock("@/lib/services/portfolio-valuation-service", () => ({
  getUserPortfolioValuation: vi.fn(async () => ({
    items: [],
    totalBookValue: 2000000,
    totalCurrentValue: 2000000,
    totalUnrealizedGain: 0,
    totalLiquidValue: 2000000,
    marketValuedCount: 0,
    bookFallbackCount: 0
  }))
}));

import { tryHandleSmartAllocation } from "@/lib/services/smart-allocation-service";

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
    expect(result.replyText).toContain("Goal prioritas (Beli Rumah)");
    expect(result.replyText).toContain("Gap dana darurat saat ini: Rp10.000.000");
  });
});
