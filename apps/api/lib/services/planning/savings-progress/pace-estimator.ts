import { prisma } from "@/lib/prisma";
import { toNumber } from "./number-utils";

const DAYS_WINDOW = 90;

export const estimateMonthlySavingsPace = async (userId: string): Promise<number> => {
  const windowStart = new Date();
  windowStart.setUTCDate(windowStart.getUTCDate() - DAYS_WINDOW);

  const savingAgg = await prisma.transaction.aggregate({
    where: {
      userId,
      type: "SAVING",
      occurredAt: { gte: windowStart }
    },
    _sum: { amount: true }
  });

  const directSaving = toNumber(savingAgg._sum.amount ?? 0);
  if (directSaving > 0) {
    const monthlySavingPace = (directSaving / DAYS_WINDOW) * 30;
    return Number.isFinite(monthlySavingPace) ? monthlySavingPace : 0;
  }

  return 0;
};
