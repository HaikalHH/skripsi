import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/services/shared/money";
import { toNumber } from "../helpers/number";
import { normalizeBudgetCategoryName } from "./category";
import {
  findBudgetItemByCategoryName,
  getMonthlyCategorySpent,
  listExpensePlanBudgetItems,
  pickMatchingBudgetItem,
  replaceActiveExpensePlanBudgetItems
} from "./data-access";

const BUDGET_WARNING_THRESHOLD = 0.8;

export { normalizeBudgetCategoryName } from "./category";
export { findBudgetItemByCategoryName, listExpensePlanBudgetItems } from "./data-access";

const normalizeCategory = (value: string) => normalizeBudgetCategoryName(value);

const syncFinancialProfileExpenseContext = async (params: {
  userId: string;
  totalMonthlyExpense: number;
}) => {
  let syncedPotentialMonthlySaving: number | null = null;
  const financialProfileModel = (prisma as unknown as { financialProfile?: any }).financialProfile;
  if (!financialProfileModel?.findUnique || !financialProfileModel?.upsert) {
    return { potentialMonthlySaving: syncedPotentialMonthlySaving };
  }

  const profile = await financialProfileModel.findUnique({
    where: { userId: params.userId },
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
    monthlyIncomeTotal > 0 ? monthlyIncomeTotal - params.totalMonthlyExpense : null;
  syncedPotentialMonthlySaving = potentialMonthlySaving;
  const savingRate =
    monthlyIncomeTotal > 0 && potentialMonthlySaving !== null
      ? (potentialMonthlySaving / monthlyIncomeTotal) * 100
      : null;
  const profileData = {
    monthlyExpenseTotal: BigInt(Math.max(0, Math.round(params.totalMonthlyExpense))),
    annualExpense: BigInt(Math.max(0, Math.round(params.totalMonthlyExpense * 12))),
    ...(monthlyIncomeTotal > 0
      ? {
          monthlyIncomeTotal: BigInt(Math.max(0, Math.round(monthlyIncomeTotal))),
          potentialMonthlySaving: BigInt(Math.round(potentialMonthlySaving ?? 0)),
          savingRate
        }
      : {})
  };

  await financialProfileModel.upsert({
    where: { userId: params.userId },
    update: profileData,
    create: {
      userId: params.userId,
      ...profileData
    }
  });

  return { potentialMonthlySaving: syncedPotentialMonthlySaving };
};

export const getMatchingCategoryBudget = async (params: { userId: string; category: string }) => {
  const category = normalizeCategory(params.category);
  const budget = await pickMatchingBudgetItem({
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
  const existingItems = await listExpensePlanBudgetItems(params.userId);
  const existingBudget = await findBudgetItemByCategoryName({
    userId: params.userId,
    category
  });
  const nextItems = existingBudget
    ? existingItems.map((item) =>
        item.category === existingBudget.category
          ? { category, monthlyLimit: Math.max(0, Math.round(params.monthlyLimit)) }
          : item
      )
    : [...existingItems, { category, monthlyLimit: Math.max(0, Math.round(params.monthlyLimit)) }];
  const syncedPlan = await replaceActiveExpensePlanBudgetItems({
    userId: params.userId,
    items: nextItems
  });
  const syncedProfile = await syncFinancialProfileExpenseContext({
    userId: params.userId,
    totalMonthlyExpense: syncedPlan.totalMonthlyExpense
  });

  const spentThisMonth = await getMonthlyCategorySpent({
    userId: params.userId,
    category,
    baseDate: new Date()
  });

  const limit = Math.max(0, Math.round(params.monthlyLimit));
  return {
    category,
    monthlyLimit: limit,
    spentThisMonth,
    remainingThisMonth: limit - spentThisMonth,
    totalMonthlyExpense: syncedPlan.totalMonthlyExpense,
    potentialMonthlySaving: syncedProfile.potentialMonthlySaving
  };
};

export const listCategoryBudgets = async (userId: string) =>
  (await listExpensePlanBudgetItems(userId)).sort((left, right) =>
    left.category.localeCompare(right.category, "id-ID")
  );

export const buildBudgetCategoryListText = async (userId: string) => {
  const budgets = await listCategoryBudgets(userId);
  if (!budgets.length) {
    return "ðŸ“‹ Belum ada kategori pengeluaran tersimpan. Ketik `/budget set` untuk tambah kategori baru.";
  }

  const totalBudget = budgets.reduce((sum, budget) => sum + toNumber(budget.monthlyLimit), 0);
  return [
    "ðŸ“‹ Daftar kategori pengeluaran Boss",
    "",
    ...budgets.map(
      (budget, index) => `${index + 1}. ${budget.category} - ${formatMoney(toNumber(budget.monthlyLimit))}/bulan`
    ),
    "",
    `Total pengeluaran bulanan: ${formatMoney(totalBudget)}`
  ].join("\n");
};

export const checkBudgetAlert = async (
  userId: string,
  category: string,
  occurredAt: Date
): Promise<string | null> => {
  const normalizedCategory = normalizeCategory(category);
  const budget = await pickMatchingBudgetItem({ userId, category: normalizedCategory });

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

export const getCategoryBudgetProgress = async (params: {
  userId: string;
  category: string;
  occurredAt: Date;
}) => {
  const normalizedCategory = normalizeCategory(params.category);
  const budget = await pickMatchingBudgetItem({
    userId: params.userId,
    category: normalizedCategory
  });

  if (!budget) return null;

  const monthlyLimit = toNumber(budget.monthlyLimit);
  if (monthlyLimit <= 0) return null;

  const spentThisMonth = await getMonthlyCategorySpent({
    userId: params.userId,
    category: normalizedCategory,
    baseDate: params.occurredAt
  });

  return {
    category: budget.category,
    monthlyLimit,
    spentThisMonth,
    remainingThisMonth: Math.max(0, monthlyLimit - spentThisMonth),
    usagePercent: (spentThisMonth / monthlyLimit) * 100
  };
};
