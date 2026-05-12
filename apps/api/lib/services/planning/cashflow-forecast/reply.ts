import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/services/shared/money-format";
import {
  DATE_LABEL_FORMATTER,
  DAY_MS,
  endOfMonth,
  getLastPayday,
  getNextPayday,
  getTomorrowEnd,
  getWeekendEnd,
  startOfMonth,
  wholeDayDiff
} from "./date-utils";
import { getAssetModel, getFinancialProfileModel } from "./model-access";
import { toNumber } from "./number-utils";
import { buildHorizonLabel, pickExpenseRunRate } from "./projection";
import type { CashflowForecastQuery } from "./types";

export const buildCashflowForecastReply = async (params: {
  userId: string;
  query: CashflowForecastQuery;
  now?: Date;
}) => {
  const now = params.now ?? new Date();
  const financialProfileModel = getFinancialProfileModel();
  const assetModel = getAssetModel();

  const [user, profile, liquidAssets] = await Promise.all([
    prisma.user.findUnique({
      where: { id: params.userId },
      select: {
        salaryDate: true
      }
    }),
    financialProfileModel?.findUnique({
      where: { userId: params.userId },
      select: {
        activeIncomeMonthly: true,
        passiveIncomeMonthly: true,
        monthlyIncomeTotal: true,
        monthlyExpenseTotal: true
      }
    }) ?? Promise.resolve(null),
    assetModel?.findMany({
      where: {
        userId: params.userId,
        assetType: {
          in: ["CASH", "SAVINGS"]
        }
      },
      select: {
        estimatedValue: true
      }
    }) ?? Promise.resolve([])
  ]);

  if (!user) {
    return "Data user belum ditemukan, jadi saya belum bisa hitung cashflow kamu.";
  }

  if (params.query.horizon === "PAYDAY" && !user.salaryDate) {
    return "Saya belum bisa hitung sampai gajian karena tanggal gajian kamu belum ada. Isi dulu tanggal gajian, misalnya: tanggal gajian 25.";
  }

  const salaryDate = user.salaryDate ?? null;
  const cycleStart = salaryDate ? getLastPayday(now, salaryDate) : startOfMonth(now);
  const targetDate =
    params.query.horizon === "PAYDAY" && salaryDate
      ? getNextPayday(now, salaryDate)
      : params.query.horizon === "NEXT_7_DAYS"
        ? new Date(now.getTime() + 7 * DAY_MS)
        : params.query.horizon === "WEEKEND"
          ? getWeekendEnd(now)
          : params.query.horizon === "TOMORROW"
            ? getTomorrowEnd(now)
            : endOfMonth(now);

  const rollingExpenseStart = new Date(now.getTime() - 29 * DAY_MS);
  const [cycleTransactions, rollingExpenses] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId: params.userId,
        occurredAt: {
          gte: cycleStart,
          lte: now
        }
      },
      orderBy: { occurredAt: "asc" }
    }),
    prisma.transaction.findMany({
      where: {
        userId: params.userId,
        type: "EXPENSE",
        occurredAt: {
          gte: rollingExpenseStart,
          lte: now
        }
      },
      orderBy: { occurredAt: "asc" }
    })
  ]);

  const cycleIncomeRecorded = cycleTransactions
    .filter((transaction) => transaction.type === "INCOME")
    .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  const cycleExpense = cycleTransactions
    .filter((transaction) => transaction.type === "EXPENSE")
    .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  const cycleSaving = cycleTransactions
    .filter((transaction) => transaction.type === "SAVING")
    .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  const rollingExpense = rollingExpenses.reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  const liquidAssetValue = liquidAssets.reduce((sum, asset) => sum + toNumber(asset.estimatedValue), 0);

  const activeIncomeMonthly = toNumber(profile?.activeIncomeMonthly ?? 0);
  const passiveIncomeMonthly = toNumber(profile?.passiveIncomeMonthly ?? 0);
  const monthlyIncomeProfile = toNumber(profile?.monthlyIncomeTotal ?? 0);
  const monthlyExpenseProfile = toNumber(profile?.monthlyExpenseTotal ?? 0);

  const daysInCurrentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const cycleDays = Math.max(1, wholeDayDiff(cycleStart, now) + 1);
  const daysRemaining = Math.max(0, wholeDayDiff(now, targetDate));
  const rollingDays = Math.max(1, wholeDayDiff(rollingExpenseStart, now) + 1);

  const currentIncomeEstimate =
    cycleIncomeRecorded > 0
      ? cycleIncomeRecorded
      : salaryDate && (activeIncomeMonthly > 0 || monthlyIncomeProfile > 0)
        ? activeIncomeMonthly || monthlyIncomeProfile
        : 0;
  const currentIncomeSource =
    cycleIncomeRecorded > 0 ? "transaksi tercatat" : currentIncomeEstimate > 0 ? "estimasi profil" : "belum ada";

  const passiveIncomeProjected =
    passiveIncomeMonthly > 0 ? Math.round((passiveIncomeMonthly / daysInCurrentMonth) * daysRemaining) : 0;
  const scheduledIncomeBeforeTarget =
    salaryDate &&
    activeIncomeMonthly > 0 &&
    params.query.horizon !== "PAYDAY" &&
    getNextPayday(now, salaryDate).getTime() <= targetDate.getTime()
      ? activeIncomeMonthly
      : 0;

  const expenseRunRate = pickExpenseRunRate({
    cycleExpense,
    cycleDays,
    rollingExpense,
    rollingDays,
    monthlyExpenseProfile,
    daysInMonth: daysInCurrentMonth
  });

  if (expenseRunRate.value <= 0 && cycleExpense <= 0 && monthlyExpenseProfile <= 0) {
    return "Data pengeluaran kamu belum cukup untuk saya proyeksikan. Catat dulu beberapa transaksi atau isi profil pengeluaran bulanan ya Boss.";
  }

  const bufferNow = currentIncomeEstimate - cycleExpense - cycleSaving + liquidAssetValue;
  const scenarioExpenseAmount = params.query.scenarioExpenseAmount ?? 0;
  const projectedExpenseUntilTarget =
    Math.round(expenseRunRate.value * daysRemaining) + scenarioExpenseAmount;
  const projectedEndingBalance =
    bufferNow + scheduledIncomeBeforeTarget + passiveIncomeProjected - projectedExpenseUntilTarget;
  const horizonLabel = buildHorizonLabel(params.query.horizon, targetDate);
  const basisStartLabel = DATE_LABEL_FORMATTER.format(cycleStart);
  const basisEndLabel = DATE_LABEL_FORMATTER.format(now);

  const headline =
    params.query.mode === "REMAINING"
      ? `Estimasi sisa cashflow ${horizonLabel} sekitar ${formatMoney(projectedEndingBalance)}.`
      : projectedEndingBalance >= 0
        ? `Secara estimasi kamu masih aman ${horizonLabel}.`
        : `Dengan pola sekarang kamu berisiko minus ${horizonLabel}.`;

  return [
    headline,
    `- Basis transaksi: ${basisStartLabel} s.d. ${basisEndLabel}`,
    `- Income berjalan: ${formatMoney(currentIncomeEstimate)} (${currentIncomeSource})`,
    `- Expense berjalan: ${formatMoney(cycleExpense)}`,
    cycleSaving > 0 ? `- Saving/goal berjalan: ${formatMoney(cycleSaving)}` : null,
    liquidAssetValue > 0 ? `- Aset likuid tercatat: ${formatMoney(liquidAssetValue)}` : null,
    scheduledIncomeBeforeTarget > 0
      ? `- Income aktif yang diperkirakan masih masuk sebelum target: ${formatMoney(scheduledIncomeBeforeTarget)}`
      : null,
    passiveIncomeProjected > 0
      ? `- Estimasi passive income sampai target: ${formatMoney(passiveIncomeProjected)}`
      : null,
    `- Buffer saat ini: ${formatMoney(bufferNow)}`,
    `- Rata-rata expense harian: ${formatMoney(Math.round(expenseRunRate.value))} (${expenseRunRate.source})`,
    scenarioExpenseAmount > 0
      ? `- Skenario tambahan: ${formatMoney(scenarioExpenseAmount)} untuk ${
          params.query.scenarioExpenseLabel ?? "pengeluaran tambahan"
        }`
      : null,
    `- Perkiraan kebutuhan sampai target: ${formatMoney(projectedExpenseUntilTarget)}`,
    `- Estimasi posisi di ${DATE_LABEL_FORMATTER.format(targetDate)}: ${formatMoney(projectedEndingBalance)}`,
    "Catatan: ini estimasi dari transaksi dan profil yang tercatat, bukan saldo rekening real."
  ]
    .filter(Boolean)
    .join("\n");
};
