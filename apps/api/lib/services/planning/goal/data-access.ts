import { prisma } from "@/lib/prisma";
import { toNumber } from "./utils";

export const getFinancialGoalModel = () => (prisma as { financialGoal?: any }).financialGoal;
export const getSavingsGoalModel = () => (prisma as { savingsGoal?: any }).savingsGoal;
export const getFinancialProfileModel = () => (prisma as { financialProfile?: any }).financialProfile;
export const getGoalContributionModel = () => (prisma as { goalContribution?: any }).goalContribution;

export const calculateNetSavings = async (userId: string) => {
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

  const income = toNumber(incomeAgg._sum.amount ?? 0);
  const expense = toNumber(expenseAgg._sum.amount ?? 0);
  return Math.max(0, income - expense);
};

export const calculateRecordedSavingTotal = async (userId: string) => {
  const savingAgg = await prisma.transaction.aggregate({
    where: { userId, type: "SAVING" },
    _sum: { amount: true }
  });

  return Math.max(0, toNumber(savingAgg._sum.amount ?? 0));
};

export const getMonthlySavingCapacity = async (userId: string) => {
  const financialProfileModel = getFinancialProfileModel();
  const profile = financialProfileModel
    ? await financialProfileModel.findUnique({
        where: { userId },
        select: { potentialMonthlySaving: true }
      })
    : null;

  if (profile && profile.potentialMonthlySaving != null) {
    return Math.max(0, toNumber(profile.potentialMonthlySaving));
  }

  return calculateNetSavings(userId);
};
