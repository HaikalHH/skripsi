import { prisma } from "@/lib/prisma";

export const getFinancialProfileModel = () =>
  (prisma as unknown as {
    financialProfile?: {
      findUnique: (args: {
        where: { userId: string };
        select: {
          activeIncomeMonthly: true;
          passiveIncomeMonthly: true;
          monthlyIncomeTotal: true;
          monthlyExpenseTotal: true;
        };
      }) => Promise<{
        activeIncomeMonthly: bigint | null;
        passiveIncomeMonthly: bigint | null;
        monthlyIncomeTotal: bigint | null;
        monthlyExpenseTotal: bigint | null;
      } | null>;
    };
  }).financialProfile;

export const getAssetModel = () =>
  (prisma as unknown as {
    asset?: {
      findMany: (args: {
        where: { userId: string; assetType: { in: string[] } };
        select: { estimatedValue: true };
      }) => Promise<Array<{ estimatedValue: bigint | null }>>;
    };
  }).asset;
