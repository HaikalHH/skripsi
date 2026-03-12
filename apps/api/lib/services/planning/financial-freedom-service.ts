import { parsePositiveAmount } from "@/lib/services/transactions/amount-parser";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatPercent } from "@/lib/services/shared/money-format";
import { getUserPortfolioValuation } from "@/lib/services/market/portfolio-valuation-service";
import {
  estimateMonthsToReachTarget,
  formatDurationFromMonths,
  futureValueWithContribution,
  requiredMonthlyContributionForTarget
} from "@/lib/services/shared/projection-math-service";

const ACTIVATION_PATTERN = /aktifkan financial freedom|aktifin financial freedom|mulai financial freedom/i;
const STATUS_PATTERN = /status financial freedom|financial freedom status|status ff|progress financial freedom/i;
const EXPENSE_PATTERN =
  /pengeluaran(?:\s+aku|\s+saya)?\s+(?:sekitar\s+)?([\d.,]+(?:\s*(?:jt|juta|rb|ribu|k))?)(?:\s*(?:\/\s*bulan|per\s*bulan|bulan|bln))/i;
const YEARS_PATTERN = /(?:bebas finansial|financial freedom).+?(\d+)\s*(tahun|thn)/i;
const AGE_PATTERN = /(?:target\s+)?(?:usia|umur)\s+(\d{2})\b/i;

const DEFAULT_SWR = 0.04;
const EXPECTED_RETURN = 0.08;

const getFreedomModel = () => (prisma as { financialFreedomProfile?: any }).financialFreedomProfile;
const getFinancialProfileModel = () =>
  (prisma as unknown as {
    financialProfile?: {
      findUnique: (args: {
        where: { userId: string };
        select: {
          monthlyExpenseTotal: true;
          potentialMonthlySaving: true;
          financialFreedomTarget: true;
        };
      }) => Promise<{
        monthlyExpenseTotal: bigint | null;
        potentialMonthlySaving: bigint | null;
        financialFreedomTarget: bigint | null;
      } | null>;
    };
  }).financialProfile;

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const getNetSavings = async (userId: string) => {
  const [incomeAgg, expenseAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { userId, type: "INCOME" },
      _sum: { amount: true }
    }),
    prisma.transaction.aggregate({
      where: { userId, type: "EXPENSE" },
      _sum: { amount: true }
    })
  ]);

  return Math.max(0, toNumber(incomeAgg._sum.amount ?? 0) - toNumber(expenseAgg._sum.amount ?? 0));
};

const getRecentMonthlyInvestCapacity = async (userId: string) => {
  const windowStart = new Date();
  windowStart.setUTCDate(windowStart.getUTCDate() - 90);

  const [incomeAgg, expenseAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { userId, type: "INCOME", occurredAt: { gte: windowStart } },
      _sum: { amount: true }
    }),
    prisma.transaction.aggregate({
      where: { userId, type: "EXPENSE", occurredAt: { gte: windowStart } },
      _sum: { amount: true }
    })
  ]);

  const net = toNumber(incomeAgg._sum.amount ?? 0) - toNumber(expenseAgg._sum.amount ?? 0);
  return Math.max(0, (net / 90) * 30);
};

const buildFreedomStatusText = (params: {
  monthlyExpense: number;
  targetYears: number;
  safeWithdrawalRate: number;
  currentNetWorth: number;
  monthlyCapacity: number;
  recordedTargetAge: number | null;
  usingNetSavingsProxy: boolean;
  targetFundOverride?: number | null;
}) => {
  if (params.monthlyExpense <= 0) {
    return "Isi dulu pengeluaran bulanan Anda. Contoh: `pengeluaran aku 8 juta/bulan`.";
  }

  const targetFund =
    params.targetFundOverride && params.targetFundOverride > 0
      ? params.targetFundOverride
      : (params.monthlyExpense * 12) / params.safeWithdrawalRate;
  const leanTargetFund = (params.monthlyExpense * 12) / 0.045;
  const conservativeTargetFund = (params.monthlyExpense * 12) / 0.035;
  const stressTargetFund = targetFund * 1.15;
  const remaining = Math.max(0, targetFund - params.currentNetWorth);
  const months = params.targetYears * 12;
  const projectedTotal = futureValueWithContribution({
    startingAmount: params.currentNetWorth,
    monthlyContribution: params.monthlyCapacity,
    totalMonths: months,
    annualRate: EXPECTED_RETURN
  });
  const neededMonthly =
    requiredMonthlyContributionForTarget({
      startingAmount: params.currentNetWorth,
      targetAmount: targetFund,
      totalMonths: months,
      annualRate: EXPECTED_RETURN
    }) ?? 0;
  const etaMonths = estimateMonthsToReachTarget({
    startingAmount: params.currentNetWorth,
    monthlyContribution: params.monthlyCapacity,
    targetAmount: targetFund,
    annualRate: EXPECTED_RETURN
  });
  const stressEtaMonths = estimateMonthsToReachTarget({
    startingAmount: params.currentNetWorth,
    monthlyContribution: params.monthlyCapacity,
    targetAmount: stressTargetFund,
    annualRate: EXPECTED_RETURN
  });
  const progress = targetFund > 0 ? (params.currentNetWorth / targetFund) * 100 : 0;
  const onTrack = params.monthlyCapacity >= neededMonthly;
  const monthlyContributionGap = Math.max(0, neededMonthly - params.monthlyCapacity);
  const currentRunwayMonths =
    params.monthlyExpense > 0 ? params.currentNetWorth / params.monthlyExpense : 0;
  const safeMonthlyPassiveTarget = (targetFund * params.safeWithdrawalRate) / 12;
  const currentSafeMonthlyPassive = (params.currentNetWorth * params.safeWithdrawalRate) / 12;
  const currentExpenseCoverage =
    params.monthlyExpense > 0 ? (currentSafeMonthlyPassive / params.monthlyExpense) * 100 : 0;
  const passiveIncomeGap = Math.max(0, safeMonthlyPassiveTarget - currentSafeMonthlyPassive);

  const lines = [
    "Financial Freedom Tracker:",
    `- Target lean (SWR 4.5%): ${formatMoney(leanTargetFund)}`,
    `- Target dana bebas finansial: ${formatMoney(targetFund)}`,
    `- Target konservatif (SWR 3.5%): ${formatMoney(conservativeTargetFund)}`,
    `- Target stress test (+15% buffer): ${formatMoney(stressTargetFund)}`,
    `- Progress saat ini: ${formatMoney(params.currentNetWorth)} (${formatPercent(progress)})`,
    `- Sisa target: ${formatMoney(remaining)}`,
    `- Passive income aman yang dibutuhkan: ${formatMoney(safeMonthlyPassiveTarget)}/bulan`,
    `- Estimasi passive income aman dari aset saat ini: ${formatMoney(currentSafeMonthlyPassive)}/bulan`,
    `- Coverage expense dari aset saat ini: ${formatPercent(currentExpenseCoverage)}`,
    `- Gap passive income bulanan: ${formatMoney(passiveIncomeGap)}/bulan`,
    `- Target waktu: ${params.targetYears} tahun`,
    `- Ritme nabung/invest saat ini: ${formatMoney(params.monthlyCapacity)}/bulan`,
    `- Estimasi nilai di akhir target: ${formatMoney(projectedTotal)}`,
    `- Estimasi waktu di ritme sekarang: ${formatDurationFromMonths(etaMonths)}`,
    `- Estimasi waktu versi stress test: ${formatDurationFromMonths(stressEtaMonths)}`,
    `- Kebutuhan minimal agar on-track: ${formatMoney(neededMonthly)}/bulan`,
    `- Gap setoran bulanan ke jalur target: ${formatMoney(monthlyContributionGap)}/bulan`,
    `- Runway aset saat ini: ${currentRunwayMonths.toFixed(1)} bulan expense`,
    `- Status: ${onTrack ? "on track" : "belum on track"}`
  ];

  if (params.recordedTargetAge) {
    lines.push(`- Target usia tercatat: ${params.recordedTargetAge} tahun`);
  }

  if (params.usingNetSavingsProxy) {
    lines.push("Catatan: progress saat ini masih memakai proxy tabungan bersih karena portfolio aset belum lengkap.");
  }

  return lines.join("\n");
};

const ensureProfile = async (userId: string) =>
  getFreedomModel()?.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      enabled: false,
      monthlyExpense: 0,
      targetYears: 15,
      safeWithdrawalRate: DEFAULT_SWR
    }
  });

export const tryHandleFinancialFreedomCommand = async (params: { userId: string; text: string }) => {
  const text = params.text.trim();
  const shouldHandle =
    ACTIVATION_PATTERN.test(text) ||
    STATUS_PATTERN.test(text) ||
    EXPENSE_PATTERN.test(text) ||
    YEARS_PATTERN.test(text) ||
    AGE_PATTERN.test(text);
  if (!shouldHandle) return { handled: false as const };

  const freedomModel = getFreedomModel();
  if (!freedomModel) {
    return {
      handled: true as const,
      replyText: "Fitur financial freedom butuh migrasi DB + `prisma generate` sebelum dipakai."
    };
  }

  const profile = await ensureProfile(params.userId);
  if (!profile) {
    return {
      handled: true as const,
      replyText: "Fitur financial freedom belum siap karena model DB tidak tersedia."
    };
  }
  const updates: Record<string, unknown> = {};

  if (ACTIVATION_PATTERN.test(text)) {
    updates.enabled = true;
  }

  const expenseMatch = text.match(EXPENSE_PATTERN);
  if (expenseMatch) {
    const monthlyExpense = parsePositiveAmount(expenseMatch[1]);
    if (monthlyExpense) {
      updates.monthlyExpense = monthlyExpense;
    }
  }

  const yearsMatch = text.match(YEARS_PATTERN);
  if (yearsMatch) {
    const years = Number(yearsMatch[1]);
    if (Number.isFinite(years) && years > 0 && years <= 70) {
      updates.targetYears = years;
    }
  }
  const ageMatch = text.match(AGE_PATTERN);
  if (ageMatch) {
    const targetAge = Number(ageMatch[1]);
    if (Number.isFinite(targetAge) && targetAge >= 25 && targetAge <= 100) {
      await prisma.user.update({
        where: { id: params.userId },
        data: { targetFinancialFreedomAge: targetAge }
      });
    }
  }

  const updatedProfile =
    Object.keys(updates).length > 0
      ? await freedomModel.update({
          where: { userId: params.userId },
          data: updates
        })
      : profile;

  const financialProfileModel = getFinancialProfileModel();
  const [financialProfile, user, portfolioSnapshot, netSavings, recentMonthlyCapacity] =
    await Promise.all([
      financialProfileModel?.findUnique({
        where: { userId: params.userId },
        select: {
          monthlyExpenseTotal: true,
          potentialMonthlySaving: true,
          financialFreedomTarget: true
        }
      }) ?? Promise.resolve(null),
      prisma.user.findUnique({
        where: { id: params.userId },
        select: { targetFinancialFreedomAge: true }
      }),
      getUserPortfolioValuation(params.userId),
      getNetSavings(params.userId),
      getRecentMonthlyInvestCapacity(params.userId)
    ]);

  const profileMonthlyExpense = toNumber(financialProfile?.monthlyExpenseTotal ?? 0);
  const profileMonthlySaving = toNumber(financialProfile?.potentialMonthlySaving ?? 0);
  const portfolioCurrentValue = portfolioSnapshot.totalCurrentValue;
  const currentNetWorth =
    portfolioCurrentValue > 0 ? portfolioCurrentValue : netSavings;
  const usingNetSavingsProxy = portfolioCurrentValue <= 0 && netSavings > 0;
  const monthlyCapacity =
    Math.max(profileMonthlySaving, recentMonthlyCapacity, 0);

  if (toNumber(updatedProfile.monthlyExpense) <= 0 && profileMonthlyExpense > 0) {
    await freedomModel.update({
      where: { userId: params.userId },
      data: { monthlyExpense: profileMonthlyExpense }
    });
    updatedProfile.monthlyExpense = profileMonthlyExpense;
  }

  if (!updatedProfile.enabled) {
    return {
      handled: true as const,
      replyText: "Mode financial freedom belum aktif. Ketik `Aktifkan financial freedom` dulu."
    };
  }

  return {
    handled: true as const,
    replyText: buildFreedomStatusText({
      monthlyExpense: toNumber(updatedProfile.monthlyExpense) || profileMonthlyExpense,
      targetYears: updatedProfile.targetYears,
      safeWithdrawalRate: toNumber(updatedProfile.safeWithdrawalRate) || DEFAULT_SWR,
      currentNetWorth,
      monthlyCapacity,
      recordedTargetAge: user?.targetFinancialFreedomAge ?? null,
      usingNetSavingsProxy,
      targetFundOverride: toNumber(financialProfile?.financialFreedomTarget ?? 0) || null
    })
  };
};
