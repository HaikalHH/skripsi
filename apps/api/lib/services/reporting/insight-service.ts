import { prisma } from "@/lib/prisma";
import { generateAIInsight } from "@/lib/services/ai/ai-service";
import { analyzeRecurringExpenses } from "@/lib/services/transactions/recurring-expense-service";
import { buildTransactionDetailLabel, inferTransactionDetailTag } from "@/lib/services/transactions/detail-tag-service";
import {
  buildUserFinancialContextSummary,
  loadUserFinancialContext
} from "@/lib/services/user/user-financial-context-service";

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const isWeekendDate = (date: Date) => {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
};

const buildDetailStats = (
  transactions: Array<{
    type: string;
    category: string;
    amount: unknown;
    occurredAt: Date;
    detailTag?: string | null;
    merchant?: string | null;
    note?: string | null;
    rawText?: string | null;
  }>
) => {
  const detailMap = new Map<
    string,
    {
      total: number;
      count: number;
      weekendTotal: number;
      weekdayTotal: number;
    }
  >();

  for (const tx of transactions) {
    const label = buildTransactionDetailLabel({
      detailTag:
        tx.detailTag ??
        inferTransactionDetailTag({
          type: tx.type === "INCOME" ? "INCOME" : "EXPENSE",
          category: tx.category,
          merchant: tx.merchant ?? null,
          note: tx.note ?? null,
          rawText: tx.rawText ?? null
        }),
      merchant: tx.merchant ?? null,
      note: tx.note ?? null,
      rawText: tx.rawText ?? null
    });
    const current = detailMap.get(label) ?? {
      total: 0,
      count: 0,
      weekendTotal: 0,
      weekdayTotal: 0
    };
    const amount = toNumber(tx.amount);
    current.total += amount;
    current.count += 1;
    if (isWeekendDate(tx.occurredAt)) {
      current.weekendTotal += amount;
    } else {
      current.weekdayTotal += amount;
    }
    detailMap.set(label, current);
  }

  return Array.from(detailMap.entries()).map(([label, value]) => ({
    label,
    ...value,
    averageAmount: value.count > 0 ? value.total / value.count : 0
  }));
};

export const generateUserInsight = async (userId: string): Promise<string> => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const rollingStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1, 0, 0, 0, 0));
  const [txs, rollingTxs, userContext] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        occurredAt: {
          gte: start,
          lte: now
        }
      }
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        type: "EXPENSE",
        occurredAt: {
          gte: rollingStart,
          lte: now
        }
      }
    }),
    loadUserFinancialContext({ userId })
  ]);

  if (!txs.length && !userContext.monthlyIncomeTotal && !userContext.monthlyExpenseTotal) {
    return "Belum ada transaksi bulan ini. Mulai dengan mencatat transaksi harian Anda.";
  }

  let income = 0;
  let expense = 0;
  const categoryMap = new Map<string, number>();

  if (txs.length) {
    for (const tx of txs) {
      const amount = toNumber(tx.amount);
      if (tx.type === "INCOME") {
        income += amount;
      } else {
        expense += amount;
        categoryMap.set(tx.category, (categoryMap.get(tx.category) ?? 0) + amount);
      }
    }
  } else {
    income = userContext.monthlyIncomeTotal ?? 0;
    expense = userContext.monthlyExpenseTotal ?? 0;
    for (const bucket of userContext.expenseBuckets) {
      if (bucket.amount <= 0) continue;
      categoryMap.set(bucket.categoryKey, bucket.amount);
    }
  }

  const topCategory = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1])[0];
  const balance = income - expense;
  const rules: string[] = [];
  const monthlyExpenseTotals = new Map<string, number>();
  const merchantTotals = new Map<string, number>();
  const currentMerchantTotals = new Map<string, number>();
  const merchantCounts = new Map<string, number>();

  for (const tx of rollingTxs) {
    const amount = toNumber(tx.amount);
    const monthKey = `${tx.occurredAt.getUTCFullYear()}-${String(tx.occurredAt.getUTCMonth() + 1).padStart(2, "0")}`;
    monthlyExpenseTotals.set(monthKey, (monthlyExpenseTotals.get(monthKey) ?? 0) + amount);
    const merchantLabel = buildTransactionDetailLabel({
      detailTag:
        tx.detailTag ??
        inferTransactionDetailTag({
          type: tx.type,
          category: tx.category,
          merchant: tx.merchant ?? null,
          note: tx.note ?? null,
          rawText: tx.rawText ?? null
        }),
      merchant: tx.merchant ?? null,
      note: tx.note ?? null,
      rawText: tx.rawText ?? null
    });
    merchantTotals.set(merchantLabel, (merchantTotals.get(merchantLabel) ?? 0) + amount);
    merchantCounts.set(merchantLabel, (merchantCounts.get(merchantLabel) ?? 0) + 1);
    if (tx.occurredAt >= start) {
      currentMerchantTotals.set(merchantLabel, (currentMerchantTotals.get(merchantLabel) ?? 0) + amount);
    }
  }

  const recurring = analyzeRecurringExpenses(
    rollingTxs.map((tx) => ({
      amount: toNumber(tx.amount),
      category: tx.category,
      merchant: tx.merchant ?? null,
      note: tx.note ?? null,
      rawText: tx.rawText ?? null,
      occurredAt: tx.occurredAt
    }))
  );
  const monthlySeries = Array.from(monthlyExpenseTotals.entries()).sort((left, right) =>
    left[0].localeCompare(right[0])
  );
  const currentMonthExpense = monthlySeries.at(-1)?.[1] ?? expense;
  const previousMonthExpense = monthlySeries.at(-2)?.[1] ?? 0;
  const trendDelta = currentMonthExpense - previousMonthExpense;
  const trendPercent =
    previousMonthExpense > 0 ? (trendDelta / previousMonthExpense) * 100 : null;
  const topMerchant = Array.from(merchantTotals.entries()).sort((a, b) => b[1] - a[1])[0];
  const topCurrentMerchant = Array.from(currentMerchantTotals.entries()).sort((a, b) => b[1] - a[1])[0];
  const frequentMerchant = Array.from(merchantCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  const currentExpenseTxs = txs.filter((tx) => tx.type === "EXPENSE");
  const previousRollingTxs = rollingTxs.filter((tx) => tx.occurredAt < start);
  const detailStats = buildDetailStats(rollingTxs);
  const lowTicketHighFrequency = [...detailStats]
    .filter((entry) => entry.count >= 3 && entry.averageAmount <= 150_000 && entry.total >= 150_000)
    .sort((left, right) => right.total - left.total || right.count - left.count)[0];
  const weekendBias = [...detailStats]
    .filter((entry) => entry.weekendTotal > entry.weekdayTotal && entry.weekendTotal >= 100_000)
    .sort((left, right) => right.weekendTotal - left.weekendTotal)[0];
  const previousLabels = new Set(
    buildDetailStats(previousRollingTxs).map((entry) => entry.label.toLowerCase())
  );
  const currentLabels = buildDetailStats(currentExpenseTxs);
  const newDetail = currentLabels
    .filter((entry) => !previousLabels.has(entry.label.toLowerCase()))
    .sort((left, right) => right.total - left.total)[0];
  const topCategoryShare = topCategory && expense > 0 ? (topCategory[1] / expense) * 100 : 0;
  const topMerchantShare =
    topCurrentMerchant && expense > 0 ? (topCurrentMerchant[1] / expense) * 100 : 0;
  const recentThreeMonths = monthlySeries.slice(-3).map((item) => item[1]);
  const hasThreeMonthUptrend =
    recentThreeMonths.length === 3 &&
    recentThreeMonths[0] < recentThreeMonths[1] &&
    recentThreeMonths[1] < recentThreeMonths[2];

  if (expense > income) {
    rules.push("Pengeluaran bulan ini lebih besar dari pemasukan.");
  } else {
    rules.push("Arus kas masih positif bulan ini.");
  }

  if (topCategory) {
    rules.push(`Kategori pengeluaran tertinggi: ${topCategory[0]} (${topCategory[1].toFixed(2)}).`);
    if (topCategoryShare >= 40) {
      rules.push(`Sekitar ${topCategoryShare.toFixed(1)}% expense bulan ini tertahan di kategori ${topCategory[0]}.`);
    }
  }

  if (trendPercent !== null) {
    const direction = trendDelta >= 0 ? "naik" : "turun";
    rules.push(`Total expense bulan ini ${direction} ${Math.abs(trendPercent).toFixed(1)}% dibanding bulan lalu.`);
  }

  if (topMerchant) {
    rules.push(`Merchant/detail paling besar: ${topMerchant[0]} (${topMerchant[1].toFixed(2)}).`);
  }

  if (topCurrentMerchant && topMerchantShare >= 20) {
    rules.push(
      `Merchant/detail ${topCurrentMerchant[0]} sendiri menyumbang sekitar ${topMerchantShare.toFixed(1)}% dari expense bulan ini.`
    );
  }

  if (frequentMerchant) {
    rules.push(`Merchant/detail paling sering muncul: ${frequentMerchant[0]} (${frequentMerchant[1]}x).`);
  }

  if (recurring.length) {
    const topRecurring = recurring[0];
    rules.push(
      `Recurring paling menonjol: ${topRecurring.label} sekitar ${topRecurring.count}x dengan rerata ${topRecurring.averageAmount.toFixed(2)}.`
    );
  }

  if (lowTicketHighFrequency) {
    rules.push(
      `Kebocoran receh tapi sering paling terlihat di ${lowTicketHighFrequency.label} (${lowTicketHighFrequency.count}x, total ${lowTicketHighFrequency.total.toFixed(2)}).`
    );
  }

  if (weekendBias) {
    rules.push(
      `Pola weekend paling berat datang dari ${weekendBias.label} (weekend ${weekendBias.weekendTotal.toFixed(2)} vs weekday ${weekendBias.weekdayTotal.toFixed(2)}).`
    );
  }

  if (newDetail) {
    rules.push(`Detail baru yang mulai muncul bulan ini: ${newDetail.label} (${newDetail.total.toFixed(2)}).`);
  }

  if (hasThreeMonthUptrend) {
    rules.push("Total expense menunjukkan tren naik 3 bulan beruntun, jadi perlu diawasi sebelum jadi pola permanen.");
  }

  if (income > 0) {
    const savingsRate = (balance / income) * 100;
    rules.push(`Perkiraan savings rate: ${savingsRate.toFixed(1)}%.`);
  }

  const summary = `income=${income.toFixed(2)}, expense=${expense.toFixed(
    2
  )}, balance=${balance.toFixed(2)}, topCategory=${topCategory?.[0] ?? "N/A"}, trendPercent=${
    trendPercent?.toFixed(2) ?? "N/A"
  }, topMerchant=${topMerchant?.[0] ?? "N/A"}, topMerchantShare=${topMerchantShare.toFixed(2)}, recurringTop=${recurring[0]?.label ?? "N/A"}, lowTicketLeak=${
    lowTicketHighFrequency?.label ?? "N/A"
  }, weekendBias=${weekendBias?.label ?? "N/A"}, newDetail=${newDetail?.label ?? "N/A"}, threeMonthUptrend=${hasThreeMonthUptrend}; ${buildUserFinancialContextSummary(
    userContext
  )}`;

  try {
    const aiText = await generateAIInsight(summary);
    return `${rules.join(" ")} ${aiText}`.trim();
  } catch {
    return rules.join(" ");
  }
};
