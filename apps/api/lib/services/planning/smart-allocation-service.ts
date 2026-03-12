import { prisma } from "@/lib/prisma";
import { FinancialGoalStatus, FinancialGoalType } from "@prisma/client";
import { getSavingsGoalStatus } from "@/lib/services/planning/goal-service";
import { formatMoney, formatPercent } from "@/lib/services/shared/money-format";
import { getUserPortfolioValuation } from "@/lib/services/market/portfolio-valuation-service";

const ALLOCATION_TRIGGER =
  /(sisa uang.*kemana|alokasi.*(nabung|invest)|nabung berapa|invest berapa|alokasi tabungan|smart allocation)/i;

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const getMonthRange = (baseDate: Date) => ({
  start: new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1, 0, 0, 0, 0)),
  end: baseDate
});

const getFinancialProfileModel = () =>
  (prisma as unknown as {
    financialProfile?: {
      findUnique: (args: {
        where: { userId: string };
        select: {
          monthlyIncomeTotal: true;
          monthlyExpenseTotal: true;
          potentialMonthlySaving: true;
          emergencyFundTarget: true;
        };
      }) => Promise<{
        monthlyIncomeTotal: bigint | null;
        monthlyExpenseTotal: bigint | null;
        potentialMonthlySaving: bigint | null;
        emergencyFundTarget: bigint | null;
      } | null>;
    };
  }).financialProfile;

const getUserModel = () =>
  (prisma as unknown as {
    user?: {
      findUnique: (args: {
        where: { id: string };
        select: {
          employmentType: true;
          incomeStability: true;
          hasAssets: true;
        };
      }) => Promise<{
        employmentType: string | null;
        incomeStability: string | null;
        hasAssets: boolean | null;
      } | null>;
    };
  }).user;

const getFinancialGoalModel = () =>
  (prisma as unknown as {
    financialGoal?: {
      findMany: (args: {
        where: {
          userId: string;
          status: { in: FinancialGoalStatus[] };
          targetAmount?: { not: null };
        };
        orderBy: { createdAt: "asc" };
        take?: number;
      }) => Promise<
        Array<{
          goalType: FinancialGoalType;
          goalName: string;
          targetAmount: bigint | null;
        }>
      >;
    };
  }).financialGoal;

const PRIORITY_GOAL_ORDER: FinancialGoalType[] = [
  FinancialGoalType.EMERGENCY_FUND,
  FinancialGoalType.HOUSE,
  FinancialGoalType.VEHICLE,
  FinancialGoalType.VACATION,
  FinancialGoalType.CUSTOM,
  FinancialGoalType.FINANCIAL_FREEDOM
];

const clampPercentage = (value: number) => Math.max(0, Math.min(100, value));

const pickPriorityGoal = (
  goals: Array<{ goalType: FinancialGoalType; goalName: string; targetAmount: bigint | null }>
) => {
  for (const goalType of PRIORITY_GOAL_ORDER) {
    const match = goals.find((goal) => goal.goalType === goalType);
    if (match) return match;
  }

  return goals[0] ?? null;
};

export const tryHandleSmartAllocation = async (params: {
  userId: string;
  text: string;
}): Promise<{ handled: boolean; replyText?: string }> => {
  if (!ALLOCATION_TRIGGER.test(params.text)) return { handled: false };

  const range = getMonthRange(new Date());
  const financialProfileModel = getFinancialProfileModel();
  const financialGoalModel = getFinancialGoalModel();
  const userModel = getUserModel();

  const [profile, incomeAgg, expenseAgg, goalStatus, goals, portfolioSnapshot, userProfile] = await Promise.all([
    financialProfileModel?.findUnique({
      where: { userId: params.userId },
      select: {
        monthlyIncomeTotal: true,
        monthlyExpenseTotal: true,
        potentialMonthlySaving: true,
        emergencyFundTarget: true
      }
    }) ?? Promise.resolve(null),
    prisma.transaction.aggregate({
      where: {
        userId: params.userId,
        type: "INCOME",
        occurredAt: { gte: range.start, lte: range.end }
      },
      _sum: { amount: true }
    }),
    prisma.transaction.aggregate({
      where: {
        userId: params.userId,
        type: "EXPENSE",
        occurredAt: { gte: range.start, lte: range.end }
      },
      _sum: { amount: true }
    }),
    getSavingsGoalStatus(params.userId)
      .then((value) => value)
      .catch(() => null),
    financialGoalModel?.findMany({
      where: {
        userId: params.userId,
        status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] },
        targetAmount: { not: null }
      },
      orderBy: { createdAt: "asc" },
      take: 10
    }) ?? Promise.resolve([]),
    getUserPortfolioValuation(params.userId),
    userModel?.findUnique({
      where: { id: params.userId },
      select: {
        employmentType: true,
        incomeStability: true,
        hasAssets: true
      }
    }) ?? Promise.resolve(null)
  ]);

  const income = toNumber(profile?.monthlyIncomeTotal ?? incomeAgg._sum.amount ?? 0);
  const expense = toNumber(profile?.monthlyExpenseTotal ?? expenseAgg._sum.amount ?? 0);
  const balance = income - expense;
  const savingRate = income > 0 ? clampPercentage((balance / income) * 100) : 0;
  const concentrationRisk = portfolioSnapshot.concentrationRisk ?? "LOW";
  const topHoldingName = portfolioSnapshot.topHoldingName ?? null;
  const liquidSharePercent = portfolioSnapshot.liquidSharePercent ?? 0;
  const priorityGoal = pickPriorityGoal(goals);
  const goalCandidates = goalStatus?.goals
    ?.filter((goal) => goal.remainingAmount > 0)
    .sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
      if ((left.estimatedMonthsToGoal ?? Number.MAX_SAFE_INTEGER) !== (right.estimatedMonthsToGoal ?? Number.MAX_SAFE_INTEGER)) {
        return (left.estimatedMonthsToGoal ?? Number.MAX_SAFE_INTEGER) - (right.estimatedMonthsToGoal ?? Number.MAX_SAFE_INTEGER);
      }
      return left.remainingAmount - right.remainingAmount;
    }) ?? [];
  const emergencyTarget = toNumber(profile?.emergencyFundTarget ?? 0);
  const emergencyGap =
    emergencyTarget > 0 ? Math.max(0, emergencyTarget - portfolioSnapshot.totalLiquidValue) : 0;
  const incomeStability = userProfile?.incomeStability ?? null;
  const hasAssets = userProfile?.hasAssets ?? portfolioSnapshot.totalCurrentValue > 0;
  const allocationProfile =
    incomeStability !== "STABLE" || emergencyGap > 0 || savingRate < 20 || !hasAssets
      ? "DEFENSIVE"
      : savingRate >= 30 &&
          concentrationRisk === "LOW" &&
          portfolioSnapshot.rebalanceStatus === "HEALTHY" &&
          liquidSharePercent >= 10 &&
          liquidSharePercent <= 40
        ? "GROWTH"
        : "BALANCED";

  if (income <= 0 || expense <= 0) {
    return {
      handled: true,
      replyText:
        "Data cashflow bulanan kamu belum cukup lengkap. Isi dulu pemasukan dan pengeluaran bulanan, atau pakai bot transaksi beberapa waktu, baru saya bisa kasih alokasi yang lebih akurat."
    };
  }

  if (balance <= 0) {
    return {
      handled: true,
      replyText:
        [
          "Arus kas bulanan kamu belum positif, jadi prioritasnya belum ke investasi agresif dulu.",
          `- Income bulanan: ${formatMoney(income)}`,
          `- Expense bulanan: ${formatMoney(expense)}`,
          "- Fokus utama: turunkan 10-15% kategori pengeluaran terbesar dulu",
          "- Setelah surplus stabil, baru bagi ulang ke dana aman, goal, dan investasi"
        ].join("\n")
    };
  }

  let reserveRatio = 0.2;
  let goalRatio = 0.45;
  let investRatio = 0.35;
  let reason =
    "Arus kas kamu sudah positif, jadi sisa dana bisa dibagi ke dana aman, target, dan pertumbuhan aset.";

  if (emergencyGap > 0) {
    reserveRatio = emergencyGap > balance * 6 ? 0.5 : 0.35;
    goalRatio = 0.4;
    investRatio = 1 - reserveRatio - goalRatio;
    reason =
      "Dana aman kamu masih di bawah target, jadi porsinya saya naikkan dulu supaya cash buffer lebih sehat.";
  } else if (savingRate < 20) {
    reserveRatio = 0.25;
    goalRatio = 0.5;
    investRatio = 0.25;
    reason =
      "Saving rate kamu masih tipis, jadi alokasi saya buat lebih disiplin ke dana aman dan goal sebelum agresif ke investasi.";
  } else if (!priorityGoal) {
    reserveRatio = 0.2;
    goalRatio = 0.2;
    investRatio = 0.6;
    reason =
      "Karena belum ada goal nominal yang aktif, porsi pertumbuhan aset bisa dibuat lebih besar.";
  }

  if (allocationProfile === "DEFENSIVE") {
    reserveRatio = Math.max(reserveRatio, 0.3);
    goalRatio = Math.max(goalRatio, 0.4);
    investRatio = Math.max(0, 1 - reserveRatio - goalRatio);
    reason =
      incomeStability !== "STABLE"
        ? "Income kamu belum stabil, jadi porsi buffer dan goal saya jaga lebih besar dulu."
        : !hasAssets
          ? "Karena aset investasi belum terbentuk, prioritasnya bangun buffer dan aset dasar dulu."
          : reason;
  } else if (allocationProfile === "GROWTH") {
    reserveRatio = Math.min(reserveRatio, 0.2);
    goalRatio = priorityGoal ? Math.min(goalRatio, 0.35) : 0.2;
    investRatio = Math.max(0, 1 - reserveRatio - goalRatio);
    reason =
      "Cashflow kamu cukup sehat, buffer sudah lumayan, dan portfolio belum terlalu berat di satu sisi. Porsi pertumbuhan aset bisa dibuat lebih agresif.";
  }

  if (concentrationRisk === "HIGH" && emergencyGap <= 0) {
    reserveRatio = Math.max(reserveRatio, 0.2);
    goalRatio = Math.max(goalRatio - 0.05, 0.25);
    investRatio = Math.max(0, 1 - reserveRatio - goalRatio);
    reason =
      `Portfolio kamu masih sangat terkonsentrasi di ${topHoldingName ?? "satu aset"}, jadi porsi investasi saya arahkan lebih hati-hati dan fokus ke diversifikasi.`;
  }

  const reserveFund = Math.round(balance * reserveRatio);
  const goalFund = Math.round(balance * goalRatio);
  const investmentFund = Math.max(0, balance - reserveFund - goalFund);
  const investmentFocus =
    !hasAssets
      ? "bangun aset pertama yang sederhana dan likuid dulu"
      : portfolioSnapshot.rebalanceStatus === "ACTION"
        ? `arah investasi baru sebaiknya ke tipe aset selain ${topHoldingName ?? "holding dominan"}`
        : allocationProfile === "GROWTH"
          ? "porsi investasi bisa lebih fokus ke pertumbuhan jangka panjang"
          : "tetap fokus ke diversifikasi dan keseimbangan cashflow";
  const primaryGoalLabel = priorityGoal?.goalName ?? "Goal fleksibel";
  const goalRemaining =
    priorityGoal?.goalType === FinancialGoalType.EMERGENCY_FUND
      ? emergencyGap
      : goalStatus && goalStatus.remainingAmount > 0
        ? goalStatus.remainingAmount
        : toNumber(priorityGoal?.targetAmount ?? 0);
  const goalSplitLines =
    goalCandidates.length > 1 && goalFund > 0
      ? (() => {
          const first = goalCandidates[0];
          const second = goalCandidates[1];
          const firstShare = Math.round(goalFund * 0.65);
          const secondShare = Math.max(0, goalFund - firstShare);
          return [
            `- Split goal disarankan: ${first.goalName} ${formatMoney(firstShare)}`,
            `- Split goal kedua: ${second.goalName} ${formatMoney(secondShare)}`
        ];
      })()
      : [];
  const recommendedPlanLines =
    goalStatus?.recommendedPlan?.length
      ? goalStatus.recommendedPlan.slice(0, 3).map(
          (goal) =>
            `- Referensi setoran goal: ${goal.goalName} ${formatMoney(goal.recommendedMonthlyContribution)}/bulan (${formatPercent(goal.sharePercent)})`
        )
      : [];

  return {
    handled: true,
    replyText: [
      "Saran alokasi sisa uang bulan ini:",
      `- Income bulanan: ${formatMoney(income)}`,
      `- Expense bulanan: ${formatMoney(expense)}`,
      `- Potensi tabungan: ${formatMoney(balance)} (${formatPercent(savingRate)})`,
      `- Profil alokasi: ${allocationProfile}`,
      `- Dana aman / buffer: ${formatMoney(reserveFund)}`,
      `- Goal prioritas (${primaryGoalLabel}): ${formatMoney(goalFund)}`,
      `- Investasi / pertumbuhan aset: ${formatMoney(investmentFund)}`,
      `- Kondisi portfolio: top holding ${topHoldingName ?? "-"} | konsentrasi ${concentrationRisk} | likuid ${formatPercent(
        liquidSharePercent
      )}`,
      `- Fokus investasi: ${investmentFocus}`,
      ...goalSplitLines,
      ...recommendedPlanLines,
      goalRemaining > 0 ? `Sisa target yang masih relevan: ${formatMoney(goalRemaining)}` : null,
      emergencyGap > 0 ? `Gap dana darurat saat ini: ${formatMoney(emergencyGap)}` : null,
      reason
    ].join("\n")
  };
};
