import { reportingMonthlyPdfRequestSchema } from "@finance/shared";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { buildFinancialHealthReply } from "@/lib/services/planning/financial-health-service";
import { getSavingsGoalStatus } from "@/lib/services/planning/goal-service";
import { getUserPortfolioValuation } from "@/lib/services/market/portfolio-valuation-service";
import { formatMoney, formatMoneyWhole, formatPercent } from "@/lib/services/shared/money-format";
import { formatDurationFromMonths } from "@/lib/services/shared/projection-math-service";
import { analyzeRecurringExpenses } from "@/lib/services/transactions/recurring-expense-service";
import { normalizeExpenseBucketCategory } from "@/lib/services/transactions/category-override-service";
import type {
  ReportDateRange,
  ReportTransactionItem
} from "@/lib/services/reporting/report-service";

type MonthlyReportData = {
  periodLabel: string;
  incomeTotal: number;
  expenseTotal: number;
  savingTotal?: number;
  categoryBreakdown: Array<{ category: string; total: number }>;
  transactions?: ReportTransactionItem[];
};

const sanitizeFilePart = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const splitReplyLines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const REPORT_DATE_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric"
});

const REPORT_MONTH_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric"
});

const buildReportRangeLabel = (range: ReportDateRange) => {
  const sameDay =
    range.start.getUTCFullYear() === range.end.getUTCFullYear() &&
    range.start.getUTCMonth() === range.end.getUTCMonth() &&
    range.start.getUTCDate() === range.end.getUTCDate();
  if (sameDay) return REPORT_DATE_FORMATTER.format(range.start);

  const sameMonth =
    range.start.getUTCFullYear() === range.end.getUTCFullYear() &&
    range.start.getUTCMonth() === range.end.getUTCMonth();
  if (sameMonth) {
    return `${range.start.getUTCDate()}-${range.end.getUTCDate()} ${REPORT_MONTH_FORMATTER.format(range.start)}`;
  }

  return `${REPORT_DATE_FORMATTER.format(range.start)} - ${REPORT_DATE_FORMATTER.format(range.end)}`;
};

const buildBudgetSection = async (params: {
  userId: string;
  expenseTransactions: Array<{ category: string; amount: unknown }>;
}) => {
  const budgets = await prisma.budget.findMany({
    where: { userId: params.userId },
    orderBy: { updatedAt: "desc" }
  });
  if (!budgets.length) return null;

  const spentByCategory = new Map<string, number>();
  for (const transaction of params.expenseTransactions) {
    const category = normalizeExpenseBucketCategory(transaction.category);
    spentByCategory.set(category, (spentByCategory.get(category) ?? 0) + toNumber(transaction.amount));
  }

  const latestBudgetByCategory = new Map<string, (typeof budgets)[number]>();
  for (const budget of budgets) {
    const category = normalizeExpenseBucketCategory(budget.category);
    if (!latestBudgetByCategory.has(category)) {
      latestBudgetByCategory.set(category, budget);
    }
  }

  const lines = Array.from(latestBudgetByCategory.entries())
    .slice(0, 6)
    .map(([category, budget]) => {
      const limit = toNumber(budget.monthlyLimit);
      const spent = spentByCategory.get(category) ?? 0;
      const usage = limit > 0 ? (spent / limit) * 100 : 0;
      return `${category}: ${formatMoney(spent)} / ${formatMoney(limit)} (${usage.toFixed(1)}%)`;
    });

  return lines.length ? { title: "Budget Bulanan", lines } : null;
};

const buildGoalSection = async (userId: string) => {
  const goalStatus = await getSavingsGoalStatus(userId);
  if (goalStatus.targetAmount <= 0 || !goalStatus.goals.length) return null;

  if (goalStatus.totalGoals > 1) {
    return {
      title: "Progress Goal",
      lines: goalStatus.goals.slice(0, 5).map(
        (goal, index) =>
          `${index + 1}. ${goal.goalName} | ${formatPercent(goal.progressPercent)} | sisa ${formatMoney(
            goal.remainingAmount
          )}${goal.estimatedMonthsToGoal != null ? ` | eta ${formatDurationFromMonths(goal.estimatedMonthsToGoal)}` : ""}`
      )
    };
  }

  return {
    title: "Progress Goal",
    lines: [
      `${goalStatus.goalName ?? "Goal utama"} | ${formatPercent(goalStatus.progressPercent)} | sisa ${formatMoney(
        goalStatus.remainingAmount
      )}${goalStatus.estimatedMonthsToGoal != null ? ` | eta ${formatDurationFromMonths(goalStatus.estimatedMonthsToGoal)}` : ""}`,
      ...(goalStatus.contributionMonthStreak > 0
        ? [`Streak kontribusi: ${goalStatus.contributionMonthStreak} bulan`]
        : [])
    ]
  };
};

const ASSET_TYPE_LABELS = {
  GOLD: "Emas",
  STOCK: "Saham",
  MUTUAL_FUND: "Reksa dana",
  CRYPTO: "Crypto",
  DEPOSIT: "Tabungan/deposito",
  PROPERTY: "Properti",
  BUSINESS: "Bisnis",
  OTHER: "Aset lain"
} as const;

const getAssetTypeLabel = (assetType: keyof typeof ASSET_TYPE_LABELS | string) =>
  ASSET_TYPE_LABELS[assetType as keyof typeof ASSET_TYPE_LABELS] ?? assetType;

const buildPlainRebalanceStatus = (status: "HEALTHY" | "WATCH" | "ACTION") => {
  if (status === "HEALTHY") return "Aman dipantau. Komposisi aset masih cukup seimbang.";
  if (status === "ACTION") return "Perlu dicek. Ada aset atau tipe aset yang terlalu dominan.";
  return "Perlu dipantau. Belum darurat, tapi komposisinya mulai berat di satu sisi.";
};

const buildPortfolioSection = async (userId: string) => {
  const snapshot = await getUserPortfolioValuation(userId);
  if (!snapshot.items.length) return null;

  const assetRows = snapshot.items.slice(0, 12).map((item, index) => {
    const share = snapshot.totalCurrentValue > 0 ? (item.currentValue / snapshot.totalCurrentValue) * 100 : 0;
    const gainText =
      item.unrealizedGain > 0
        ? `naik ${formatMoneyWhole(item.unrealizedGain)}`
        : item.unrealizedGain < 0
          ? `turun ${formatMoneyWhole(Math.abs(item.unrealizedGain))}`
          : "belum berubah";
    const priceNote =
      item.pricingMode === "market"
        ? `harga pasar ${formatMoneyWhole(item.currentPrice)}`
        : `pakai harga input ${formatMoneyWhole(item.currentPrice)}`;

    return `Aset ${index + 1}: ${item.displayName} | Tipe: ${getAssetTypeLabel(item.assetType)} | Nilai: ${formatMoneyWhole(
      item.currentValue
    )} | Porsi: ${share.toFixed(1)}% | Jumlah: ${item.quantity} ${item.unit} | ${gainText} dari modal | ${priceNote}`;
  });
  const typeBreakdownText = snapshot.typeBreakdown
    .slice(0, 5)
    .map((item) => `${getAssetTypeLabel(item.assetType)} ${item.sharePercent.toFixed(1)}%`)
    .join(", ");
  const readableReasons = snapshot.rebalanceReasons.length
    ? snapshot.rebalanceReasons.map((reason) => `Yang perlu diperhatikan: ${reason}.`)
    : ["Yang perlu diperhatikan: belum ada sinyal besar, cukup lanjut dipantau rutin."];

  return {
    title: "Portfolio & Aset",
    lines: [
      `Total nilai aset sekarang: ${formatMoneyWhole(snapshot.totalCurrentValue)}.`,
      snapshot.totalUnrealizedGain >= 0
        ? `Dibanding modal awal, asetmu sedang naik sekitar ${formatMoneyWhole(snapshot.totalUnrealizedGain)}.`
        : `Dibanding modal awal, asetmu sedang turun sekitar ${formatMoneyWhole(Math.abs(snapshot.totalUnrealizedGain))}.`,
      `Aset terbesar adalah ${snapshot.topHoldingName ?? "-"}, porsinya ${snapshot.largestAssetShare.toFixed(
        1
      )}% dari semua aset. Artinya, kalau aset ini berubah besar, total asetmu ikut cukup terasa.`,
      `Aset yang mudah dicairkan sekitar ${formatMoneyWhole(snapshot.totalLiquidValue)} atau ${snapshot.liquidSharePercent.toFixed(
        1
      )}% dari total aset.`,
      `Komposisi sederhana: ${typeBreakdownText || "-"}.`,
      `Kesimpulan singkat: ${buildPlainRebalanceStatus(snapshot.rebalanceStatus)}`,
      ...readableReasons,
      "Daftar aset:",
      ...assetRows
    ]
  };
};

const buildRecurringSection = (expenseTransactions: Array<{
  category: string;
  amount: unknown;
  occurredAt: Date;
  detailTag?: string | null;
  merchant?: string | null;
  note?: string | null;
  rawText?: string | null;
}>) => {
  const recurringEntries = analyzeRecurringExpenses(
    expenseTransactions.map((transaction) => ({
      amount: toNumber(transaction.amount),
      category: transaction.category,
      occurredAt: transaction.occurredAt,
      merchant: transaction.merchant ?? null,
      note: transaction.note ?? null,
      rawText: transaction.rawText ?? null
    }))
  ).slice(0, 3);

  if (!recurringEntries.length) return null;

  return {
    title: "Recurring & Kebiasaan",
    lines: recurringEntries.map(
      (entry) =>
        `${entry.label} | ${entry.bucket} | ${entry.count} transaksi | total ${formatMoney(entry.total)}${
          entry.isSubscriptionLikely ? " | langganan" : ""
        }`
    )
  };
};

const buildTransactionListSection = (transactions: ReportTransactionItem[]) => {
  if (!transactions.length) return null;

  const dateFormatter = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short"
  });
  const visibleTransactions = transactions.slice(0, 35);
  const hiddenCount = transactions.length - visibleTransactions.length;
  const lines = visibleTransactions.map((transaction, index) => {
    const detail = [transaction.category, transaction.detailTag, transaction.merchant]
      .filter(Boolean)
      .join(" / ");
    return `${index + 1}. ${dateFormatter.format(transaction.occurredAt)} | ${transaction.type} | ${detail} | ${formatMoney(
      transaction.amount
    )}`;
  });

  if (hiddenCount > 0) {
    lines.push(`Dan ${hiddenCount} transaksi lain.`);
  }

  return {
    title: "Daftar Transaksi",
    lines
  };
};

export const buildMonthlyReportPdfAttachment = async (params: {
  userId: string;
  dateRange: ReportDateRange;
  reportData: MonthlyReportData;
}) => {
  const fetchedTransactions = await prisma.transaction.findMany({
    where: {
      userId: params.userId,
      occurredAt: {
        gte: params.dateRange.start,
        lte: params.dateRange.end
      }
    },
    orderBy: { occurredAt: "asc" }
  });
  const transactions =
    params.reportData.transactions ??
    fetchedTransactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: toNumber(transaction.amount),
      category: transaction.category,
      detailTag: transaction.detailTag ?? null,
      merchant: transaction.merchant ?? null,
      note: transaction.note ?? null,
      occurredAt: transaction.occurredAt
    }));
  const expenseTransactions = fetchedTransactions.filter((transaction) => transaction.type === "EXPENSE");

  const healthReply = await buildFinancialHealthReply({
    userId: params.userId,
    mode: "CLOSING",
    dateRange: params.dateRange
  });
  const topCategory = params.reportData.categoryBreakdown[0] ?? null;
  const totalTransactions = expenseTransactions.length;
  const savingTotal = params.reportData.savingTotal ?? 0;
  const balance = params.reportData.incomeTotal - params.reportData.expenseTotal - savingTotal;
  const savingRate =
    params.reportData.incomeTotal > 0 ? (balance / params.reportData.incomeTotal) * 100 : 0;
  const reportRangeLabel = buildReportRangeLabel(params.dateRange);

  const sections = [
    {
      title: "Ringkasan Pengeluaran",
      lines: params.reportData.categoryBreakdown.slice(0, 6).map(
        (item, index) => `${index + 1}. ${item.category}: ${formatMoney(item.total)}`
      )
    },
    await buildBudgetSection({
      userId: params.userId,
      expenseTransactions
    }),
    buildTransactionListSection(transactions),
    await buildGoalSection(params.userId),
    await buildPortfolioSection(params.userId),
    buildRecurringSection(expenseTransactions),
    {
      title: "Financial Closing",
      lines: splitReplyLines(healthReply).slice(0, 12)
    }
  ].filter(Boolean) as Array<{ title: string; lines: string[] }>;

  const payload = reportingMonthlyPdfRequestSchema.parse({
    title: "Monthly Finance Report",
    subtitle: reportRangeLabel,
    periodLabel: reportRangeLabel,
    summaryLines: [
      `Income: ${formatMoney(params.reportData.incomeTotal)}`,
      `Expense: ${formatMoney(params.reportData.expenseTotal)}`,
      savingTotal > 0 ? `Saving/goal: ${formatMoney(savingTotal)}` : null,
      `Sisa cashflow: ${formatMoney(balance)}`,
      `Saving rate: ${formatPercent(savingRate)}`,
      `Jumlah transaksi expense: ${totalTransactions}`,
      topCategory ? `Top kategori: ${topCategory.category} (${formatMoney(topCategory.total)})` : "Top kategori: -"
    ].filter((line): line is string => Boolean(line)),
    sections
  });

  const response = await fetch(`${env.REPORTING_SERVICE_URL}/reports/monthly-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Reporting service PDF error: ${response.status} ${errorBody}`);
  }

  const pdfBuffer = Buffer.from(await response.arrayBuffer());
  return {
    documentBase64: pdfBuffer.toString("base64"),
    documentMimeType: "application/pdf",
    documentFileName: `laporan-keuangan-${sanitizeFilePart(params.reportData.periodLabel)}.pdf`
  };
};
