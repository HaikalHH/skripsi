import { prisma } from "@/lib/prisma";
import { normalizeExpenseBucketCategory } from "../category";
import { toNumber } from "../helpers/number";

const normalizeCategory = (value: string) => normalizeExpenseBucketCategory(value);

export const getMonthRange = (baseDate: Date) => {
  const start = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(
    Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );
  return { start, end };
};

export const getMonthlyCategorySpent = async (params: {
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

export const pickMatchingBudget = async (params: { userId: string; category: string }) => {
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
