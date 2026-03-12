import { FinancialGoalStatus, FinancialGoalType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const store = {
    transactions: [] as any[],
    financialGoals: [] as any[],
    savingsGoals: [] as any[],
    financialProfiles: [] as any[]
  };

  const prismaMock: any = {
    transaction: {
      aggregate: vi.fn(async ({ where }: any) => {
        const total = store.transactions
          .filter((item) => item.userId === where.userId && item.type === where.type)
          .reduce((sum, item) => sum + item.amount, 0);
        return { _sum: { amount: total } };
      })
    },
    financialProfile: {
      findUnique: vi.fn(async ({ where }: any) =>
        store.financialProfiles.find((item) => item.userId === where.userId) ?? null
      )
    },
    financialGoal: {
      findMany: vi.fn(async ({ where }: any) => {
        let rows = store.financialGoals.filter((item) => item.userId === where.userId);
        if (where?.status?.in) {
          const allowed = new Set(where.status.in);
          rows = rows.filter((item) => allowed.has(item.status));
        }
        return [...rows].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        let rows = store.financialGoals.filter((item) => item.userId === where.userId);
        if (where?.goalType) {
          rows = rows.filter((item) => item.goalType === where.goalType);
        }
        if (where?.status?.in) {
          const allowed = new Set(where.status.in);
          rows = rows.filter((item) => allowed.has(item.status));
        }
        return rows.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = store.financialGoals.find((item) => item.id === where.id);
        if (!row) throw new Error("Goal not found");
        Object.assign(row, data);
        return row;
      })
    },
    savingsGoal: {
      upsert: vi.fn(async ({ where, update, create }: any) => {
        const existing = store.savingsGoals.find((item) => item.userId === where.userId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }

        const row = { id: "legacy_1", ...create };
        store.savingsGoals.push(row);
        return row;
      })
    }
  };

  return { store, prismaMock };
});

vi.mock("@/lib/prisma", () => ({
  prisma: hoisted.prismaMock
}));

import { buildGoalPlannerReply } from "@/lib/services/planning/goal-planner-service";

describe("goal planner service", () => {
  beforeEach(() => {
    hoisted.store.transactions = [
      { userId: "user_1", type: "INCOME", amount: 12000000 },
      { userId: "user_1", type: "EXPENSE", amount: 5000000 }
    ];
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        potentialMonthlySaving: 7000000,
        monthlyIncomeTotal: 12000000,
        monthlyExpenseTotal: 5000000
      }
    ];
    hoisted.store.financialGoals = [
      {
        id: "goal_1",
        userId: "user_1",
        goalType: FinancialGoalType.HOUSE,
        goalName: "Beli Rumah",
        targetAmount: 840000000,
        estimatedMonthsToGoal: 120,
        status: FinancialGoalStatus.ACTIVE,
        createdAt: new Date("2026-03-10T10:00:00.000Z")
      },
      {
        id: "goal_2",
        userId: "user_1",
        goalType: FinancialGoalType.EMERGENCY_FUND,
        goalName: "Dana Darurat",
        targetAmount: 42000000,
        estimatedMonthsToGoal: 6,
        status: FinancialGoalStatus.ACTIVE,
        createdAt: new Date("2026-03-11T10:00:00.000Z")
      }
    ];
    hoisted.store.savingsGoals = [];
  });

  it("builds priority order for active goals", async () => {
    const reply = await buildGoalPlannerReply({
      userId: "user_1",
      mode: "PRIORITY"
    });

    expect(reply).toContain("Urutan goal yang paling realistis/prioritas sekarang");
    expect(reply).toContain("Dana Darurat");
    expect(reply).toContain("Beli Rumah");
  });

  it("builds focused allocation for a selected goal", async () => {
    const reply = await buildGoalPlannerReply({
      userId: "user_1",
      mode: "FOCUS",
      goalQuery: "Beli Rumah",
      goalType: FinancialGoalType.HOUSE
    });

    expect(reply).toContain("Kalau fokus Beli Rumah dulu");
    expect(reply).toContain("Alokasi ke Beli Rumah");
    expect(reply).toContain("Dana Darurat");
  });

  it("builds focus-duration simulation", async () => {
    const reply = await buildGoalPlannerReply({
      userId: "user_1",
      mode: "FOCUS_DURATION",
      goalQuery: "Beli Rumah",
      goalType: FinancialGoalType.HOUSE,
      focusMonths: 6
    });

    expect(reply).toContain("selama 6 bulan dulu");
    expect(reply).toContain("fase fokus");
  });

  it("builds split-ratio simulation", async () => {
    const reply = await buildGoalPlannerReply({
      userId: "user_1",
      mode: "SPLIT_RATIO",
      splitRatio: {
        primary: 60,
        secondary: 40
      }
    });

    expect(reply).toContain("dibagi 60:40");
    expect(reply).toContain("Dana Darurat");
  });

  it("simulates expense growth impact on goal eta", async () => {
    const reply = await buildGoalPlannerReply({
      userId: "user_1",
      mode: "EXPENSE_GROWTH",
      goalQuery: "Beli Rumah",
      goalType: FinancialGoalType.HOUSE,
      annualExpenseGrowthRate: 5
    });

    expect(reply).toContain("pengeluaran naik 5% per tahun");
    expect(reply).toContain("ETA baseline");
  });
});

