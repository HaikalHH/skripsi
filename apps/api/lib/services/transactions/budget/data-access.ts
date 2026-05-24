import { ExpensePlanSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "../helpers/number";
import {
  getBudgetCategoryBucket,
  getBudgetCategoryLookupKey,
  normalizeBudgetCategoryName
} from "./category";

export type ExpensePlanBudgetItem = {
  category: string;
  monthlyLimit: number;
  updatedAt?: Date | null;
};

export const getMonthRange = (baseDate: Date) => {
  const start = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(
    Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );
  return { start, end };
};

const getExpensePlanModel = () => (prisma as unknown as { expensePlan?: any }).expensePlan;

const mapPlanItemToBudget = (item: {
  categoryKey?: unknown;
  amount?: unknown;
  updatedAt?: Date | string | null;
}): ExpensePlanBudgetItem => ({
  category: normalizeBudgetCategoryName(String(item.categoryKey ?? "")),
  monthlyLimit: toNumber(item.amount),
  updatedAt: item.updatedAt instanceof Date ? item.updatedAt : item.updatedAt ? new Date(item.updatedAt) : null
});

const dedupeBudgetItems = (items: ExpensePlanBudgetItem[]) => {
  const itemByKey = new Map<string, ExpensePlanBudgetItem>();
  for (const item of items) {
    const key = getBudgetCategoryLookupKey(item.category);
    const current = itemByKey.get(key);
    if (!current || (item.updatedAt?.getTime() ?? 0) >= (current.updatedAt?.getTime() ?? 0)) {
      itemByKey.set(key, item);
    }
  }
  return Array.from(itemByKey.values());
};

export const listExpensePlanBudgetItems = async (userId: string): Promise<ExpensePlanBudgetItem[]> => {
  const expensePlanModel = getExpensePlanModel();
  if (!expensePlanModel?.findFirst) return [];

  const plan = await expensePlanModel.findFirst({
    where: { userId, isActive: true },
    include: { items: true },
    orderBy: { createdAt: "desc" }
  });

  return dedupeBudgetItems((plan?.items ?? []).map(mapPlanItemToBudget)).sort((left, right) =>
    left.category.localeCompare(right.category, "id-ID")
  );
};

export const replaceActiveExpensePlanBudgetItems = async (params: {
  userId: string;
  items: ExpensePlanBudgetItem[];
}) => {
  const expensePlanModel = getExpensePlanModel();
  const normalizedItems = dedupeBudgetItems(
    params.items
      .map((item) => ({
        category: normalizeBudgetCategoryName(item.category),
        monthlyLimit: Math.max(0, Math.round(item.monthlyLimit))
      }))
      .filter((item) => item.category && item.monthlyLimit >= 0)
  );
  const totalMonthlyExpense = normalizedItems.reduce((sum, item) => sum + item.monthlyLimit, 0);

  await prisma.user.update({
    where: { id: params.userId },
    data: { monthlyBudget: totalMonthlyExpense }
  });

  if (expensePlanModel?.updateMany && expensePlanModel?.create) {
    await expensePlanModel.updateMany({
      where: { userId: params.userId, isActive: true },
      data: { isActive: false }
    });
    await expensePlanModel.create({
      data: {
        userId: params.userId,
        source: ExpensePlanSource.MANUAL_USER_PLAN,
        totalMonthlyExpense: BigInt(totalMonthlyExpense),
        isActive: true,
        items: {
          create: normalizedItems.map((item) => ({
            categoryKey: item.category,
            amount: BigInt(item.monthlyLimit)
          }))
        }
      }
    });
  }

  return {
    items: normalizedItems,
    totalMonthlyExpense
  };
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
    const exactMatch = getBudgetCategoryLookupKey(transactionCategory) === lookupKey;
    const bucketMatch = bucket !== "Others" && getBudgetCategoryBucket(transactionCategory) === bucket;
    if (!exactMatch && !bucketMatch) {
      return sum;
    }
    return sum + toNumber(transaction.amount);
  }, 0);
};

export const findBudgetItemByCategoryName = async (params: { userId: string; category: string }) => {
  const items = await listExpensePlanBudgetItems(params.userId);
  const lookupKey = getBudgetCategoryLookupKey(params.category);
  return items.find((item) => getBudgetCategoryLookupKey(item.category) === lookupKey) ?? null;
};

export const pickMatchingBudgetItem = async (params: { userId: string; category: string }) => {
  const exactBudget = await findBudgetItemByCategoryName(params);
  if (exactBudget) return exactBudget;

  const items = await listExpensePlanBudgetItems(params.userId);
  const bucket = getBudgetCategoryBucket(params.category);
  if (bucket === "Others") return null;
  return items.find((item) => getBudgetCategoryBucket(item.category) === bucket) ?? null;
};
