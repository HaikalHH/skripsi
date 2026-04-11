import { prisma } from "@/lib/prisma";
import { normalizeExpenseBucketCategory } from "@/lib/services/transactions/category-override-service";
import { formatMoney } from "@/lib/services/shared/money-format";

const BUDGET_WARNING_THRESHOLD = 0.8;

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const normalizeCategory = (value: string) => normalizeExpenseBucketCategory(value);

const getMonthRange = (baseDate: Date) => {
  const start = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(
    Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );
  return { start, end };
};

const getMonthlyCategorySpent = async (params: {
  userId: string;
  category: string;
  baseDate: Date;
}): Promise<number> => {
  const range = getMonthRange(params.baseDate);
  const transactions = await prisma.transaction.findMany({
    where: {
      userId: params.userId,
      type: "EXPENSE",
      occurredAt: {
        gte: range.start,
        lte: range.end
      }
    }
  });

  return transactions.reduce((sum, transaction) => {
    if (normalizeCategory(transaction.category) !== params.category) return sum;
    return sum + toNumber(transaction.amount);
  }, 0);
};

const pickMatchingBudget = async (params: { userId: string; category: string }) => {
  const budgets = await prisma.budget.findMany({
    where: {
      userId: params.userId
    }
  });

  const matchingBudgets = budgets.filter((budget) => normalizeCategory(budget.category) === params.category);
  if (!matchingBudgets.length) return null;

  return (
    matchingBudgets.find((budget) => budget.category === params.category) ??
    matchingBudgets.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ??
    null
  );
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
