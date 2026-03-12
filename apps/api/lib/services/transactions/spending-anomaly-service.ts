import { prisma } from "@/lib/prisma";
import { formatMoney, formatPercent } from "@/lib/services/shared/money-format";

const LOOKBACK_DAYS = 30;
const MIN_EXPENSE_AMOUNT = 250_000;
const MULTIPLIER_THRESHOLD = 2.5;

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

export const checkUnusualExpenseAlert = async (params: {
  userId: string;
  amount: number;
  occurredAt: Date;
}) => {
  if (params.amount < MIN_EXPENSE_AMOUNT) return null;

  const lookbackStart = new Date(params.occurredAt);
  lookbackStart.setUTCDate(lookbackStart.getUTCDate() - LOOKBACK_DAYS);

  const stats = await prisma.transaction.aggregate({
    where: {
      userId: params.userId,
      type: "EXPENSE",
      occurredAt: {
        gte: lookbackStart,
        lt: params.occurredAt
      }
    },
    _avg: { amount: true },
    _count: { id: true }
  });

  const sampleSize = (stats as { _count?: { id?: number } })._count?.id ?? 0;
  const average = toNumber((stats as { _avg?: { amount?: unknown } })._avg?.amount ?? 0);
  if (sampleSize < 3 || average <= 0) return null;

  if (params.amount < average * MULTIPLIER_THRESHOLD) return null;

  const spikePercent = ((params.amount - average) / average) * 100;
  return `Notifikasi: transaksi ${formatMoney(params.amount)} tergolong besar tidak biasa (sekitar ${formatPercent(
    spikePercent
  )} di atas rata-rata harian terakhir).`;
};
