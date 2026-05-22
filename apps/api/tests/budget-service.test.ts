import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const store = {
    budgets: [] as any[],
    users: [] as any[],
    financialProfiles: [] as any[],
    expensePlans: [] as any[],
    transactions: [] as any[]
  };

  const prismaMock: any = {
    budget: {
      findMany: vi.fn(async ({ where }: any) =>
        store.budgets.filter((budget) => !where?.userId || budget.userId === where.userId)
      ),
      upsert: vi.fn(async ({ where, update, create }: any) => {
        const existing = store.budgets.find(
          (budget) =>
            budget.userId === where.userId_category.userId &&
            budget.category === where.userId_category.category
        );
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date("2026-05-22T10:00:00.000Z") });
          return existing;
        }

        const row = {
          id: `budget_${store.budgets.length + 1}`,
          ...create,
          createdAt: new Date("2026-05-22T09:00:00.000Z"),
          updatedAt: new Date("2026-05-22T09:00:00.000Z")
        };
        store.budgets.push(row);
        return row;
      })
    },
    user: {
      update: vi.fn(async ({ where, data }: any) => {
        const user = store.users.find((item) => item.id === where.id);
        if (!user) throw new Error("User not found");
        Object.assign(user, data);
        return user;
      })
    },
    financialProfile: {
      findUnique: vi.fn(async ({ where }: any) =>
        store.financialProfiles.find((profile) => profile.userId === where.userId) ?? null
      ),
      upsert: vi.fn(async ({ where, update, create }: any) => {
        const existing = store.financialProfiles.find((profile) => profile.userId === where.userId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: `profile_${store.financialProfiles.length + 1}`, ...create };
        store.financialProfiles.push(row);
        return row;
      })
    },
    expensePlan: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        for (const plan of store.expensePlans) {
          if (plan.userId === where.userId && plan.isActive === where.isActive) {
            Object.assign(plan, data);
          }
        }
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = {
          id: `plan_${store.expensePlans.length + 1}`,
          ...data,
          items: data.items.create
        };
        store.expensePlans.push(row);
        return row;
      })
    },
    transaction: {
      findMany: vi.fn(async () => store.transactions)
    }
  };

  return { prismaMock, store };
});

vi.mock("@/lib/prisma", () => ({
  prisma: hoisted.prismaMock
}));

import {
  buildBudgetCategoryListText,
  upsertCategoryBudget
} from "@/lib/services/transactions/budget";

describe("budget service", () => {
  beforeEach(() => {
    hoisted.store.budgets = [
      {
        id: "budget_1",
        userId: "user_1",
        category: "Food & Drink",
        monthlyLimit: 1_000_000,
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        updatedAt: new Date("2026-05-01T00:00:00.000Z")
      }
    ];
    hoisted.store.users = [{ id: "user_1", monthlyBudget: null }];
    hoisted.store.financialProfiles = [
      {
        id: "profile_1",
        userId: "user_1",
        monthlyIncomeTotal: 10_000_000,
        potentialMonthlySaving: 9_000_000
      }
    ];
    hoisted.store.expensePlans = [];
    hoisted.store.transactions = [];
  });

  it("preserves user category names, guards duplicates, and syncs expense context", async () => {
    const created = await upsertCategoryBudget({
      userId: "user_1",
      category: "hobi",
      monthlyLimit: 500_000
    });

    expect(created.category).toBe("hobi");
    expect(hoisted.store.budgets).toHaveLength(2);
    expect(hoisted.store.users[0].monthlyBudget).toBe(1_500_000);
    expect(hoisted.store.financialProfiles[0].monthlyExpenseTotal).toBe(1_500_000n);
    expect(hoisted.store.financialProfiles[0].potentialMonthlySaving).toBe(8_500_000n);
    expect(hoisted.store.expensePlans.at(-1)?.items).toEqual([
      { categoryKey: "Food & Drink", amount: 1_000_000n },
      { categoryKey: "hobi", amount: 500_000n }
    ]);

    await upsertCategoryBudget({
      userId: "user_1",
      category: "Hobi",
      monthlyLimit: 700_000
    });

    expect(hoisted.store.budgets).toHaveLength(2);
    expect(hoisted.store.budgets.at(-1)?.category).toBe("Hobi");
    expect(hoisted.store.users[0].monthlyBudget).toBe(1_700_000);

    const listText = await buildBudgetCategoryListText("user_1");
    expect(listText).toContain("Food & Drink - Rp1.000.000/bulan");
    expect(listText).toContain("Hobi - Rp700.000/bulan");
  });
});

