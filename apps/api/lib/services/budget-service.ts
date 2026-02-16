import { prisma } from "../prisma";

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const normalizeCategory = (value: string) => value.trim().replace(/\s+/g, " ");

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
  const monthlyTotal = await prisma.transaction.aggregate({
    where: {
      userId: params.userId,
      type: "EXPENSE",
      category: params.category,
      occurredAt: {
        gte: range.start,
        lte: range.end
      }
    },
    _sum: {
      amount: true
    }
  });

  return toNumber(monthlyTotal._sum.amount ?? 0);
};

export const upsertCategoryBudget = async (params: {
  userId: string;
  category: string;
  monthlyLimit: number;
}) => {
  const category = normalizeCategory(params.category);

  const budget = await prisma.budget.upsert({
    where: {
      userId_category: {
        userId: params.userId,
        category
      }
    },
    update: {
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
  const budget = await prisma.budget.findUnique({
    where: {
      userId_category: {
        userId,
        category: normalizedCategory
      }
    }
  });

  if (!budget) return null;

  const spent = await getMonthlyCategorySpent({
    userId,
    category: normalizedCategory,
    baseDate: occurredAt
  });
  const limit = toNumber(budget.monthlyLimit);
  if (spent <= limit) return null;

  return `Alert: budget kategori ${normalizedCategory} terlampaui. Limit ${limit.toFixed(2)}, aktual ${spent.toFixed(2)}.`;
};
