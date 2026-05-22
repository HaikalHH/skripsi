import { prisma } from "@/lib/prisma";
import { toNumber } from "../helpers/number";
import {
  getBudgetCategoryBucket,
  getBudgetCategoryLookupKey,
  normalizeBudgetCategoryName
} from "./category";

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
  const lookupKey = getBudgetCategoryLookupKey(params.category);
  const bucket = getBudgetCategoryBucket(params.category);

  return transactions.reduce((sum, transaction) => {
    const transactionCategory = String(transaction.category ?? "");
    if (
      getBudgetCategoryLookupKey(transactionCategory) !== lookupKey &&
      getBudgetCategoryBucket(transactionCategory) !== bucket
    ) {
      return sum;
    }
    return sum + toNumber(transaction.amount);
  }, 0);
};

export const findBudgetByCategoryName = async (params: { userId: string; category: string }) => {
  const budgets = await prisma.budget.findMany({
    where: {
      userId: params.userId
    }
  });
  const lookupKey = getBudgetCategoryLookupKey(params.category);
  const matchingBudgets = budgets.filter(
    (budget) => getBudgetCategoryLookupKey(budget.category) === lookupKey
  );
  if (!matchingBudgets.length) return null;

  return (
    matchingBudgets.find((budget) => budget.category === normalizeBudgetCategoryName(params.category)) ??
    matchingBudgets.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ??
    null
  );
};

export const pickMatchingBudget = async (params: { userId: string; category: string }) => {
  const exactBudget = await findBudgetByCategoryName(params);
  if (exactBudget) return exactBudget;

  const budgets = await prisma.budget.findMany({
    where: {
      userId: params.userId
    }
  });
  const bucket = getBudgetCategoryBucket(params.category);
  const matchingBudgets = budgets.filter((budget) => getBudgetCategoryBucket(budget.category) === bucket);
  if (!matchingBudgets.length) return null;

  return (
    matchingBudgets.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ??
    null
  );
};
