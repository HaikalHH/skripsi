import { AnalysisType } from "@prisma/client";
import { logger } from "@/lib/logger";
import { createAIAnalysisLog } from "@/lib/services/ai/ai-log-service";
import { extractForcedCategory } from "@/lib/services/transactions/category-override-service";
import {
  extractIntentAndTransaction,
  isGeminiRateLimitError,
} from "@/lib/services/ai/ai-service";
import { extractTextFromImage } from "@/lib/services/ai/ocr-service";
import { isTransactionExtractable } from "@/lib/services/transactions/transaction-service";
import { saveTransactionAndBuildReply } from "./transaction-reply";
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

  return saveTransactionAndBuildReply({
    userId: params.userId,
    messageId: params.messageId,
    extraction: normalizedExtraction,
    rawText: ocrText,
    analysisPayload: { source: "image_handler", extraction: normalizedExtraction, ocrText },
    forcedCategory
  });
};
