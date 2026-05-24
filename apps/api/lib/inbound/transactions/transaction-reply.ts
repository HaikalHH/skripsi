import type { GeminiExtraction } from "@finance/shared";
import { AnalysisType, TransactionSource } from "@prisma/client";
import { createAIAnalysisLog } from "@/lib/services/ai/analysis-logs";
import { checkBudgetAlert } from "@/lib/services/transactions/budget";
import { buildSavingsProgressUpdateText } from "@/lib/services/planning/savings-progress";
import { checkUnusualExpenseAlert } from "@/lib/services/transactions/spending-anomaly";
import { syncSavingTransactionGoalProgress } from "@/lib/services/planning/saving-transaction";
import { createTransactionFromExtraction } from "@/lib/services/transactions/transaction";
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
    transaction.type === "EXPENSE"
      ? await checkBudgetAlert(params.userId, transaction.category, transaction.occurredAt)
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
