import { prisma } from "@/lib/prisma";
import type { GoalPlanCandidate } from "./types";
import { toNumber } from "./utils";

const getFinancialProfileModel = () => (prisma as { financialProfile?: any }).financialProfile;

export const simulateExpenseGrowthEta = async (params: {
  userId: string;
  goal: GoalPlanCandidate;
  annualExpenseGrowthRate: number;
  fallbackMonthlySavingCapacity: number;
}) => {
  const financialProfileModel = getFinancialProfileModel();
  const profile = financialProfileModel
    ? await financialProfileModel.findUnique({
        where: { userId: params.userId },
        select: {
          monthlyIncomeTotal: true,
          monthlyExpenseTotal: true
        }
      })
    : null;

  const monthlyExpense = toNumber(profile?.monthlyExpenseTotal ?? 0);
  const monthlyIncome = toNumber(profile?.monthlyIncomeTotal ?? 0);
  const incomeBaseline =
    monthlyIncome > 0 ? monthlyIncome : monthlyExpense + params.fallbackMonthlySavingCapacity;

  if (incomeBaseline <= 0 || monthlyExpense <= 0) {
    return null;
  }

  const monthlyGrowthFactor = Math.pow(1 + params.annualExpenseGrowthRate / 100, 1 / 12);
  let currentExpense = monthlyExpense;
  let progress = 0;
  let month = 0;

  while (progress < params.goal.remainingAmount && month < 600) {
    const monthlySaving = Math.max(0, incomeBaseline - currentExpense);
    if (monthlySaving <= 0) return null;
    progress += monthlySaving;
    currentExpense *= monthlyGrowthFactor;
    month += 1;
  }

  if (progress < params.goal.remainingAmount) return null;
  return month;
};
