import {
  AssetType,
  BudgetMode,
  EmploymentType,
  ExpensePlanSource,
  FinancialGoalStatus,
  FinancialGoalType,
  GoalCalculationType,
  IncomeStability,
  PortfolioAssetType,
  Prisma
} from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatPercent } from "@/lib/services/shared/money-format";
import { getMarketQuoteBySymbol } from "@/lib/services/market/market-price-service";

export type ExpenseBreakdown = {
  food: number;
  transport: number;
  bills: number;
  entertainment: number;
  others: number;
};

const EMPTY_EXPENSE_BREAKDOWN: ExpenseBreakdown = {
  food: 0,
  transport: 0,
  bills: 0,
  entertainment: 0,
  others: 0
};

const EXPENSE_CATEGORY_TO_BUDGET: Record<keyof ExpenseBreakdown, string> = {
  food: "Food & Drink",
  transport: "Transport",
  bills: "Bills",
  entertainment: "Entertainment",
  others: "Others"
};

const ONBOARDING_EXPENSE_BUCKET_LABELS: Record<keyof ExpenseBreakdown, string> = {
  food: "Makan & kebutuhan harian",
  transport: "Transport",
  bills: "Tagihan & kewajiban rutin",
  entertainment: "Hiburan & lifestyle",
  others: "Lainnya"
};

const ONBOARDING_EXPENSE_BUCKET_EXPLANATIONS: Record<keyof ExpenseBreakdown, string> = {
  food: "makan/minum, kopi, restoran, sembako, belanja dapur, dan konsumsi harian",
  transport: "bensin, parkir, tol, ojol, taksi, kereta, bus, dan perjalanan rutin",
  bills: "listrik, air, internet, pulsa, cicilan, asuransi, BPJS, sekolah/kuliah/les, dan kewajiban rutin lain",
  entertainment: "nongkrong, streaming, game, bioskop, konser, hobi, dan pengeluaran lifestyle serupa",
  others: "kebutuhan keluarga, rumah tangga, donasi, pet, hadiah, dan item lain yang tidak masuk kategori utama"
};

const toBigIntAmount = (value: number | bigint | null | undefined) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value;
  if (!Number.isFinite(value)) return null;
  return BigInt(Math.max(0, Math.round(value)));
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

const toDecimal = (value: number | null) =>
  value === null || !Number.isFinite(value) ? null : new Prisma.Decimal(value.toFixed(2));

const hasKnownExpenseBreakdown = (breakdown: ExpenseBreakdown) =>
  Object.values(breakdown).some((value) => value > 0);

const sumBreakdown = (breakdown: ExpenseBreakdown) =>
  breakdown.food + breakdown.transport + breakdown.bills + breakdown.entertainment + breakdown.others;

const toExpenseBreakdownFromPlanItems = (
  items: Array<{ categoryKey: string; amount: bigint | number | string | null }> | null | undefined
): ExpenseBreakdown | null => {
  if (!items?.length) return null;

  const breakdown = { ...EMPTY_EXPENSE_BREAKDOWN };
  for (const item of items) {
    const key = item.categoryKey as keyof ExpenseBreakdown;
    if (!(key in breakdown)) continue;
    breakdown[key] += toNumber(item.amount ?? 0);
  }

  return hasKnownExpenseBreakdown(breakdown) ? breakdown : null;
};

export const buildExpenseBreakdownSummaryLines = (breakdown: ExpenseBreakdown | null) => {
  if (!breakdown || !hasKnownExpenseBreakdown(breakdown)) return [];

  const lines = ["", "Rincian pengeluaran bulanan yang saya catat:"];
  for (const key of Object.keys(ONBOARDING_EXPENSE_BUCKET_LABELS) as Array<keyof ExpenseBreakdown>) {
    const amount = breakdown[key];
    if (amount <= 0) continue;
    lines.push(`- ${ONBOARDING_EXPENSE_BUCKET_LABELS[key]}: ${formatMoney(amount)}`);
  }

  lines.push("");
  lines.push("Pengelompokan kategori yang saya pakai:");
  for (const key of Object.keys(ONBOARDING_EXPENSE_BUCKET_EXPLANATIONS) as Array<
    keyof ExpenseBreakdown
  >) {
    lines.push(`- ${ONBOARDING_EXPENSE_BUCKET_LABELS[key]}: ${ONBOARDING_EXPENSE_BUCKET_EXPLANATIONS[key]}.`);
  }

  return lines;
};

const getEmergencyFundMultiplier = (incomeStability: IncomeStability | null | undefined) => {
  if (incomeStability === IncomeStability.STABLE) {
    return env.EMERGENCY_FUND_STABLE_MULTIPLIER;
  }
  return env.EMERGENCY_FUND_UNSTABLE_MULTIPLIER;
};

const normalizeSymbol = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 20) || "ASSET";

const getAssetMarketValue = async (params: {
  assetType: AssetType;
  assetName: string;
  quantity: number | null;
  estimatedValue: number | null;
}) => {
  if (params.assetType !== AssetType.GOLD || !params.quantity || params.quantity <= 0) {
    return params.estimatedValue;
  }

  try {
    const quote = await getMarketQuoteBySymbol("XAU");
    return Math.round(quote.price * params.quantity);
  } catch {
    return params.estimatedValue;
  }
};

export const upsertIncomeProfile = async (params: {
  userId: string;
  activeIncomeMonthly?: number | null;
  passiveIncomeMonthly?: number | null;
  estimatedMonthlyIncome?: number | null;
}) =>
  prisma.financialProfile.upsert({
    where: { userId: params.userId },
    update: {
      ...(params.activeIncomeMonthly !== undefined
        ? { activeIncomeMonthly: toBigIntAmount(params.activeIncomeMonthly) }
        : {}),
      ...(params.passiveIncomeMonthly !== undefined
        ? { passiveIncomeMonthly: toBigIntAmount(params.passiveIncomeMonthly) }
        : {}),
      ...(params.estimatedMonthlyIncome !== undefined
        ? { estimatedMonthlyIncome: toBigIntAmount(params.estimatedMonthlyIncome) }
        : {})
    },
    create: {
      userId: params.userId,
      activeIncomeMonthly: toBigIntAmount(params.activeIncomeMonthly ?? null),
      passiveIncomeMonthly: toBigIntAmount(params.passiveIncomeMonthly ?? null),
      estimatedMonthlyIncome: toBigIntAmount(params.estimatedMonthlyIncome ?? null)
    }
  });

export const replaceExpensePlan = async (params: {
  userId: string;
  source: ExpensePlanSource;
  breakdown: ExpenseBreakdown;
}) => {
  const total = sumBreakdown(params.breakdown);

  return prisma.$transaction(async (tx) => {
    await tx.expensePlan.updateMany({
      where: { userId: params.userId, isActive: true },
      data: { isActive: false }
    });

    const plan = await tx.expensePlan.create({
      data: {
        userId: params.userId,
        source: params.source,
        totalMonthlyExpense: BigInt(total),
        isActive: true,
        items: {
          create: [
            { categoryKey: "food", amount: BigInt(params.breakdown.food) },
            { categoryKey: "transport", amount: BigInt(params.breakdown.transport) },
            { categoryKey: "bills", amount: BigInt(params.breakdown.bills) },
            { categoryKey: "entertainment", amount: BigInt(params.breakdown.entertainment) },
            { categoryKey: "others", amount: BigInt(params.breakdown.others) }
          ]
        }
      },
      include: { items: true }
    });

    await tx.user.update({
      where: { id: params.userId },
      data: { monthlyBudget: total }
    });

    for (const [categoryKey, amount] of Object.entries(params.breakdown) as Array<
      [keyof ExpenseBreakdown, number]
    >) {
      await tx.budget.upsert({
        where: {
          userId_category: {
            userId: params.userId,
            category: EXPENSE_CATEGORY_TO_BUDGET[categoryKey]
          }
        },
        update: { monthlyLimit: amount },
        create: {
          userId: params.userId,
          category: EXPENSE_CATEGORY_TO_BUDGET[categoryKey],
          monthlyLimit: amount
        }
      });
    }

    await tx.financialProfile.upsert({
      where: { userId: params.userId },
      update: { monthlyExpenseTotal: BigInt(total) },
      create: { userId: params.userId, monthlyExpenseTotal: BigInt(total) }
    });

    return plan;
  });
};

export const setMonthlyExpenseTotal = async (userId: string, amount: number) =>
  prisma.financialProfile.upsert({
    where: { userId },
    update: { monthlyExpenseTotal: BigInt(Math.max(0, Math.round(amount))) },
    create: { userId, monthlyExpenseTotal: BigInt(Math.max(0, Math.round(amount))) }
  });

export const createOrUpdateFinancialGoal = async (params: {
  userId: string;
  goalType: FinancialGoalType;
  goalName: string;
  targetAmount: number | null;
  calculationType: GoalCalculationType;
  status: FinancialGoalStatus;
  targetAge?: number | null;
}) => {
  const existing =
    params.goalType === FinancialGoalType.CUSTOM
      ? null
      : await prisma.financialGoal.findFirst({
          where: {
            userId: params.userId,
            goalType: params.goalType,
            status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] }
          },
          orderBy: { createdAt: "desc" }
        });

  if (!existing) {
    return prisma.financialGoal.create({
      data: {
        userId: params.userId,
        goalType: params.goalType,
        goalName: params.goalName,
        targetAmount: toBigIntAmount(params.targetAmount),
        targetAge: params.targetAge ?? null,
        calculationType: params.calculationType,
        status: params.status
      }
    });
  }

  return prisma.financialGoal.update({
    where: { id: existing.id },
    data: {
      goalName: params.goalName,
      targetAmount: toBigIntAmount(params.targetAmount),
      targetAge: params.targetAge ?? existing.targetAge,
      calculationType: params.calculationType,
      status: params.status
    }
  });
};

export const createOnboardingAsset = async (params: {
  userId: string;
  assetType: AssetType;
  assetName: string;
  quantity?: number | null;
  unit?: string | null;
  estimatedValue?: number | null;
  notes?: string | null;
}) => {
  const marketValue = await getAssetMarketValue({
    assetType: params.assetType,
    assetName: params.assetName,
    quantity: params.quantity ?? null,
    estimatedValue: params.estimatedValue ?? null
  });

  const asset = await prisma.asset.create({
    data: {
      userId: params.userId,
      assetType: params.assetType,
      assetName: params.assetName,
      quantity: params.quantity ?? null,
      unit: params.unit ?? null,
      estimatedValue: toBigIntAmount(marketValue),
      notes: params.notes ?? null
    }
  });

  const portfolioTypeMap: Record<AssetType, PortfolioAssetType> = {
    CASH: PortfolioAssetType.OTHER,
    SAVINGS: PortfolioAssetType.OTHER,
    GOLD: PortfolioAssetType.GOLD,
    STOCK: PortfolioAssetType.STOCK,
    CRYPTO: PortfolioAssetType.CRYPTO,
    MUTUAL_FUND: PortfolioAssetType.MUTUAL_FUND,
    PROPERTY: PortfolioAssetType.PROPERTY,
    OTHER: PortfolioAssetType.OTHER
  };

  const quantity = params.quantity && params.quantity > 0 ? params.quantity : 1;
  const averageBuyPrice = marketValue && quantity > 0 ? marketValue / quantity : marketValue ?? 0;
  const symbol = params.assetType === AssetType.GOLD ? "XAU" : normalizeSymbol(params.assetName);

  await prisma.portfolioAsset.upsert({
    where: {
      userId_assetType_symbol: {
        userId: params.userId,
        assetType: portfolioTypeMap[params.assetType],
        symbol
      }
    },
    update: {
      displayName: params.assetName,
      quantity,
      unit: params.unit ?? "unit",
      averageBuyPrice
    },
    create: {
      userId: params.userId,
      assetType: portfolioTypeMap[params.assetType],
      symbol,
      displayName: params.assetName,
      quantity,
      unit: params.unit ?? "unit",
      averageBuyPrice,
      currency: "IDR"
    }
  });

  await prisma.user.update({
    where: { id: params.userId },
    data: { hasAssets: true }
  });

  return asset;
};

const selectPrimaryGoalForLegacySavings = async (userId: string) => {
  const goals = await prisma.financialGoal.findMany({
    where: {
      userId,
      status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] },
      targetAmount: { not: null }
    },
    orderBy: { createdAt: "asc" }
  });

  const priority = [
    FinancialGoalType.EMERGENCY_FUND,
    FinancialGoalType.HOUSE,
    FinancialGoalType.VEHICLE,
    FinancialGoalType.VACATION,
    FinancialGoalType.CUSTOM,
    FinancialGoalType.FINANCIAL_FREEDOM
  ];

  for (const goalType of priority) {
    const match = goals.find((goal) => goal.goalType === goalType && goal.targetAmount !== null);
    if (match) return match;
  }

  return null;
};

export const buildInitialFinancialProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      financialProfile: true,
      expensePlans: {
        where: { isActive: true },
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: 1
      },
      financialGoals: true,
      assets: true,
      financialFreedom: true
    }
  });

  if (!user) {
    throw new Error("User not found");
  }

  const existingProfile = user.financialProfile;
  const activeIncome = toNumber(existingProfile?.activeIncomeMonthly ?? 0);
  const passiveIncome = toNumber(existingProfile?.passiveIncomeMonthly ?? 0);
  const estimatedIncome = toNumber(existingProfile?.estimatedMonthlyIncome ?? 0);
  const monthlyIncomeTotal = activeIncome + passiveIncome > 0 ? activeIncome + passiveIncome : estimatedIncome || null;

  const activePlan = user.expensePlans[0] ?? null;
  const planExpense = activePlan ? toNumber(activePlan.totalMonthlyExpense) : null;
  const directExpense = toNumber(existingProfile?.monthlyExpenseTotal ?? 0) || null;
  const monthlyExpenseTotal = planExpense ?? directExpense;

  const potentialMonthlySaving =
    monthlyIncomeTotal !== null && monthlyExpenseTotal !== null
      ? monthlyIncomeTotal - monthlyExpenseTotal
      : null;

  const savingRate =
    monthlyIncomeTotal && monthlyExpenseTotal !== null
      ? (potentialMonthlySaving ?? 0) / monthlyIncomeTotal * 100
      : null;

  const emergencyFundTarget =
    monthlyExpenseTotal !== null
      ? monthlyExpenseTotal * getEmergencyFundMultiplier(user.incomeStability)
      : null;

  const annualExpense = monthlyExpenseTotal !== null ? monthlyExpenseTotal * 12 : null;
  const financialFreedomTarget = annualExpense !== null ? annualExpense * env.FINANCIAL_FREEDOM_EXPENSE_MULTIPLIER : null;

  const profile = await prisma.financialProfile.upsert({
    where: { userId },
    update: {
      monthlyIncomeTotal: toBigIntAmount(monthlyIncomeTotal),
      monthlyExpenseTotal: toBigIntAmount(monthlyExpenseTotal),
      potentialMonthlySaving: toBigIntAmount(potentialMonthlySaving),
      savingRate: toDecimal(savingRate),
      emergencyFundTarget: toBigIntAmount(emergencyFundTarget),
      financialFreedomTarget: toBigIntAmount(financialFreedomTarget),
      annualExpense: toBigIntAmount(annualExpense)
    },
    create: {
      userId,
      activeIncomeMonthly: existingProfile?.activeIncomeMonthly ?? null,
      passiveIncomeMonthly: existingProfile?.passiveIncomeMonthly ?? null,
      estimatedMonthlyIncome: existingProfile?.estimatedMonthlyIncome ?? null,
      monthlyIncomeTotal: toBigIntAmount(monthlyIncomeTotal),
      monthlyExpenseTotal: toBigIntAmount(monthlyExpenseTotal),
      potentialMonthlySaving: toBigIntAmount(potentialMonthlySaving),
      savingRate: toDecimal(savingRate),
      emergencyFundTarget: toBigIntAmount(emergencyFundTarget),
      financialFreedomTarget: toBigIntAmount(financialFreedomTarget),
      annualExpense: toBigIntAmount(annualExpense)
    }
  });

  for (const goal of user.financialGoals) {
    let targetAmount = goal.targetAmount;
    let status = goal.status;

    if (goal.goalType === FinancialGoalType.EMERGENCY_FUND) {
      if (emergencyFundTarget !== null) {
        targetAmount = BigInt(emergencyFundTarget);
        status = FinancialGoalStatus.ACTIVE;
      } else {
        targetAmount = null;
        status = FinancialGoalStatus.PENDING_CALCULATION;
      }
    }

    if (goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM) {
      if (financialFreedomTarget !== null) {
        targetAmount = BigInt(financialFreedomTarget);
        status = FinancialGoalStatus.ACTIVE;
      } else {
        targetAmount = null;
        status = FinancialGoalStatus.PENDING_CALCULATION;
      }
    }

    const estimatedMonthsToGoal =
      targetAmount !== null && potentialMonthlySaving && potentialMonthlySaving > 0
        ? Number(targetAmount) / potentialMonthlySaving
        : null;

    await prisma.financialGoal.update({
      where: { id: goal.id },
      data: {
        targetAmount,
        status,
        estimatedMonthsToGoal: toDecimal(estimatedMonthsToGoal)
      }
    });
  }

  if (user.financialGoals.some((goal) => goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM)) {
    await prisma.financialFreedomProfile.upsert({
      where: { userId },
      update: {
        enabled: true,
        monthlyExpense: monthlyExpenseTotal ?? 0
      },
      create: {
        userId,
        enabled: true,
        monthlyExpense: monthlyExpenseTotal ?? 0,
        targetYears: 15,
        safeWithdrawalRate: 0.04
      }
    });
  }

  const legacyGoal = await selectPrimaryGoalForLegacySavings(userId);
  if (legacyGoal && legacyGoal.targetAmount !== null) {
    const legacyTargetAmount = Number(legacyGoal.targetAmount);
    await prisma.savingsGoal.upsert({
      where: { userId },
      update: { targetAmount: legacyTargetAmount },
      create: {
        userId,
        targetAmount: legacyTargetAmount,
        currentProgress: 0
      }
    });
  }

  return profile;
};

export const getOnboardingAnalysisData = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      financialProfile: true,
      expensePlans: {
        where: { isActive: true },
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: 1
      },
      financialGoals: {
        where: { status: { in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.PENDING_CALCULATION] } },
        orderBy: { createdAt: "asc" }
      },
      assets: true
    }
  });

  if (!user || !user.financialProfile) {
    throw new Error("Financial profile not ready");
  }

  const profile = user.financialProfile;
  const activePlan = user.expensePlans[0] ?? null;
  const expenseBreakdown = toExpenseBreakdownFromPlanItems(activePlan?.items);
  const totalAssetValue = user.assets.reduce((sum, asset) => sum + toNumber(asset.estimatedValue ?? 0), 0);

  return {
    user,
    incomeTotal: toNumber(profile.monthlyIncomeTotal ?? 0),
    expenseTotal: profile.monthlyExpenseTotal !== null ? toNumber(profile.monthlyExpenseTotal) : null,
    potentialSaving:
      profile.potentialMonthlySaving !== null ? toNumber(profile.potentialMonthlySaving) : null,
    savingRate: profile.savingRate !== null ? toNumber(profile.savingRate) : null,
    emergencyFundTarget:
      profile.emergencyFundTarget !== null ? toNumber(profile.emergencyFundTarget) : null,
    financialFreedomTarget:
      profile.financialFreedomTarget !== null ? toNumber(profile.financialFreedomTarget) : null,
    annualExpense: profile.annualExpense !== null ? toNumber(profile.annualExpense) : null,
    expenseBreakdown,
    totalAssetValue,
    goals: user.financialGoals.map((goal) => ({
      id: goal.id,
      goalType: goal.goalType,
      goalName: goal.goalName,
      targetAmount: goal.targetAmount !== null ? toNumber(goal.targetAmount) : null,
      status: goal.status,
      estimatedMonthsToGoal:
        goal.estimatedMonthsToGoal !== null ? toNumber(goal.estimatedMonthsToGoal) : null
    })),
    assets: user.assets.map((asset) => ({
      id: asset.id,
      assetType: asset.assetType,
      assetName: asset.assetName,
      estimatedValue: asset.estimatedValue !== null ? toNumber(asset.estimatedValue) : null
    }))
  };
};

export const generateOnboardingAnalysis = async (userId: string) => {
  const data = await getOnboardingAnalysisData(userId);
  const employmentIntro =
    data.user.employmentType === EmploymentType.EMPLOYEE
      ? "Analisa awal keuangan kamu sudah siap, Boss. Income kamu cenderung stabil, jadi basis budgeting dan target tracking sudah bisa dipakai sekarang."
      : data.user.employmentType === EmploymentType.FREELANCER || data.user.employmentType === EmploymentType.ENTREPRENEUR
        ? "Profil keuangan kamu sudah saya rangkum, Boss. Karena income kamu lebih dinamis, pengaturan cashflow dan dana aman jadi prioritas utama."
        : "Analisa awal keuangan kamu sudah siap, Boss. Data ini sudah cukup untuk mulai memonitor kebiasaan uangmu secara lebih rapi.";

  const lines = [employmentIntro, "", `Income bulanan: ${formatMoney(data.incomeTotal)}`];

  if (data.expenseTotal !== null) {
    lines.push(`Pengeluaran bulanan: ${formatMoney(data.expenseTotal)}`);
  } else {
    lines.push("Pengeluaran bulanan: belum tersedia");
  }

  lines.push(...buildExpenseBreakdownSummaryLines(data.expenseBreakdown));

  if (data.potentialSaving !== null) {
    lines.push(`Potensi tabungan: ${formatMoney(data.potentialSaving)}/bulan`);
  }

  if (data.savingRate !== null && Number.isFinite(data.savingRate)) {
    lines.push(`Saving rate: ${formatPercent(data.savingRate, 1)}`);
  }

  const emergencyGoal = data.goals.find((goal) => goal.goalType === FinancialGoalType.EMERGENCY_FUND);
  if (emergencyGoal) {
    lines.push(
      emergencyGoal.targetAmount !== null
        ? `Target dana darurat: ${formatMoney(emergencyGoal.targetAmount)}`
        : "Target dana darurat: masih pending, butuh data pengeluaran bulanan."
    );
  }

  const freedomGoal = data.goals.find((goal) => goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM);
  if (freedomGoal) {
    lines.push(
      freedomGoal.targetAmount !== null
        ? `Target financial freedom: ${formatMoney(freedomGoal.targetAmount)}`
        : "Target financial freedom: masih pending, butuh data pengeluaran bulanan."
    );
  }

  const manualGoals = data.goals.filter(
    (goal) =>
      goal.goalType !== FinancialGoalType.EMERGENCY_FUND && goal.goalType !== FinancialGoalType.FINANCIAL_FREEDOM
  );
  for (const goal of manualGoals.slice(0, 3)) {
    const goalLine = goal.targetAmount !== null ? formatMoney(goal.targetAmount) : "pending";
    const etaLine = goal.estimatedMonthsToGoal ? `, estimasi ${goal.estimatedMonthsToGoal.toFixed(1)} bulan` : "";
    lines.push(`Target ${goal.goalName}: ${goalLine}${etaLine}`);
  }

  if (data.assets.length) {
    lines.push(`Total aset terdata: ${formatMoney(data.totalAssetValue)}`);
  } else {
    lines.push("Aset terdata: belum ada. Fokus awal yang disarankan adalah bangun dana aman dan aset pertama.");
  }

  if (!data.expenseBreakdown && data.user.budgetMode === BudgetMode.AUTO_FROM_TRANSACTIONS) {
    lines.push(
      "Breakdown pengeluaran detail belum tersedia karena alokasi akan saya pelajari dari histori transaksi berikutnya."
    );
  }

  const insightLines: string[] = [];
  if (data.potentialSaving !== null && data.potentialSaving <= 0) {
    insightLines.push("Cashflow masih ketat. Prioritas utama adalah merapikan pengeluaran rutin sebelum menambah target besar.");
  }
  if (data.potentialSaving !== null && data.potentialSaving > 0 && data.assets.length === 0) {
    insightLines.push("Kamu sudah punya ruang tabung bulanan. Ini modal yang bagus untuk mulai bangun dana darurat lalu aset pertama.");
  }
  if (data.assets.length > 0) {
    insightLines.push("Data aset awal sudah tersimpan. Nanti insight investasi dan news personal bisa diarahkan ke aset yang kamu punya.");
  }
  if (emergencyGoal?.targetAmount && data.potentialSaving && data.potentialSaving > 0) {
    insightLines.push("Dana darurat sekarang sudah bisa dipantau otomatis dari profil pengeluaran kamu.");
  }

  if (insightLines.length) {
    lines.push("");
    lines.push("Insight awal:");
    for (const insight of insightLines) {
      lines.push(`- ${insight}`);
    }
  }

  return lines.join("\n").trim();
};

export const deriveEmploymentSummary = (employmentTypes: EmploymentType[]) => {
  if (!employmentTypes.length) {
    return {
      employmentType: null,
      incomeStability: null
    };
  }

  if (employmentTypes.length === 1) {
    const [only] = employmentTypes;
    return {
      employmentType: only,
      incomeStability:
        only === EmploymentType.EMPLOYEE
          ? IncomeStability.STABLE
          : only === EmploymentType.FREELANCER || only === EmploymentType.ENTREPRENEUR
            ? IncomeStability.UNSTABLE
            : IncomeStability.MIXED
    };
  }

  const hasStable = employmentTypes.includes(EmploymentType.EMPLOYEE);
  return {
    employmentType: EmploymentType.MIXED,
    incomeStability: hasStable ? IncomeStability.MIXED : IncomeStability.UNSTABLE
  };
};

export const parseManualBreakdownTotal = (breakdown: ExpenseBreakdown) => {
  if (!hasKnownExpenseBreakdown(breakdown)) return null;
  return sumBreakdown(breakdown);
};


