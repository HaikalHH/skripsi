export const confirmTransactionText = (params: {
  type: "INCOME" | "EXPENSE";
  amount: number;
  category: string;
  occurredAt: Date;
  merchant?: string | null;
}) =>
  [
    "Transaksi berhasil dicatat:",
    `- Tipe: ${params.type}`,
    `- Amount: ${params.amount.toFixed(2)}`,
    `- Category: ${params.category}`,
    params.merchant ? `- Merchant: ${params.merchant}` : null,
    `- Tanggal: ${params.occurredAt.toISOString()}`
  ]
    .filter(Boolean)
    .join("\n");

export const buildBudgetSetText = (params: {
  category: string;
  monthlyLimit: number;
  spentThisMonth: number;
  remainingThisMonth: number;
}) =>
  [
    "Budget kategori berhasil disimpan:",
    `- Category: ${params.category}`,
    `- Limit bulanan: ${params.monthlyLimit.toFixed(2)}`,
    `- Terpakai bulan ini: ${params.spentThisMonth.toFixed(2)}`,
    `- Sisa bulan ini: ${params.remainingThisMonth.toFixed(2)}`
  ].join("\n");

export const buildGoalStatusText = (params: {
  targetAmount: number;
  currentProgress: number;
  remainingAmount: number;
  progressPercent: number;
}) => {
  if (params.targetAmount <= 0) {
    return "Target tabungan belum diset. Gunakan `/goal set <target>`.";
  }

  return [
    "Status goal tabungan:",
    `- Target: ${params.targetAmount.toFixed(2)}`,
    `- Progress: ${params.currentProgress.toFixed(2)}`,
    `- Remaining: ${params.remainingAmount.toFixed(2)}`,
    `- Progress: ${params.progressPercent.toFixed(1)}%`
  ].join("\n");
};

export const parseSentAt = (raw: string | undefined) => {
  if (!raw) return new Date();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
};
