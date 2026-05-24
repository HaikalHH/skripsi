import type { GeminiExtraction } from "@finance/shared";
import { AnalysisType, TransactionSource } from "@prisma/client";
import { createAIAnalysisLog } from "@/lib/services/ai/analysis-logs";
import {
  checkBudgetAlert,
  getCategoryBudgetProgress
} from "@/lib/services/transactions/budget";
import { buildSavingsProgressUpdateText } from "@/lib/services/planning/savings-progress";
import { checkUnusualExpenseAlert } from "@/lib/services/transactions/spending-anomaly";
import { syncSavingTransactionGoalProgress } from "@/lib/services/planning/saving-transaction";
import { createTransactionFromExtraction } from "@/lib/services/transactions/transaction";
import { formatMoney } from "@/lib/services/shared/money";
import { confirmTransactionText } from "../formatting/formatters";
import { ok, type InboundHandlerResult } from "../shared/result";

type SaveTransactionAndBuildReplyParams = {
  userId: string;
  messageId: string;
  extraction: GeminiExtraction;
  rawText: string;
  analysisPayload?: unknown;
  forcedCategory?: string | null;
};

const BUDGET_PROGRESS_BAR_SEGMENTS = 10;
const PERCENT_FORMATTER = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
});

const clampPercent = (value: number) =>
  Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

const buildProgressBar = (progressPercent: number) => {
  const filledSegments = Math.round(
    (clampPercent(progressPercent) / 100) * BUDGET_PROGRESS_BAR_SEGMENTS
  );
  return `${"█".repeat(filledSegments)}${"░".repeat(
    BUDGET_PROGRESS_BAR_SEGMENTS - filledSegments
  )}`;
};

const formatBudgetPercent = (value: number) => `${PERCENT_FORMATTER.format(value)}%`;

const isUnbudgetedOthersCategory = (category: string | null | undefined) =>
  category?.trim().toLowerCase() === "others";

const buildCategoryBudgetProgressText = async (params: {
  userId: string;
  category: string;
  occurredAt: Date;
}) => {
  const progress = await getCategoryBudgetProgress(params);
  if (!progress) return null;

  return [
    "📌 Budget kategori bulan ini",
    `${progress.category}: ${formatMoney(progress.spentThisMonth)} / ${formatMoney(
      progress.monthlyLimit
    )}`,
    `Sisa: ${formatMoney(progress.remainingThisMonth)}`,
    `Progress: ${formatBudgetPercent(progress.usagePercent)}`,
    buildProgressBar(progress.usagePercent)
  ].join("\n");
};

export const saveTransactionAndBuildReply = async (
  params: SaveTransactionAndBuildReplyParams
): Promise<InboundHandlerResult> => {
  if (params.extraction.amount != null && params.extraction.amount < 0) {
    return ok({
      replyText: "Maaf, nominal tidak boleh negatif atau minus. Silakan masukkan nominal yang valid, contoh: `makan 45000` atau `gaji masuk 5 juta`."
    });
  }

  const transaction = await createTransactionFromExtraction({
    userId: params.userId,
    extraction: params.extraction,
    source: TransactionSource.TEXT,
    rawText: params.rawText
  });
  const goalStatus =
    transaction.type === "SAVING"
      ? await syncSavingTransactionGoalProgress({
          userId: params.userId,
          amount: Number(transaction.amount),
          rawText: params.rawText
        })
      : null;

  await createAIAnalysisLog({
    userId: params.userId,
    messageId: params.messageId,
    analysisType: AnalysisType.EXTRACTION,
    payload: params.analysisPayload ?? params.extraction
  });

  const amountNumber = Number(transaction.amount);
  const alertText =
    transaction.type === "EXPENSE" && !isUnbudgetedOthersCategory(transaction.category)
      ? await checkBudgetAlert(params.userId, transaction.category, transaction.occurredAt)
      : null;
  const categoryBudgetProgressText =
    transaction.type === "EXPENSE" && !isUnbudgetedOthersCategory(transaction.category)
      ? await buildCategoryBudgetProgressText({
          userId: params.userId,
          category: transaction.category,
          occurredAt: transaction.occurredAt
        })
      : null;
  const goalProgressText = goalStatus
    ? await buildSavingsProgressUpdateText({
        userId: params.userId,
        goalStatus
      })
    : null;
  const anomalyText =
    transaction.type === "EXPENSE"
      ? await checkUnusualExpenseAlert({
          userId: params.userId,
          amount: amountNumber,
          occurredAt: transaction.occurredAt
        })
      : null;
  const categoryOverrideText =
    params.forcedCategory && transaction.category === params.forcedCategory
      ? `Kategori dipaksa sesuai input: ${params.forcedCategory}.`
      : null;
  const replyText = [
    confirmTransactionText({
      type: transaction.type,
      amount: amountNumber,
      category: transaction.category,
      detailTag: transaction.detailTag ?? null,
      occurredAt: transaction.occurredAt,
      merchant: transaction.merchant,
      note: transaction.note,
      rawText: params.rawText
    }),
    categoryOverrideText,
    categoryBudgetProgressText,
    alertText,
    anomalyText,
    goalProgressText
  ]
    .filter(Boolean)
    .join("\n\n");

  return ok({ replyText });
};
