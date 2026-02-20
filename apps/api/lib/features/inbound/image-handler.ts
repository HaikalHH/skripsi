import { AnalysisType, TransactionSource } from "@prisma/client";
import { logger } from "@/lib/logger";
import { createAIAnalysisLog } from "@/lib/services/ai-log-service";
import { checkBudgetAlert } from "@/lib/services/budget-service";
import { refreshSavingsGoalProgress } from "@/lib/services/goal-service";
import { extractIntentAndTransaction } from "@/lib/services/ai-service";
import { extractTextFromImage } from "@/lib/services/ocr-service";
import { createTransactionFromExtraction, isTransactionExtractable } from "@/lib/services/transaction-service";
import { confirmTransactionText } from "./formatters";
import { badRequest, ok, type InboundHandlerResult } from "./result";
import type { MessageContext } from "./types";

type HandleImageMessageInput = MessageContext & {
  caption: string | undefined;
  imageBase64: string | undefined;
};

export const handleImageMessage = async (
  params: HandleImageMessageInput
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
        "Gagal membaca teks dari gambar saat ini. Silakan kirim foto yang lebih jelas atau catat via teks."
    });
  }

  const combinedInput = [params.caption, ocrText].filter(Boolean).join("\n");
  const extraction = await extractIntentAndTransaction(combinedInput);
  await createAIAnalysisLog({
    userId: params.userId,
    messageId: params.messageId,
    analysisType: AnalysisType.EXTRACTION,
    payload: { extraction, ocrText }
  });

  if (!isTransactionExtractable(extraction)) {
    return ok({
      replyText:
        "Teks receipt berhasil terbaca, tapi detail transaksi belum lengkap. Coba tambahkan caption seperti `expense makan 45000`."
    });
  }

  const transaction = await createTransactionFromExtraction({
    userId: params.userId,
    extraction,
    source: TransactionSource.OCR,
    rawText: ocrText
  });
  await refreshSavingsGoalProgress(params.userId);

  const alertText = await checkBudgetAlert(params.userId, transaction.category, transaction.occurredAt);
  const replyText = [
    confirmTransactionText({
      type: transaction.type,
      amount: Number(transaction.amount),
      category: transaction.category,
      occurredAt: transaction.occurredAt,
      merchant: transaction.merchant
    }),
    alertText
  ]
    .filter(Boolean)
    .join("\n");

  return ok({ replyText });
};
