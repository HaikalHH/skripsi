import { AnalysisType, TransactionSource } from "@prisma/client";
import { logger } from "@/lib/logger";
import { createAIAnalysisLog } from "@/lib/services/ai/ai-log-service";
import { checkBudgetAlert } from "@/lib/services/transactions/budget-service";
import { extractForcedCategory } from "@/lib/services/transactions/category-override-service";
import { buildSavingsProgressUpdateText } from "@/lib/services/planning/savings-progress-service";
import { checkUnusualExpenseAlert } from "@/lib/services/transactions/spending-anomaly-service";
import { refreshSavingsGoalProgress } from "@/lib/services/planning/goal-service";
import {
  extractIntentAndTransaction,
  isGeminiRateLimitError,
} from "@/lib/services/ai/ai-service";
import { extractTextFromImage } from "@/lib/services/ai/ocr-service";
import {
  createTransactionFromExtraction,
  isTransactionExtractable,
} from "@/lib/services/transactions/transaction-service";
import { confirmTransactionText } from "./formatters";
import { badRequest, ok, type InboundHandlerResult } from "./result";
import type { MessageContext } from "./types";

type HandleImageMessageInput = MessageContext & {
  caption: string | undefined;
  imageBase64: string | undefined;
};

export const handleImageMessage = async (
  params: HandleImageMessageInput,
): Promise<InboundHandlerResult> => {
  if (!params.imageBase64) {
    return badRequest({ replyText: "Gambar tidak ditemukan di payload." });
  }

  let ocrText = "";
  try {
    ocrText = await extractTextFromImage(params.imageBase64);
  } catch (error) {
    logger.error({ err: error }, "OCR failed");
    return ok({
      replyText:
        "Gagal membaca teks dari gambar saat ini. Silakan kirim foto yang lebih jelas atau catat via teks.",
    });
  }

  const { cleanedText, forcedCategory } = extractForcedCategory(
    params.caption ?? "",
  );
  const combinedInput = [cleanedText, ocrText].filter(Boolean).join("\n");
  let extraction: Awaited<ReturnType<typeof extractIntentAndTransaction>>;
  try {
    extraction = await extractIntentAndTransaction(combinedInput);
  } catch (error) {
    logger.error({ err: error }, "Image extraction via Gemini failed");

    if (isGeminiRateLimitError(error)) {
      return ok({
        replyText:
          "OCR sudah membaca gambar, tapi layanan AI sedang penuh sementara. Coba lagi 1-2 menit lagi atau kirim catatan via teks.",
      });
    }

    return ok({
      replyText:
        "Teks gambar terbaca, tapi analisis AI sedang gangguan sementara. Coba lagi sebentar atau kirim transaksi via teks.",
    });
  }

  await createAIAnalysisLog({
    userId: params.userId,
    messageId: params.messageId,
    analysisType: AnalysisType.EXTRACTION,
    payload: { extraction, ocrText },
  });

  const normalizedExtraction =
    forcedCategory && extraction.intent === "RECORD_TRANSACTION"
      ? { ...extraction, category: forcedCategory }
      : extraction;

  if (!isTransactionExtractable(normalizedExtraction)) {
    return ok({
      replyText:
        "Teks receipt berhasil terbaca, tapi detail transaksi belum lengkap. Coba tambahkan caption seperti `expense makan 45000`.",
    });
  }

  const transaction = await createTransactionFromExtraction({
    userId: params.userId,
    extraction: normalizedExtraction,
    source: TransactionSource.OCR,
    rawText: ocrText,
  });
  const goalStatus = await refreshSavingsGoalProgress(params.userId);

  const alertText = await checkBudgetAlert(
    params.userId,
    transaction.category,
    transaction.occurredAt,
  );
  const goalProgressText = await buildSavingsProgressUpdateText({
    userId: params.userId,
    goalStatus,
  });
  const anomalyText =
    transaction.type === "EXPENSE"
      ? await checkUnusualExpenseAlert({
          userId: params.userId,
          amount: Number(transaction.amount),
          occurredAt: transaction.occurredAt,
        })
      : null;
  const categoryOverrideText =
    forcedCategory && transaction.category === forcedCategory
      ? `Kategori dipaksa sesuai input: ${forcedCategory}.`
      : null;
  const replyText = [
    confirmTransactionText({
      type: transaction.type,
      amount: Number(transaction.amount),
      category: transaction.category,
      occurredAt: transaction.occurredAt,
      merchant: transaction.merchant,
    }),
    categoryOverrideText,
    alertText,
    anomalyText,
    goalProgressText,
  ]
    .filter(Boolean)
    .join("\n");

  return ok({ replyText });
};
