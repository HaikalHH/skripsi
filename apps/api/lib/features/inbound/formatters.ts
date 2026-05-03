import { formatMoney, formatPercent } from "@/lib/services/shared/money-format";
import { formatDurationFromMonths } from "@/lib/services/shared/projection-math-service";

const TRANSACTION_DATE_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric"
});

export const confirmTransactionText = (params: {
  type: "INCOME" | "EXPENSE" | "SAVING";
  amount: number;
  category: string;
  detailTag?: string | null;
  occurredAt: Date;
  merchant?: string | null;
}) =>
  [
    "Transaksi berhasil dicatat:",
    `- Tipe: ${params.type}${params.type === "SAVING" ? " ✅" : ""}`,
    `- Amount: ${formatMoney(params.amount)}`,
    `- Category: ${params.category}${params.detailTag ? ` / ${params.detailTag}` : ""}`,
    params.merchant ? `- Merchant: ${params.merchant}` : null,
    `- Tanggal: ${TRANSACTION_DATE_FORMATTER.format(params.occurredAt)}`
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
    return "Target tabungan belum diset. Gunakan `/set goal` lalu isi nama, nominal, dan deadline target.";
  }

  const etaText =
    params.estimatedMonthsToGoal != null && Number.isFinite(params.estimatedMonthsToGoal)
      ? `- Estimasi tercapai: ${formatDurationFromMonths(params.estimatedMonthsToGoal)}`
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
  const streakText =
    (params.contributionMonthStreak ?? 0) > 0
      ? `- Streak kontribusi: ${params.contributionMonthStreak} bulan`
      : null;
  const activeMonthsText =
    (params.contributionActiveMonths ?? 0) > 0
      ? `- Bulan aktif kontribusi: ${params.contributionActiveMonths}`
      : null;

  if ((params.totalGoals ?? 0) > 1 && params.goals?.length) {
    const goalLines = params.goals.slice(0, 5).flatMap((goal, index) => [
      `${index + 1}. ${goal.goalName}${goal.isPrimary ? " (prioritas)" : ""}`,
      `   Target: ${formatMoney(goal.targetAmount)}`,
      `   Progress: ${formatPercent(goal.progressPercent)} (${formatMoney(goal.remainingAmount)} lagi)`,
      goal.estimatedMonthsToGoal != null
        ? `   Estimasi: ${formatDurationFromMonths(goal.estimatedMonthsToGoal)}`
        : null,
      goal.recommendedMonthlyContribution != null
        ? `   Saran setoran: ${formatMoney(goal.recommendedMonthlyContribution)}/bulan`
        : null,
      goal.recentContributionTotal > 0
        ? `   Masuk 30 hari ini: ${formatMoney(goal.recentContributionTotal)}`
        : null,
      goal.lastContributionAt ? `   Update terakhir: ${DATE_LABEL_FORMATTER.format(goal.lastContributionAt)}` : null,
      ""
    ].filter((line): line is string => line != null));

    return [
      "Status target keuangan",
      "",
      `Goal utama: ${params.goalName ?? "Target Utama"}`,
      `Progress: ${formatMoney(params.currentProgress)} / ${formatMoney(params.targetAmount)} (${formatPercent(params.progressPercent)})`,
      `Sisa: ${formatMoney(params.remainingAmount)}`,
      etaText,
      paceText,
      capacityText,
      recommendedText,
      streakText,
      activeMonthsText,
      sourceNote,
      "",
      "Ringkasan goal:",
      ...goalLines
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `Status goal ${params.goalName ?? "tabungan"}`,
    "",
    `Target: ${formatMoney(params.targetAmount)}`,
    `Progress: ${formatMoney(params.currentProgress)} / ${formatMoney(params.targetAmount)} (${formatPercent(params.progressPercent)})`,
    `Sisa: ${formatMoney(params.remainingAmount)}`,
    etaText,
    paceText,
    capacityText,
    recommendedText,
    streakText,
    activeMonthsText,
    sourceNote
  ]
    .filter(Boolean)
    .join("\n");
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
