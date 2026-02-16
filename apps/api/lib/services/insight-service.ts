import { prisma } from "../prisma";
import { generateAIInsight } from "./ai-service";

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

export const generateUserInsight = async (userId: string): Promise<string> => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const txs = await prisma.transaction.findMany({
    where: {
      userId,
      occurredAt: {
        gte: start,
        lte: now
      }
    }
  });

  if (!txs.length) {
    return "Belum ada transaksi bulan ini. Mulai dengan mencatat transaksi harian Anda.";
  }

  let income = 0;
  let expense = 0;
  const categoryMap = new Map<string, number>();

  for (const tx of txs) {
    const amount = toNumber(tx.amount);
    if (tx.type === "INCOME") {
      income += amount;
    } else {
      expense += amount;
      categoryMap.set(tx.category, (categoryMap.get(tx.category) ?? 0) + amount);
    }
  }

  const topCategory = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1])[0];
  const balance = income - expense;
  const rules: string[] = [];

  if (expense > income) {
    rules.push("Pengeluaran bulan ini lebih besar dari pemasukan.");
  } else {
    rules.push("Arus kas masih positif bulan ini.");
  }

  if (topCategory) {
    rules.push(`Kategori pengeluaran tertinggi: ${topCategory[0]} (${topCategory[1].toFixed(2)}).`);
  }

  if (income > 0) {
    const savingsRate = (balance / income) * 100;
    rules.push(`Perkiraan savings rate: ${savingsRate.toFixed(1)}%.`);
  }

  const summary = `income=${income.toFixed(2)}, expense=${expense.toFixed(
    2
  )}, balance=${balance.toFixed(2)}, topCategory=${topCategory?.[0] ?? "N/A"}`;

  try {
    const aiText = await generateAIInsight(summary);
    return `${rules.join(" ")} ${aiText}`.trim();
  } catch {
    return rules.join(" ");
  }
};
