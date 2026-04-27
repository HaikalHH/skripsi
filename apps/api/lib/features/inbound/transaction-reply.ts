import type { GeminiExtraction } from "@finance/shared";
import { AnalysisType, TransactionSource } from "@prisma/client";
import { createAIAnalysisLog } from "@/lib/services/ai/ai-log-service";
import { checkBudgetAlert } from "@/lib/services/transactions/budget-service";
import { buildSavingsProgressUpdateText } from "@/lib/services/planning/savings-progress-service";
import { checkUnusualExpenseAlert } from "@/lib/services/transactions/spending-anomaly-service";
import { refreshSavingsGoalProgress } from "@/lib/services/planning/goal-service";
import { syncSavingTransactionGoalProgress } from "@/lib/services/planning/saving-transaction-service";
import { createTransactionFromExtraction } from "@/lib/services/transactions/transaction-service";
import { confirmTransactionText } from "./formatters";
import { ok, type InboundHandlerResult } from "./result";

type SaveTransactionAndBuildReplyParams = {
  userId: string;
  messageId: string;
  extraction: GeminiExtraction;
  rawText: string;
  analysisPayload?: unknown;
  forcedCategory?: string | null;
};

export const saveTransactionAndBuildReply = async (
  params: SaveTransactionAndBuildReplyParams
): Promise<InboundHandlerResult> => {
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
      : await refreshSavingsGoalProgress(params.userId);

  await createAIAnalysisLog({
    userId: params.userId,
    messageId: params.messageId,
    analysisType: AnalysisType.EXTRACTION,
    payload: params.analysisPayload ?? params.extraction
  });

  const amountNumber = Number(transaction.amount);
  const alertText =
    transaction.type === "EXPENSE"
      ? await checkBudgetAlert(params.userId, transaction.category, transaction.occurredAt)
      : null;
  const goalProgressText = await buildSavingsProgressUpdateText({
    userId: params.userId,
    goalStatus
  });
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
      merchant: transaction.merchant
    }),
    categoryOverrideText,
    alertText,
    anomalyText,
    goalProgressText
  ]
    .filter(Boolean)
    .join("\n");

  return ok({ replyText });
};
