import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const store = {
    transactions: [] as any[],
    budgets: [] as any[],
    financialProfile: null as any,
    assets: [] as any[]
  };

  const prismaMock: any = {
    transaction: {
      findMany: vi.fn(async ({ where }: any) =>
        store.transactions.filter((item) => {
          if (where?.userId && item.userId !== where.userId) return false;
          if (where?.occurredAt?.gte && item.occurredAt < where.occurredAt.gte) return false;
          if (where?.occurredAt?.lte && item.occurredAt > where.occurredAt.lte) return false;
          return true;
        })
      )
    },
    budget: {
      findMany: vi.fn(async ({ where }: any) =>
        store.budgets.filter((item) => item.userId === where.userId)
      )
    },
    financialProfile: {
      findUnique: vi.fn(async () => store.financialProfile)
    },
    asset: {
      findMany: vi.fn(async () => store.assets)
    }
  };

  return { store, prismaMock };
});

vi.mock("@/lib/prisma", () => ({
  prisma: hoisted.prismaMock
}));

vi.mock("@/lib/services/planning/goal-service", () => ({
  getSavingsGoalStatus: vi.fn(async () => ({
    goalName: "Dana Darurat",
    goalType: "EMERGENCY_FUND",
    targetAmount: 36000000,
    currentProgress: 12000000,
    remainingAmount: 24000000,
    progressPercent: 33.3,
    estimatedMonthsToGoal: 4,
    totalGoals: 1,
    goals: [
      {
        goalName: "Dana Darurat",
        goalType: "EMERGENCY_FUND",
        targetAmount: 36000000,
        currentProgress: 12000000,
        remainingAmount: 24000000,
        progressPercent: 33.3,
        estimatedMonthsToGoal: 4,
        status: "ACTIVE",
        isPrimary: true
      }
    ]
  }))
}));

import { buildFinancialHealthReply } from "@/lib/services/planning/financial-health-service";

describe("financial health service", () => {
  beforeEach(() => {
    hoisted.store.transactions = [
      {
        userId: "user_1",
        type: "INCOME",
        amount: 10000000,
        category: "Income",
        occurredAt: new Date("2026-03-05T12:00:00.000Z")
      },
      {
        userId: "user_1",
        type: "EXPENSE",
        amount: 2500000,
        category: "Bills",
        occurredAt: new Date("2026-03-06T12:00:00.000Z")
      },
      {
        userId: "user_1",
        type: "EXPENSE",
        amount: 1500000,
        category: "Entertainment",
        occurredAt: new Date("2026-03-10T12:00:00.000Z")
      }
    ];
    hoisted.store.budgets = [
      {
        userId: "user_1",
        category: "Entertainment",
        monthlyLimit: 1000000,
        updatedAt: new Date("2026-03-01T00:00:00.000Z")
      }
    ];
    hoisted.store.financialProfile = {
      monthlyExpenseTotal: 4000000,
      emergencyFundTarget: 36000000
    };
    hoisted.store.assets = [{ estimatedValue: 8000000 }];
  });

  it("builds health score reply", async () => {
    const reply = await buildFinancialHealthReply({
      userId: "user_1",
      mode: "SCORE",
      dateRange: {
        start: new Date("2026-03-01T00:00:00.000Z"),
        end: new Date("2026-03-31T23:59:59.999Z"),
        label: "Maret 2026"
      }
    });

    expect(reply).toContain("Skor kesehatan keuangan untuk Maret 2026");
    expect(reply).toContain("Komponen skor");
    expect(reply).toContain("Yang perlu dibenahi");
  });

  it("builds monthly closing reply", async () => {
    const reply = await buildFinancialHealthReply({
      userId: "user_1",
      mode: "CLOSING",
      dateRange: {
        start: new Date("2026-03-01T00:00:00.000Z"),
        end: new Date("2026-03-31T23:59:59.999Z"),
        label: "Maret 2026"
      }
    });

    expect(reply).toContain("Closing keuangan Maret 2026");
    expect(reply).toContain("Health score");
    expect(reply).toContain("Fokus bulan berikutnya");
  });
});

