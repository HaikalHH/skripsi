import type { ReportPeriod } from "@finance/shared";

export type AggregationTransaction = {
  type: "INCOME" | "EXPENSE";
  amount: number;
  category: string;
  occurredAt: Date;
};

export type AggregationRange = {
  start: Date;
  end: Date;
};

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

export const getPeriodRange = (period: ReportPeriod, now = new Date()): AggregationRange => {
  const end = new Date(now);
  const start = new Date(now);

  if (period === "daily") {
    start.setUTCHours(0, 0, 0, 0);
  } else if (period === "weekly") {
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - 6);
  } else {
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(1);
  }

  return { start, end };
};

export const aggregateTransactions = (
  transactions: AggregationTransaction[],
  range: AggregationRange
) => {
  let incomeTotal = 0;
  let expenseTotal = 0;
  const expenseCategoryMap = new Map<string, number>();
  const trendMap = new Map<string, { income: number; expense: number }>();

  const cursor = new Date(range.start);
  while (cursor <= range.end) {
    trendMap.set(dateKey(cursor), { income: 0, expense: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  for (const tx of transactions) {
    if (tx.type === "INCOME") {
      incomeTotal += tx.amount;
    } else {
      expenseTotal += tx.amount;
      expenseCategoryMap.set(tx.category, (expenseCategoryMap.get(tx.category) ?? 0) + tx.amount);
    }

    const key = dateKey(tx.occurredAt);
    const current = trendMap.get(key) ?? { income: 0, expense: 0 };
    if (tx.type === "INCOME") {
      current.income += tx.amount;
    } else {
      current.expense += tx.amount;
    }
    trendMap.set(key, current);
  }

  const categoryBreakdown = Array.from(expenseCategoryMap.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  const trend = Array.from(trendMap.entries())
    .map(([date, values]) => ({ date, income: values.income, expense: values.expense }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    incomeTotal,
    expenseTotal,
    categoryBreakdown,
    trend
  };
};
