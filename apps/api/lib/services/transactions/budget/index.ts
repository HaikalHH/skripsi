import { ExpensePlanSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/services/shared/money";
import { toNumber } from "../helpers/number";
import { normalizeBudgetCategoryName, getBudgetCategoryLookupKey } from "./category";
import { findBudgetByCategoryName, getMonthlyCategorySpent, pickMatchingBudget } from "./data-access";

const BUDGET_WARNING_THRESHOLD = 0.8;

export { normalizeBudgetCategoryName } from "./category";

const normalizeCategory = (value: string) => normalizeBudgetCategoryName(value);

const getDateTime = (value: unknown) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") return new Date(value).getTime();
  return 0;
};

const dedupeBudgetsByCategoryName = <T extends { category: string; updatedAt?: unknown }>(
  budgets: T[]
) => {
  const budgetByName = new Map<string, T>();
  for (const budget of [...budgets].sort((left, right) => getDateTime(left.updatedAt) - getDateTime(right.updatedAt))) {
    budgetByName.set(getBudgetCategoryLookupKey(budget.category), budget);
  }
  return Array.from(budgetByName.values());
};

const syncBudgetExpenseContext = async (userId: string) => {
  const budgets = dedupeBudgetsByCategoryName(
    await prisma.budget.findMany({
      where: { userId }
    })
  );
  const totalMonthlyExpense = budgets.reduce(
    (sum, budget) => sum + toNumber(budget.monthlyLimit),
    0
  );

  await prisma.user.update({
    where: { id: userId },
    data: { monthlyBudget: totalMonthlyExpense }
  });

  const expensePlanModel = (prisma as unknown as { expensePlan?: any }).expensePlan;
  if (expensePlanModel?.updateMany && expensePlanModel?.create) {
    await expensePlanModel.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false }
    });
    await expensePlanModel.create({
      data: {
        userId,
        source: ExpensePlanSource.AUTO_GENERATED_LATER,
        totalMonthlyExpense: BigInt(Math.max(0, Math.round(totalMonthlyExpense))),
        isActive: true,
        items: {
          create: budgets.map((budget) => ({
            categoryKey: budget.category,
            amount: BigInt(Math.max(0, Math.round(toNumber(budget.monthlyLimit))))
          }))
        }
      }
    });
  }

  let syncedPotentialMonthlySaving: number | null = null;
  const financialProfileModel = (prisma as unknown as { financialProfile?: any }).financialProfile;
  if (financialProfileModel?.findUnique && financialProfileModel?.upsert) {
    const profile = await financialProfileModel.findUnique({
      where: { userId },
      select: {
        activeIncomeMonthly: true,
        passiveIncomeMonthly: true,
        estimatedMonthlyIncome: true,
        monthlyIncomeTotal: true,
        monthlyExpenseTotal: true,
        potentialMonthlySaving: true
      }
    });
    const monthlyIncomeTotal =
      toNumber(profile?.monthlyIncomeTotal ?? 0) ||
      toNumber(profile?.activeIncomeMonthly ?? 0) + toNumber(profile?.passiveIncomeMonthly ?? 0) ||
      toNumber(profile?.estimatedMonthlyIncome ?? 0) ||
      (profile?.potentialMonthlySaving != null && profile?.monthlyExpenseTotal != null
        ? toNumber(profile.potentialMonthlySaving) + toNumber(profile.monthlyExpenseTotal)
        : 0);
    const potentialMonthlySaving =
      monthlyIncomeTotal > 0 ? monthlyIncomeTotal - totalMonthlyExpense : null;
    syncedPotentialMonthlySaving = potentialMonthlySaving;
    const savingRate =
      monthlyIncomeTotal > 0 && potentialMonthlySaving !== null
        ? (potentialMonthlySaving / monthlyIncomeTotal) * 100
        : null;
    const profileData = {
      monthlyExpenseTotal: BigInt(Math.max(0, Math.round(totalMonthlyExpense))),
      annualExpense: BigInt(Math.max(0, Math.round(totalMonthlyExpense * 12))),
      ...(monthlyIncomeTotal > 0
        ? {
            monthlyIncomeTotal: BigInt(Math.max(0, Math.round(monthlyIncomeTotal))),
            potentialMonthlySaving: BigInt(Math.round(potentialMonthlySaving ?? 0)),
            savingRate
          }
        : {})
    };

    await financialProfileModel.upsert({
      where: { userId },
      update: profileData,
      create: {
        userId,
        ...profileData
      }
    });
  }

  return {
    totalMonthlyExpense,
    potentialMonthlySaving: syncedPotentialMonthlySaving
  };
};

export const getMatchingCategoryBudget = async (params: { userId: string; category: string }) => {
  const category = normalizeCategory(params.category);
  const budget = await pickMatchingBudget({
    userId: params.userId,
    category
  });

  return {
    category: budget?.category ?? category,
    budget
  };
};

export const upsertCategoryBudget = async (params: {
  userId: string;
  category: string;
  monthlyLimit: number;
}) => {
  const category = normalizeCategory(params.category);
  const existingBudget = await findBudgetByCategoryName({
    userId: params.userId,
    category
  });
  const budget = await prisma.budget.upsert({
    where: {
      userId_category: {
        userId: params.userId,
        category: existingBudget?.category ?? category
      }
    },
    update: {
      category,
      monthlyLimit: params.monthlyLimit
    },
    create: {
      userId: params.userId,
      category,
      monthlyLimit: params.monthlyLimit
    }
  });
  const syncedContext = await syncBudgetExpenseContext(params.userId);

  const spentThisMonth = await getMonthlyCategorySpent({
    userId: params.userId,
    category,
    baseDate: new Date()
  });

  const limit = toNumber(budget.monthlyLimit);
  return {
    category,
    monthlyLimit: limit,
    spentThisMonth,
    remainingThisMonth: limit - spentThisMonth,
    totalMonthlyExpense: syncedContext.totalMonthlyExpense,
    potentialMonthlySaving: syncedContext.potentialMonthlySaving
  };
};

export const listCategoryBudgets = async (userId: string) =>
  dedupeBudgetsByCategoryName(
    await prisma.budget.findMany({
      where: { userId }
    })
  ).sort((left, right) => left.category.localeCompare(right.category, "id-ID"));

export const buildBudgetCategoryListText = async (userId: string) => {
  const budgets = await listCategoryBudgets(userId);
  if (!budgets.length) {
    return "📋 Belum ada kategori budget tersimpan. Ketik `/budget set` untuk tambah kategori baru.";
  }

  const totalBudget = budgets.reduce((sum, budget) => sum + toNumber(budget.monthlyLimit), 0);
  return [
    "📋 Daftar kategori budget Boss",
    "",
    ...budgets.map(
      (budget, index) => `${index + 1}. ${budget.category} - ${formatMoney(toNumber(budget.monthlyLimit))}/bulan`
    ),
    "",
    `Total budget bulanan: ${formatMoney(totalBudget)}`
  ].join("\n");
};

export const checkBudgetAlert = async (
  userId: string,
  category: string,
  occurredAt: Date
): Promise<string | null> => {
  const normalizedCategory = normalizeCategory(category);
  const budget = await pickMatchingBudget({ userId, category: normalizedCategory });

  if (!budget) return null;

  const spent = await getMonthlyCategorySpent({
    userId,
    category: normalizedCategory,
    baseDate: occurredAt
  });
  const limit = toNumber(budget.monthlyLimit);
  if (limit <= 0) return null;

  if (spent >= limit) {
    return `Alert: budget kategori ${budget.category} terlampaui. Limit ${formatMoney(limit)}, aktual ${formatMoney(spent)}.`;
  }

  const usageRatio = spent / limit;
  if (usageRatio >= BUDGET_WARNING_THRESHOLD) {
    const remaining = Math.max(0, limit - spent);
    return `Warning: budget kategori ${budget.category} hampir habis. Sisa ${formatMoney(
      remaining
    )} dari limit ${formatMoney(limit)}.`;
  }

  return null;
};
