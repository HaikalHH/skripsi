import { formatMoney, formatPercent } from "@/lib/services/shared/money-format";

export const confirmTransactionText = (params: {
  type: "INCOME" | "EXPENSE";
  amount: number;
  category: string;
  detailTag?: string | null;
  occurredAt: Date;
  merchant?: string | null;
}) =>
  [
    "Transaksi berhasil dicatat:",
    `- Tipe: ${params.type}`,
    `- Amount: ${formatMoney(params.amount)}`,
    `- Category: ${params.category}${params.detailTag ? ` / ${params.detailTag}` : ""}`,
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
    `- Limit bulanan: ${formatMoney(params.monthlyLimit)}`,
    `- Terpakai bulan ini: ${formatMoney(params.spentThisMonth)}`,
    `- Sisa bulan ini: ${formatMoney(params.remainingThisMonth)}`
  ].join("\n");

export const buildGoalStatusText = (params: {
  goalName?: string | null;
  estimatedMonthsToGoal?: number | null;
  monthlyContributionPace?: number | null;
  monthlySavingCapacity?: number | null;
  recommendedPlan?: Array<{
    goalName: string;
    recommendedMonthlyContribution: number;
    sharePercent: number;
  }>;
  totalGoals?: number;
  goals?: Array<{
    goalName: string;
    targetAmount: number;
    remainingAmount: number;
    progressPercent: number;
    estimatedMonthsToGoal: number | null;
    monthlyContributionPace: number | null;
    recommendedMonthlyContribution: number | null;
    recommendedAllocationShare: number | null;
    recentContributionTotal: number;
    lastContributionAt: Date | null;
    contributionActiveMonths: number;
    contributionMonthStreak: number;
    trackingStatus: "ON_TRACK" | "WATCH" | "OFF_TRACK";
    isPrimary: boolean;
    progressSource: "GOAL_CONTRIBUTIONS" | "NET_SAVINGS_PROXY";
  }>;
  goalNotFoundQuery?: string | null;
  targetAmount: number;
  currentProgress: number;
  remainingAmount: number;
  progressPercent: number;
  progressSource?: "GOAL_CONTRIBUTIONS" | "NET_SAVINGS_PROXY";
  contributionActiveMonths?: number;
  contributionMonthStreak?: number;
  trackingStatus?: "ON_TRACK" | "WATCH" | "OFF_TRACK";
}) => {
  const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
  if (params.goalNotFoundQuery) {
    return `Saya belum menemukan goal \`${params.goalNotFoundQuery}\`. Coba cek status goal aktif dulu atau sebut nama goal yang lebih spesifik.`;
  }

  if (params.targetAmount <= 0) {
    return "Target tabungan belum diset. Gunakan `/goal set <target>`.";
  }

  const etaText =
    params.estimatedMonthsToGoal != null && Number.isFinite(params.estimatedMonthsToGoal)
      ? `- Estimasi tercapai: ${params.estimatedMonthsToGoal.toFixed(1)} bulan`
      : null;
  const paceText =
    params.monthlyContributionPace != null && Number.isFinite(params.monthlyContributionPace)
      ? `- Ritme progress: ${formatMoney(params.monthlyContributionPace)}/bulan`
      : null;
  const recommendedText =
    params.recommendedPlan?.[0]?.recommendedMonthlyContribution != null
      ? `- Rekomendasi setoran utama: ${formatMoney(params.recommendedPlan[0].recommendedMonthlyContribution)}/bulan`
      : null;
  const capacityText =
    params.monthlySavingCapacity != null && Number.isFinite(params.monthlySavingCapacity)
      ? `- Kapasitas tabungan bulanan: ${formatMoney(params.monthlySavingCapacity)}`
      : null;
  const sourceNote =
    params.progressSource === "NET_SAVINGS_PROXY"
      ? "- Catatan: progress masih memakai proxy tabungan bersih, belum kontribusi goal spesifik."
      : null;
  const trackingText = params.trackingStatus ? `- Status tracking: ${params.trackingStatus}` : null;
  const streakText =
    (params.contributionMonthStreak ?? 0) > 0
      ? `- Streak kontribusi: ${params.contributionMonthStreak} bulan`
      : null;
  const activeMonthsText =
    (params.contributionActiveMonths ?? 0) > 0
      ? `- Bulan aktif kontribusi: ${params.contributionActiveMonths}`
      : null;

  if ((params.totalGoals ?? 0) > 1 && params.goals?.length) {
    const goalLines = params.goals.slice(0, 5).map(
      (goal, index) =>
        `${index + 1}. ${goal.goalName} | target ${formatMoney(goal.targetAmount)} | progress ${formatPercent(
          goal.progressPercent
        )} | sisa ${formatMoney(goal.remainingAmount)}${
          goal.estimatedMonthsToGoal != null ? ` | eta ${goal.estimatedMonthsToGoal.toFixed(1)} bln` : ""
        }${goal.monthlyContributionPace != null ? ` | pace ${formatMoney(goal.monthlyContributionPace)}/bln` : ""}${
          goal.recommendedMonthlyContribution != null
            ? ` | saran ${formatMoney(goal.recommendedMonthlyContribution)}/bln`
            : ""
        }${goal.recentContributionTotal > 0 ? ` | 30h ${formatMoney(goal.recentContributionTotal)}` : ""}${
          goal.lastContributionAt ? ` | update ${DATE_LABEL_FORMATTER.format(goal.lastContributionAt)}` : ""
        }${goal.contributionMonthStreak > 0 ? ` | streak ${goal.contributionMonthStreak} bln` : ""}${
          goal.contributionActiveMonths > 0 ? ` | aktif ${goal.contributionActiveMonths} bln` : ""
        }${goal.trackingStatus ? ` | ${goal.trackingStatus}` : ""}${
          goal.progressSource === "NET_SAVINGS_PROXY" ? " | proxy" : ""
        }${
          goal.isPrimary ? " | prioritas" : ""
        }`
    );

    return [
      "Status target keuangan:",
      `- Goal utama: ${params.goalName ?? "Target Utama"}`,
      `- Progress utama: ${formatMoney(params.currentProgress)} dari ${formatMoney(params.targetAmount)} (${formatPercent(params.progressPercent)})`,
      `- Sisa utama: ${formatMoney(params.remainingAmount)}`,
      etaText,
      paceText,
      capacityText,
      recommendedText,
      trackingText,
      streakText,
      activeMonthsText,
      `- Total goal aktif: ${params.totalGoals}`,
      sourceNote,
      "- Ringkasan goal:",
      ...goalLines
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `Status goal ${params.goalName ?? "tabungan"}:`,
    `- Target: ${formatMoney(params.targetAmount)}`,
    `- Progress: ${formatMoney(params.currentProgress)}`,
    `- Remaining: ${formatMoney(params.remainingAmount)}`,
    `- Progress: ${formatPercent(params.progressPercent)}`,
    etaText,
    paceText,
    capacityText,
    recommendedText,
    trackingText,
    streakText,
    activeMonthsText,
    sourceNote
  ].join("\n");
};

export const buildGoalContributionText = (params: {
  contributionAmount: number;
  goalCompleted?: boolean;
    goalStatus: {
      goalName?: string | null;
      estimatedMonthsToGoal?: number | null;
      monthlyContributionPace?: number | null;
      monthlySavingCapacity?: number | null;
      recommendedPlan?: Array<{
        goalName: string;
        recommendedMonthlyContribution: number;
        sharePercent: number;
      }>;
      totalGoals?: number;
      goals?: Array<{
        goalName: string;
        targetAmount: number;
        remainingAmount: number;
        progressPercent: number;
        estimatedMonthsToGoal: number | null;
        monthlyContributionPace: number | null;
        recommendedMonthlyContribution: number | null;
        recommendedAllocationShare: number | null;
      recentContributionTotal: number;
      lastContributionAt: Date | null;
      contributionActiveMonths: number;
      contributionMonthStreak: number;
      trackingStatus: "ON_TRACK" | "WATCH" | "OFF_TRACK";
      isPrimary: boolean;
      progressSource: "GOAL_CONTRIBUTIONS" | "NET_SAVINGS_PROXY";
      }>;
    goalNotFoundQuery?: string | null;
    targetAmount: number;
    currentProgress: number;
    remainingAmount: number;
    progressPercent: number;
    progressSource?: "GOAL_CONTRIBUTIONS" | "NET_SAVINGS_PROXY";
    contributionActiveMonths?: number;
    contributionMonthStreak?: number;
    trackingStatus?: "ON_TRACK" | "WATCH" | "OFF_TRACK";
  };
}) => {
  if (params.goalStatus.goalNotFoundQuery) {
    return `Saya belum menemukan goal \`${params.goalStatus.goalNotFoundQuery}\`, jadi setoran ${formatMoney(
      params.contributionAmount
    )} belum saya masukkan. Coba sebut nama goal yang lebih spesifik.`;
  }

  return [
    `Setoran goal berhasil dicatat: ${formatMoney(params.contributionAmount)}`,
    params.goalCompleted ? "Goal ini sudah mencapai target." : null,
    buildGoalStatusText(params.goalStatus)
  ]
    .filter(Boolean)
    .join("\n");
};

export const parseSentAt = (raw: string | undefined) => {
  if (!raw) return new Date();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
};
