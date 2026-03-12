import { FinancialGoalStatus, FinancialGoalType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const store = {
    transactions: [] as any[],
    financialGoals: [] as any[],
    savingsGoals: [] as any[],
    financialProfiles: [] as any[],
    goalContributions: [] as any[]
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
      create: vi.fn(async ({ data }: any) => {
        const row = {
          id: `goal_${store.financialGoals.length + 1}`,
          createdAt: new Date(`2026-03-${10 + store.financialGoals.length}T10:00:00.000Z`),
          updatedAt: new Date(`2026-03-${10 + store.financialGoals.length}T10:00:00.000Z`),
          estimatedMonthsToGoal: null,
          targetAge: null,
          ...data
        };
        store.financialGoals.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = store.financialGoals.find((item) => item.id === where.id);
        if (!row) throw new Error("Goal not found");
        Object.assign(row, data, { updatedAt: new Date("2026-03-20T10:00:00.000Z") });
        return row;
      })
    },
    goalContribution: {
      findMany: vi.fn(async ({ where }: any) =>
        store.goalContributions.filter((item) => item.userId === where.userId)
      ),
      create: vi.fn(async ({ data }: any) => {
        const row = {
          id: `contrib_${store.goalContributions.length + 1}`,
          occurredAt: new Date(`2026-03-${12 + store.goalContributions.length}T10:00:00.000Z`),
          ...data
        };
        store.goalContributions.push(row);
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

import { getSavingsGoalStatus, setSavingsGoalTarget } from "@/lib/services/planning/goal-service";
import { addGoalContribution } from "@/lib/services/planning/goal-service";

describe("goal service", () => {
  beforeEach(() => {
    hoisted.store.transactions = [
      { userId: "user_1", type: "INCOME", amount: 10000000 },
      { userId: "user_1", type: "EXPENSE", amount: 4000000 }
    ];
    hoisted.store.financialProfiles = [
      { userId: "user_1", potentialMonthlySaving: 6000000 }
    ];
    hoisted.store.financialGoals = [];
    hoisted.store.savingsGoals = [];
    hoisted.store.goalContributions = [];
  });

  it("creates a named financial goal and returns its status", async () => {
    const status = await setSavingsGoalTarget("user_1", 750000000, {
      goalType: FinancialGoalType.HOUSE,
      goalName: "Beli Rumah",
      goalQuery: "Beli Rumah"
    });

    expect(status.goalName).toBe("Beli Rumah");
    expect(status.goalType).toBe(FinancialGoalType.HOUSE);
    expect(status.targetAmount).toBe(750000000);
    expect(status.currentProgress).toBe(6000000);
    expect(status.totalGoals).toBe(1);
    expect(status.monthlySavingCapacity).toBe(6000000);
    expect(status.recommendedPlan[0]?.recommendedMonthlyContribution).toBe(6000000);
    expect(hoisted.store.financialGoals).toHaveLength(1);
  });

  it("summarizes multiple goals and prioritizes emergency fund", async () => {
    hoisted.store.financialGoals = [
      {
        id: "goal_1",
        userId: "user_1",
        goalType: FinancialGoalType.HOUSE,
        goalName: "Beli Rumah",
        targetAmount: 750000000,
        estimatedMonthsToGoal: 125,
        status: FinancialGoalStatus.ACTIVE,
        createdAt: new Date("2026-03-10T10:00:00.000Z")
      },
      {
        id: "goal_2",
        userId: "user_1",
        goalType: FinancialGoalType.EMERGENCY_FUND,
        goalName: "Dana Darurat",
        targetAmount: 36000000,
        estimatedMonthsToGoal: 6,
        status: FinancialGoalStatus.ACTIVE,
        createdAt: new Date("2026-03-11T10:00:00.000Z")
      }
    ];

    const status = await getSavingsGoalStatus("user_1");

    expect(status.totalGoals).toBe(2);
    expect(status.goalName).toBe("Dana Darurat");
    expect(status.goals[0].goalName).toBe("Beli Rumah");
    expect(status.goals[1].goalName).toBe("Dana Darurat");
    expect(status.goals.find((goal) => goal.goalName === "Dana Darurat")?.isPrimary).toBe(true);
    expect(status.recommendedPlan).toHaveLength(2);
    expect(status.recommendedPlan[0]?.recommendedMonthlyContribution).toBeGreaterThan(0);
  });

  it("tracks explicit contribution per goal", async () => {
    hoisted.store.financialGoals = [
      {
        id: "goal_1",
        userId: "user_1",
        goalType: FinancialGoalType.HOUSE,
        goalName: "Beli Rumah",
        targetAmount: 750000000,
        estimatedMonthsToGoal: null,
        status: FinancialGoalStatus.ACTIVE,
        createdAt: new Date("2026-03-10T10:00:00.000Z")
      }
    ];
    hoisted.store.goalContributions = [
      {
        id: "contrib_seed_1",
        userId: "user_1",
        goalId: "goal_1",
        amount: 2000000,
        occurredAt: new Date("2026-01-15T10:00:00.000Z")
      },
      {
        id: "contrib_seed_2",
        userId: "user_1",
        goalId: "goal_1",
        amount: 2500000,
        occurredAt: new Date("2026-02-15T10:00:00.000Z")
      }
    ];

    const result = await addGoalContribution("user_1", 500000, {
      goalQuery: "Beli Rumah",
      goalType: FinancialGoalType.HOUSE
    });

    expect(result.contributionAmount).toBe(500000);
    expect(hoisted.store.goalContributions).toHaveLength(3);
    expect(result.goalStatus.currentProgress).toBe(5000000);
    expect(result.goalStatus.progressSource).toBe("GOAL_CONTRIBUTIONS");
    expect(result.goalStatus.goals[0]?.recentContributionTotal).toBe(3000000);
    expect(result.goalStatus.goals[0]?.recommendedMonthlyContribution).toBe(6000000);
    expect(result.goalStatus.goals[0]?.contributionActiveMonths).toBe(3);
    expect(result.goalStatus.goals[0]?.contributionMonthStreak).toBe(3);
    expect(result.goalStatus.goals[0]?.trackingStatus).toBe("ON_TRACK");
  });
});

