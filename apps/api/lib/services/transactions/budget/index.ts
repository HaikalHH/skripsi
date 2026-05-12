import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/services/shared/money-format";
import { normalizeExpenseBucketCategory } from "../category";
import { toNumber } from "../helpers/number";
import { getMonthlyCategorySpent, pickMatchingBudget } from "./data-access";

const BUDGET_WARNING_THRESHOLD = 0.8;

const normalizeCategory = (value: string) => normalizeExpenseBucketCategory(value);

export const getMatchingCategoryBudget = async (params: { userId: string; category: string }) => {
  const category = normalizeCategory(params.category);
  const budget = await pickMatchingBudget({
    userId: params.userId,
    category
  });

  return {
    category,
    budget
  };
};

export const upsertCategoryBudget = async (params: {
  userId: string;
  category: string;
  monthlyLimit: number;
}) => {
  const category = normalizeCategory(params.category);
  const existingBudget = await pickMatchingBudget({
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
    remainingThisMonth: limit - spentThisMonth
  };
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
    return `Alert: budget kategori ${normalizedCategory} terlampaui. Limit ${formatMoney(limit)}, aktual ${formatMoney(spent)}.`;
  }

  const usageRatio = spent / limit;
  if (usageRatio >= BUDGET_WARNING_THRESHOLD) {
    const remaining = Math.max(0, limit - spent);
    return `Warning: budget kategori ${normalizedCategory} hampir habis. Sisa ${formatMoney(
      remaining
    )} dari limit ${formatMoney(limit)}.`;
  }

  return null;
};
