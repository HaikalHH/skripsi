import { formatMoney } from "@/lib/services/shared/money";

export type ExpenseBreakdown = {
  food: number;
  transport: number;
  bills: number;
  entertainment: number;
  others: number;
};

export const EMPTY_EXPENSE_BREAKDOWN: ExpenseBreakdown = {
  food: 0,
  transport: 0,
  bills: 0,
  entertainment: 0,
  others: 0
};

const ONBOARDING_EXPENSE_BUCKET_LABELS: Record<keyof ExpenseBreakdown, string> = {
  food: "Makan & kebutuhan harian",
  transport: "Transport",
  bills: "Tagihan & kewajiban rutin",
  entertainment: "Hiburan & lifestyle",
  others: "Pengeluaran tambahan"
};

const ONBOARDING_EXPENSE_BUCKET_EXPLANATIONS: Record<keyof ExpenseBreakdown, string> = {
  food: "makan/minum, kopi, restoran, sembako, belanja dapur, dan konsumsi harian",
  transport: "bensin, parkir, tol, ojol, taksi, kereta, bus, dan perjalanan rutin",
  bills: "listrik, air, internet, pulsa, cicilan, asuransi, BPJS, sekolah/kuliah/les, dan kewajiban rutin lain",
  entertainment: "nongkrong, streaming, game, bioskop, konser, hobi, dan pengeluaran lifestyle serupa",
  others: "kategori tambahan yang ditulis sendiri oleh user saat onboarding"
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

export const hasKnownExpenseBreakdown = (breakdown: ExpenseBreakdown) =>
  Object.values(breakdown).some((value) => value > 0);

export const sumBreakdown = (breakdown: ExpenseBreakdown) =>
  breakdown.food + breakdown.transport + breakdown.bills + breakdown.entertainment + breakdown.others;

export const toExpenseBreakdownFromPlanItems = (
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

export const parseManualBreakdownTotal = (breakdown: ExpenseBreakdown) => {
  if (!hasKnownExpenseBreakdown(breakdown)) return null;
  return sumBreakdown(breakdown);
};
