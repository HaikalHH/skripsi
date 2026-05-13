import { OnboardingQuestionKey, OnboardingStep, type OnboardingSession } from "@prisma/client";
import {
  getSessionNormalizedValue,
  latestSessionForQuestion
} from "@/lib/services/onboarding/flow/shared/answers/common-input";
import { formatMoney } from "@/lib/services/shared/money";

const GUIDED_EXPENSE_SUMMARY_BUCKETS: Array<{
  questionKey: OnboardingQuestionKey;
  label: string;
}> = [
  {
    questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_FOOD,
    label: "Makan & kebutuhan harian"
  },
  {
    questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_TRANSPORT,
    label: "Transport"
  },
  {
    questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_BILLS,
    label: "Tagihan & kewajiban rutin"
  },
  {
    questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_ENTERTAINMENT,
    label: "Hiburan & lifestyle"
  }
];

export const buildGuidedExpenseSummaryItems = (
  sessions: OnboardingSession[],
  guidedOtherItems: Array<{ label: string; amount: number }>
) => {
  const guidedCoreItems = GUIDED_EXPENSE_SUMMARY_BUCKETS.map((bucket) => ({
    label: bucket.label,
    amount:
      getSessionNormalizedValue<number>(
        latestSessionForQuestion(sessions, bucket.questionKey)
      ) ?? 0
  })).filter((item) => item.amount > 0);

  return [
    ...guidedCoreItems,
    ...guidedOtherItems.filter((item) => Number.isFinite(item.amount) && item.amount > 0)
  ];
};

export const formatGuidedExpenseSummaryText = (
  items: Array<{ label: string; amount: number }>,
  totals?: {
    monthlyExpenseTotal?: number | null;
    potentialMonthlySaving?: number | null;
  }
) => {
  if (!items.length) return null;

  const resolvedMonthlyExpenseTotal =
    totals?.monthlyExpenseTotal ??
    items.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0);
  const lines = [
    "Berikut kategori pengeluarannya:",
    ...items.map((item) => `- ${item.label}: ${formatMoney(item.amount)}/bulan`)
  ];

  if (resolvedMonthlyExpenseTotal > 0) {
    lines.push("");
    lines.push(`Total pengeluaran: ${formatMoney(resolvedMonthlyExpenseTotal)}/bulan`);
  }

  if (totals?.potentialMonthlySaving !== null && totals?.potentialMonthlySaving !== undefined) {
    if (totals.potentialMonthlySaving >= 0) {
      lines.push(`Sisa dari income: ${formatMoney(totals.potentialMonthlySaving)}/bulan`);
    } else {
      lines.push(`Masih tekor dari income: ${formatMoney(Math.abs(totals.potentialMonthlySaving))}/bulan`);
    }
  }

  return lines.join("\n");
};

export const getAssetTransitionLeadText = () =>
  "Sip, gambaran pengeluaran bulanannya sudah kebaca. Sekarang saya cek aset yang sudah jalan ya Boss.";

const EXPENSE_TO_ASSET_TRANSITION_STEPS = new Set<OnboardingStep>([
  OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN,
  OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS,
  OnboardingStep.ASK_GOAL_EXPENSE_TOTAL
]);

export const shouldSeparateNextPromptBubble = (
  currentStep: OnboardingStep,
  nextStep: OnboardingStep
) =>
  nextStep === OnboardingStep.ASK_ASSET_SELECTION &&
  EXPENSE_TO_ASSET_TRANSITION_STEPS.has(currentStep);
