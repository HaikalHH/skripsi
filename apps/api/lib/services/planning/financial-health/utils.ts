export const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

export const getTopExpenseCategory = (transactions: Array<{ category: string; amount: unknown }>) => {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + toNumber(transaction.amount));
  }

  return Array.from(totals.entries()).sort((left, right) => right[1] - left[1])[0] ?? null;
};
