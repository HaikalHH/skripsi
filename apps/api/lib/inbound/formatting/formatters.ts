import { formatMoney, formatPercent } from "@/lib/services/shared/money";
import { formatDurationFromMonths } from "@/lib/services/shared/projection";

const TRANSACTION_DATE_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric"
});

const GOAL_PROGRESS_BAR_SEGMENTS = 10;

const clampProgressPercent = (value: number) =>
  Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

const buildGoalProgressBar = (progressPercent: number) => {
  const filledSegments = Math.round(
    (clampProgressPercent(progressPercent) / 100) * GOAL_PROGRESS_BAR_SEGMENTS
  );
  return `${"█".repeat(filledSegments)}${"░".repeat(
    GOAL_PROGRESS_BAR_SEGMENTS - filledSegments
  )}`;
};

const buildGoalProgressLines = (params: {
  currentProgress: number;
  targetAmount: number;
  progressPercent: number;
}) => [
  `Progress: ${formatMoney(params.currentProgress)} / ${formatMoney(params.targetAmount)} (${formatPercent(clampProgressPercent(params.progressPercent))})`,
  buildGoalProgressBar(params.progressPercent)
];

const getGoalTrackingEmoji = (goal: {
  isPrimary?: boolean;
  trackingStatus?: "ON_TRACK" | "WATCH" | "OFF_TRACK";
}) => {
  if (goal.isPrimary) return "✅";
  if (goal.trackingStatus === "OFF_TRACK") return "🔴";
  if (goal.trackingStatus === "WATCH") return "🟡";
  return "✅";
};

export const confirmTransactionText = (params: {
  type: "INCOME" | "EXPENSE" | "SAVING";
  amount: number;
  category: string;
  detailTag?: string | null;
  occurredAt: Date;
  merchant?: string | null;
}) =>
  [
    "✅ Transaksi berhasil dicatat:",
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
  totalMonthlyExpense?: number | null;
  potentialMonthlySaving?: number | null;
}) =>
  [
    "✅ Budget kategori berhasil disimpan:",
    `- Category: ${params.category}`,
    `- Limit bulanan: ${formatMoney(params.monthlyLimit)}`,
    `- Terpakai bulan ini: ${formatMoney(params.spentThisMonth)}`,
    `- Sisa bulan ini: ${formatMoney(params.remainingThisMonth)}`,
    params.totalMonthlyExpense != null
      ? `- Total pengeluaran bulanan: ${formatMoney(params.totalMonthlyExpense)}`
      : null,
    params.potentialMonthlySaving != null
      ? `- Sisa untuk target: ${formatMoney(params.potentialMonthlySaving)}/bulan`
      : null
  ]
    .filter(Boolean)
    .join("\n");

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
      ? `- Rata-rata setor tercatat: ${formatMoney(Math.round(params.monthlyContributionPace))}/bulan`
      : null;
  const recommendedText =
    params.recommendedPlan?.[0]?.recommendedMonthlyContribution != null
      ? `- Setoran bulanan disarankan: ${formatMoney(params.recommendedPlan[0].recommendedMonthlyContribution)}/bulan`
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
    const goalLines = params.goals.slice(0, 5).flatMap((goal, index) => {
      const currentProgress = Math.max(0, goal.targetAmount - goal.remainingAmount);

      return [
        `${index + 1}. ${getGoalTrackingEmoji(goal)} ${goal.goalName}${goal.isPrimary ? " (prioritas)" : ""}`,
        `Target: ${formatMoney(goal.targetAmount)}`,
        ...buildGoalProgressLines({
          currentProgress,
          targetAmount: goal.targetAmount,
          progressPercent: goal.progressPercent
        }),
        `Sisa: ${formatMoney(goal.remainingAmount)}`,
        goal.estimatedMonthsToGoal != null
          ? `Estimasi: ${formatDurationFromMonths(goal.estimatedMonthsToGoal)}`
          : null,
        goal.recommendedMonthlyContribution != null
          ? `Setoran bulanan disarankan: ${formatMoney(goal.recommendedMonthlyContribution)}/bulan`
          : null,
        goal.recentContributionTotal > 0
          ? `Masuk 30 hari ini: ${formatMoney(goal.recentContributionTotal)}`
          : null,
        goal.lastContributionAt ? `Update terakhir: ${DATE_LABEL_FORMATTER.format(goal.lastContributionAt)}` : null,
        ""
      ].filter((line): line is string => line != null);
    });

    return [
      "🎯 Status target keuangan",
      "",
      `Goal utama: ${params.goalName ?? "Target Utama"}`,
      ...buildGoalProgressLines({
        currentProgress: params.currentProgress,
        targetAmount: params.targetAmount,
        progressPercent: params.progressPercent
      }),
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
    `🎯 Status goal ${params.goalName ?? "tabungan"}`,
    "",
    `Target: ${formatMoney(params.targetAmount)}`,
    ...buildGoalProgressLines({
      currentProgress: params.currentProgress,
      targetAmount: params.targetAmount,
      progressPercent: params.progressPercent
    }),
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

type GoalStatusFormatterParams = Parameters<typeof buildGoalStatusText>[0];
type GoalStatusFormatterItem = NonNullable<GoalStatusFormatterParams["goals"]>[number];

const buildGoalStatusSummaryLines = (params: GoalStatusFormatterParams) => {
  const capacityText =
    params.monthlySavingCapacity != null && Number.isFinite(params.monthlySavingCapacity)
      ? `Kapasitas tabungan: ${formatMoney(params.monthlySavingCapacity)}/bulan`
      : null;
  const recommendedText =
    params.recommendedPlan?.[0]?.recommendedMonthlyContribution != null
      ? `Setoran bulanan disarankan: ${formatMoney(params.recommendedPlan[0].recommendedMonthlyContribution)}/bulan`
      : null;
  const sourceNote =
    params.progressSource === "NET_SAVINGS_PROXY"
      ? "Catatan: progress masih memakai proxy tabungan bersih, belum kontribusi goal spesifik."
      : null;

  return [
    "🎯 Status target keuangan",
    "",
    `Goal utama: ${params.goalName ?? "Target Utama"}`,
    ...buildGoalProgressLines({
      currentProgress: params.currentProgress,
      targetAmount: params.targetAmount,
      progressPercent: params.progressPercent
    }),
    `Sisa: ${formatMoney(params.remainingAmount)}`,
    capacityText,
    recommendedText,
    sourceNote
  ].filter((line): line is string => Boolean(line));
};

const buildGoalStatusItemLines = (params: {
  goal: GoalStatusFormatterItem;
  index?: number;
  dateFormatter: Intl.DateTimeFormat;
}) => {
  const currentProgress = Math.max(0, params.goal.targetAmount - params.goal.remainingAmount);
  const prefix = params.index != null ? `${params.index + 1}. ` : "";

  return [
    `${prefix}${getGoalTrackingEmoji(params.goal)} ${params.goal.goalName}${params.goal.isPrimary ? " (prioritas)" : ""}`,
    "",
    `Target: ${formatMoney(params.goal.targetAmount)}`,
    ...buildGoalProgressLines({
      currentProgress,
      targetAmount: params.goal.targetAmount,
      progressPercent: params.goal.progressPercent
    }),
    `Sisa: ${formatMoney(params.goal.remainingAmount)}`,
    params.goal.estimatedMonthsToGoal != null
      ? `Estimasi: ${formatDurationFromMonths(params.goal.estimatedMonthsToGoal)}`
      : null,
    params.goal.monthlyContributionPace != null
      ? `Rata-rata setor tercatat: ${formatMoney(Math.round(params.goal.monthlyContributionPace))}/bulan`
      : null,
    params.goal.recommendedMonthlyContribution != null
      ? `Setoran bulanan disarankan: ${formatMoney(params.goal.recommendedMonthlyContribution)}/bulan`
      : null,
    params.goal.recentContributionTotal > 0
      ? `Masuk 30 hari ini: ${formatMoney(params.goal.recentContributionTotal)}`
      : null,
    params.goal.lastContributionAt
      ? `Update terakhir: ${params.dateFormatter.format(params.goal.lastContributionAt)}`
      : null
  ].filter((line): line is string => line != null);
};

const buildGoalStatusRecommendationLines = (params: GoalStatusFormatterParams) => {
  const goals = params.goals ?? [];
  const offTrackCount = goals.filter((goal) => goal.trackingStatus === "OFF_TRACK").length;
  const watchCount = goals.filter((goal) => goal.trackingStatus === "WATCH").length;
  const shownCount = Math.min(goals.length, 5);
  const hiddenCount = Math.max(0, goals.length - shownCount);
  const statusLine =
    offTrackCount > 0
      ? `Ada ${offTrackCount} target yang perlu penyesuaian setoran atau deadline.`
      : watchCount > 0
        ? `Ada ${watchCount} target yang perlu dipantau ritmenya.`
        : "Semua target aktif masih aman di ritme sekarang.";

  return [
    "📌 Ringkasan",
    "",
    `Total target aktif: ${params.totalGoals ?? goals.length}`,
    hiddenCount > 0 ? `${hiddenCount} target lain tidak ditampilkan di ringkasan ini.` : null,
    statusLine
  ].filter((line): line is string => line != null);
};

export const buildGoalStatusReplyTexts = (params: GoalStatusFormatterParams) => {
  if (params.goalNotFoundQuery || params.targetAmount <= 0) {
    return [buildGoalStatusText(params)];
  }

  const dateFormatter = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });

  if ((params.totalGoals ?? 0) > 1 && params.goals?.length) {
    const goalBubbles = params.goals
      .slice(0, 5)
      .map((goal, index) =>
        buildGoalStatusItemLines({
          goal,
          index,
          dateFormatter
        }).join("\n")
      );

    return [
      buildGoalStatusSummaryLines(params).join("\n"),
      ...goalBubbles,
      buildGoalStatusRecommendationLines(params).join("\n")
    ];
  }

  const singleGoal: GoalStatusFormatterItem = {
    goalName: params.goalName ?? "tabungan",
    targetAmount: params.targetAmount,
    remainingAmount: params.remainingAmount,
    progressPercent: params.progressPercent,
    estimatedMonthsToGoal: params.estimatedMonthsToGoal ?? null,
    monthlyContributionPace: params.monthlyContributionPace ?? null,
    recommendedMonthlyContribution: params.recommendedPlan?.[0]?.recommendedMonthlyContribution ?? null,
    recommendedAllocationShare: params.recommendedPlan?.[0]?.sharePercent ?? null,
    recentContributionTotal: 0,
    lastContributionAt: null,
    contributionActiveMonths: params.contributionActiveMonths ?? 0,
    contributionMonthStreak: params.contributionMonthStreak ?? 0,
    trackingStatus: params.trackingStatus ?? "WATCH",
    isPrimary: true,
    progressSource: params.progressSource ?? "GOAL_CONTRIBUTIONS"
  } satisfies GoalStatusFormatterItem;

  return [
    [
      `🎯 Status goal ${params.goalName ?? "tabungan"}`,
      "",
      ...buildGoalStatusItemLines({
        goal: singleGoal,
        dateFormatter
      }),
      params.monthlySavingCapacity != null && Number.isFinite(params.monthlySavingCapacity)
        ? `Kapasitas tabungan: ${formatMoney(params.monthlySavingCapacity)}/bulan`
        : null,
      params.progressSource === "NET_SAVINGS_PROXY"
        ? "Catatan: progress masih memakai proxy tabungan bersih, belum kontribusi goal spesifik."
        : null
    ]
      .filter((line): line is string => line != null)
      .join("\n")
  ];
};

export const buildGoalStatusReplyPayload = (params: GoalStatusFormatterParams) => {
  const replyTexts = buildGoalStatusReplyTexts(params).map((item) => item.trim()).filter(Boolean);

  return {
    replyText: replyTexts.join("\n\n"),
    replyTexts: replyTexts.length > 1 ? replyTexts : undefined,
    preserveReplyTextBubbles: replyTexts.length > 1 ? true : undefined
  };
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
