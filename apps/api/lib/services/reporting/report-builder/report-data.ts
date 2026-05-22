import { type ReportPeriod } from "@finance/shared";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABELS } from "@/lib/services/reporting/query-language";
import { aggregateTransactions, getPeriodRange } from "@/lib/services/reporting/transaction-summary";
import { type ReportDateRange } from "@/lib/services/reporting/shared";
import { getBudgetCategoryLookupKey } from "@/lib/services/transactions/budget/category";

const EXPENSE_PLAN_CATEGORY_LABELS: Record<string, string> = {
  food: "Food & Drink",
  transport: "Transport",
  bills: "Bills",
  entertainment: "Entertainment",
  others: "Others"
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

export const getUserReportData = async (
  userId: string,
  period: ReportPeriod,
  dateRange?: ReportDateRange | null
) => {
  const range = dateRange ?? {
    ...getPeriodRange(period, new Date()),
    label: PERIOD_LABELS[period]
  };
  const expensePlanModel = (prisma as unknown as { expensePlan?: any }).expensePlan;
  const [transactions, activeExpensePlan] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        occurredAt: {
          gte: range.start,
          lte: range.end
        }
      },
      orderBy: { occurredAt: "asc" }
    }),
    expensePlanModel?.findFirst
      ? expensePlanModel.findFirst({
          where: { userId, isActive: true },
          include: { items: true },
          orderBy: { createdAt: "desc" }
        })
      : Promise.resolve(null)
  ]);

  const expensePlanBudgets = (activeExpensePlan?.items ?? []).map(
    (item: { categoryKey?: unknown; amount?: unknown }) => {
      const categoryKey = String(item.categoryKey ?? "").trim();
      const normalizedKey = categoryKey.toLowerCase();
      return {
        category: EXPENSE_PLAN_CATEGORY_LABELS[normalizedKey] ?? categoryKey,
        monthlyLimit: toNumber(item.amount)
      };
    }
  );
  const budgets = expensePlanBudgets;

  const budgetByCategory = new Map<string, { category: string; monthlyLimit: number }>();
  for (const budget of budgets) {
    budgetByCategory.set(getBudgetCategoryLookupKey(budget.category), budget);
  }
  const dedupedCategoryBudgets = Array.from(budgetByCategory.values()).sort((left, right) =>
    left.category.localeCompare(right.category, "id-ID")
  );

  const aggregated = aggregateTransactions(
    transactions.map((tx) => ({
      type: tx.type,
      amount: toNumber(tx.amount),
      category: tx.category,
      occurredAt: tx.occurredAt
    })),
    range
  );

  return {
    period,
    periodLabel: range.label,
    categoryBudgets: dedupedCategoryBudgets,
    transactions: transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: toNumber(tx.amount),
      category: tx.category,
      detailTag: tx.detailTag ?? null,
      merchant: tx.merchant ?? null,
      note: tx.note ?? null,
      occurredAt: tx.occurredAt
    })),
    ...aggregated
  };
};
