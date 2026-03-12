import type { GeminiExtraction } from "@finance/shared";
import { AnalysisType } from "@prisma/client";
import { HELP_TEXT } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { createAIAnalysisLog } from "@/lib/services/ai/ai-log-service";
import {
  canonicalizeSupportedFinanceMessage,
  extractIntentAndTransaction,
  isGeminiRateLimitError
} from "@/lib/services/ai/ai-service";
import { extractForcedCategory } from "@/lib/services/transactions/category-override-service";
import { parseFallbackTransactionExtraction } from "@/lib/services/transactions/fallback-transaction-parser";
import { tryHandleGeneralChat } from "@/lib/services/assistant/general-chat-service";
import { generateUserFinancialAdvice } from "@/lib/services/assistant/advice-service";
import {
  loadRecentConversationTurns,
  resolveConversationMemory
} from "@/lib/services/assistant/conversation-memory-service";
import { routeGlobalTextContext } from "@/lib/services/assistant/global-context-router-service";
import { recordIntentObservation } from "@/lib/services/observability/observability-service";
import { getSavingsGoalStatus } from "@/lib/services/planning/goal-service";
import { generateUserInsight } from "@/lib/services/reporting/insight-service";
import { parseReportPeriod } from "@/lib/services/reporting/report-service";
import { createTransactionFromExtraction, isTransactionExtractable } from "@/lib/services/transactions/transaction-service";
import { saveTransactionAndBuildReply } from "./transaction-reply";
import { buildReportResponse, toReportReplyBody } from "./report";
import { tryHandleStructuredText } from "./structured-text-handler";
import { ok, type InboundHandlerResult } from "./result";
import type { MessageContext } from "./types";

type HandleTextMessageInput = MessageContext & {
  text: string | undefined;
};

export const handleTextMessage = async (
  params: HandleTextMessageInput
): Promise<InboundHandlerResult> => {
  const textInput = params.text ?? "";
  const rawRoute = routeGlobalTextContext(textInput);
  const memoryResolution = await resolveConversationMemory({
    userId: params.userId,
    currentMessageId: params.messageId,
    text: textInput
  });

  if (memoryResolution.kind === "reply") {
    await recordIntentObservation({
      userId: params.userId,
      messageId: params.messageId,
      rawText: textInput,
      effectiveText: textInput,
      commandKind: rawRoute.command.kind,
      topModule: rawRoute.moduleOrder[0] ?? null,
      moduleOrder: rawRoute.moduleOrder,
      resolutionKind: memoryResolution.kind,
      resolutionSource: memoryResolution.source,
      handledBy: "clarification_reply",
      fallbackStage: "conversation_memory_reply",
      ambiguityFlag: true
    });
    await createAIAnalysisLog({
      userId: params.userId,
      messageId: params.messageId,
      analysisType: AnalysisType.INSIGHT,
      payload: { source: "conversation_memory_reply", replyText: memoryResolution.replyText }
    });
    return ok({ replyText: memoryResolution.replyText });
  }

  const effectiveText =
    memoryResolution.kind === "rewrite" ? memoryResolution.effectiveText : textInput;
  const effectiveRoute = routeGlobalTextContext(effectiveText);
  const initialModuleOrder = effectiveRoute.moduleOrder;
  const observeAndReturn = async (
    result: InboundHandlerResult,
    overrides: Partial<{
      effectiveText: string;
      commandKind: string;
      topModule: string | null;
      moduleOrder: string[];
      semanticNormalizedText: string | null;
      handledBy: string;
      fallbackStage: string | null;
      ambiguityFlag: boolean;
    }>
  ) => {
    await recordIntentObservation({
      userId: params.userId,
      messageId: params.messageId,
      rawText: textInput,
      effectiveText: overrides.effectiveText ?? effectiveText,
      commandKind: overrides.commandKind ?? effectiveRoute.command.kind,
      topModule: overrides.topModule ?? effectiveRoute.moduleOrder[0] ?? null,
      moduleOrder: overrides.moduleOrder ?? effectiveRoute.moduleOrder,
      resolutionKind: memoryResolution.kind === "rewrite" ? "rewrite" : "none",
      resolutionSource: memoryResolution.kind === "rewrite" ? memoryResolution.source : null,
      semanticNormalizedText: overrides.semanticNormalizedText ?? null,
      handledBy: overrides.handledBy ?? "unknown",
      fallbackStage: overrides.fallbackStage ?? null,
      ambiguityFlag: overrides.ambiguityFlag ?? false
    });
    return result;
  };
  const structuredResult = await tryHandleStructuredText({
    userId: params.userId,
    messageId: params.messageId,
    text: effectiveText
  });
  if (structuredResult) {
    return observeAndReturn(structuredResult, {
      handledBy:
        effectiveRoute.command.kind !== "NONE"
          ? `structured:${effectiveRoute.command.kind}`
          : `structured:${effectiveRoute.moduleOrder[0] ?? "module"}`
    });
  }

  try {
    const recentTurns = await loadRecentConversationTurns({
      userId: params.userId,
      currentMessageId: params.messageId,
      limit: 6
    });
    const normalizedText = await canonicalizeSupportedFinanceMessage({
      userMessage: effectiveText,
      recentMessages: recentTurns.map((turn) => `${turn.role}: ${turn.text}`)
    });
    if (normalizedText && normalizedText.toLowerCase() !== effectiveText.toLowerCase()) {
      const normalizedResult = await tryHandleStructuredText({
        userId: params.userId,
        messageId: params.messageId,
        text: normalizedText
      });
      if (normalizedResult) {
        await createAIAnalysisLog({
          userId: params.userId,
          messageId: params.messageId,
          analysisType: AnalysisType.INTENT,
          payload: {
            source: "semantic_command_normalizer",
            originalText: effectiveText,
            normalizedText
          }
        });
        const normalizedRoute = routeGlobalTextContext(normalizedText);
        return observeAndReturn(normalizedResult, {
          commandKind: normalizedRoute.command.kind,
          topModule: normalizedRoute.moduleOrder[0] ?? null,
          moduleOrder: normalizedRoute.moduleOrder,
          semanticNormalizedText: normalizedText,
          handledBy:
            normalizedRoute.command.kind !== "NONE"
              ? `semantic:${normalizedRoute.command.kind}`
              : `semantic:${normalizedRoute.moduleOrder[0] ?? "module"}`
        });
      }
    }
  } catch (error) {
    logger.warn({ err: error }, "Semantic command normalization failed");
  }

  const quickGeneralChat = await tryHandleGeneralChat({
    userId: params.userId,
    text: effectiveText,
    mode: "quick"
  });
  if (quickGeneralChat.handled) {
    await createAIAnalysisLog({
      userId: params.userId,
      messageId: params.messageId,
      analysisType: AnalysisType.INSIGHT,
      payload: { source: "general_chat_quick", replyText: quickGeneralChat.replyText }
    });
    return observeAndReturn(ok({ replyText: quickGeneralChat.replyText }), {
      handledBy: "general_chat_quick",
      fallbackStage: "quick_general_chat"
    });
  }

  const { cleanedText, forcedCategory } = extractForcedCategory(effectiveText);
  const transactionInput = cleanedText || effectiveText;

  let extraction: Awaited<ReturnType<typeof extractIntentAndTransaction>>;
  try {
    extraction = await extractIntentAndTransaction(transactionInput);
  } catch (error) {
    logger.error({ err: error }, "Intent extraction failed");
    const fallbackExtraction = parseFallbackTransactionExtraction(transactionInput);
    if (fallbackExtraction) {
      const extractionWithCategory = forcedCategory
        ? { ...fallbackExtraction, category: forcedCategory }
        : fallbackExtraction;
      return saveTransactionAndBuildReply({
        userId: params.userId,
        messageId: params.messageId,
        extraction: extractionWithCategory,
        rawText: textInput,
        analysisPayload: { source: "fallback_after_ai_error", fallbackExtraction: extractionWithCategory },
        forcedCategory
      }).then((result) =>
        observeAndReturn(result, {
          handledBy: "transaction_recorded",
          fallbackStage: "fallback_after_ai_error"
        })
      );
    }

    if (initialModuleOrder[0] !== "TRANSACTION") {
      const generalChat = await tryHandleGeneralChat({
        userId: params.userId,
        text: effectiveText,
        mode: "full"
      });
      if (generalChat.handled) {
        await createAIAnalysisLog({
          userId: params.userId,
          messageId: params.messageId,
          analysisType: AnalysisType.INSIGHT,
          payload: { source: "general_chat_after_intent_error", replyText: generalChat.replyText }
        });
        return observeAndReturn(ok({ replyText: generalChat.replyText }), {
          handledBy: "general_chat_full",
          fallbackStage: "general_chat_after_intent_error"
        });
      }
    }

    if (isGeminiRateLimitError(error)) {
      return observeAndReturn(ok({
        replyText:
          "Layanan AI sedang penuh sementara. Coba lagi 1-2 menit lagi atau gunakan format langsung seperti `makan 45000`."
      }), {
        handledBy: "rate_limit_reply",
        fallbackStage: "gemini_rate_limit"
      });
    }

    return observeAndReturn(ok({
      replyText:
        "Layanan analisis AI sedang gangguan sementara. Coba lagi sebentar atau catat transaksi dengan format sederhana seperti `makan 45000`."
    }), {
      handledBy: "ai_error_reply",
      fallbackStage: "intent_extraction_error"
    });
  }

  await createAIAnalysisLog({
    userId: params.userId,
    messageId: params.messageId,
    analysisType: AnalysisType.INTENT,
    payload: extraction
  });

  if (extraction.intent === "HELP") {
    return observeAndReturn(ok({ replyText: HELP_TEXT }), {
      handledBy: "ai_intent_help"
    });
  }

  if (extraction.intent === "REQUEST_REPORT") {
    const period = parseReportPeriod(extraction.reportPeriod ?? undefined);
    const report = await buildReportResponse(params.userId, { period });
    return observeAndReturn(ok(toReportReplyBody(report)), {
      handledBy: "ai_intent_report"
    });
  }

  if (extraction.intent === "REQUEST_INSIGHT") {
    const insightText = await generateUserInsight(params.userId);
    await createAIAnalysisLog({
      userId: params.userId,
      messageId: params.messageId,
      analysisType: AnalysisType.INSIGHT,
      payload: { insightText, source: "intent" }
    });
    return observeAndReturn(ok({ replyText: insightText }), {
      handledBy: "ai_intent_insight"
    });
  }

  if (extraction.intent === "REQUEST_FINANCIAL_ADVICE") {
    const userQuestion = extraction.adviceQuery ?? effectiveText;
    const insightText = await generateUserFinancialAdvice(params.userId, userQuestion);
    await createAIAnalysisLog({
      userId: params.userId,
      messageId: params.messageId,
      analysisType: AnalysisType.INSIGHT,
      payload: { insightText, source: "intent_advice", userQuestion }
    });
    return observeAndReturn(ok({ replyText: insightText }), {
      handledBy: "ai_intent_advice"
    });
  }

  if (extraction.intent === "UNKNOWN") {
    const fallbackExtraction = parseFallbackTransactionExtraction(transactionInput);
    if (fallbackExtraction) {
      const fallbackWithCategory = forcedCategory
        ? { ...fallbackExtraction, category: forcedCategory }
        : fallbackExtraction;

      return saveTransactionAndBuildReply({
        userId: params.userId,
        messageId: params.messageId,
        extraction: fallbackWithCategory,
        rawText: textInput,
        analysisPayload: {
          source: "fallback_after_unknown_intent",
          fallbackExtraction: fallbackWithCategory
        },
        forcedCategory
      }).then((result) =>
        observeAndReturn(result, {
          handledBy: "transaction_recorded",
          fallbackStage: "fallback_after_unknown_intent"
        })
      );
    }

    const generalChat = await tryHandleGeneralChat({
      userId: params.userId,
      text: effectiveText,
      mode: "full"
    });
    if (generalChat.handled) {
      await createAIAnalysisLog({
        userId: params.userId,
        messageId: params.messageId,
        analysisType: AnalysisType.INSIGHT,
        payload: { source: "general_chat_after_unknown_intent", replyText: generalChat.replyText }
      });
      return observeAndReturn(ok({ replyText: generalChat.replyText }), {
        handledBy: "general_chat_full",
        fallbackStage: "general_chat_after_unknown_intent"
      });
    }
  }

  const extractionWithCategory =
    forcedCategory && extraction.intent === "RECORD_TRANSACTION"
      ? { ...extraction, category: forcedCategory }
      : extraction;

  if (!isTransactionExtractable(extractionWithCategory)) {
    const fallbackExtraction = parseFallbackTransactionExtraction(transactionInput);
    if (!fallbackExtraction) {
      const generalChat = await tryHandleGeneralChat({
        userId: params.userId,
        text: effectiveText,
        mode: "full"
      });
      if (generalChat.handled) {
        await createAIAnalysisLog({
          userId: params.userId,
          messageId: params.messageId,
          analysisType: AnalysisType.INSIGHT,
          payload: { source: "general_chat_after_unextractable", replyText: generalChat.replyText }
        });
        return observeAndReturn(ok({ replyText: generalChat.replyText }), {
          handledBy: "general_chat_full",
          fallbackStage: "general_chat_after_unextractable"
        });
      }

      return observeAndReturn(ok({
        replyText: "Saya belum cukup paham konteksnya, jadi saya belum mau jawab ngawur. Kalau maksudnya transaksi, coba tulis contoh seperti `makan siang 45000` atau `gaji masuk 5 juta`."
      }), {
        handledBy: "safe_unknown_reply",
        fallbackStage: "non_transaction_unextractable",
        ambiguityFlag: true
      });
    }

    const fallbackWithCategory = forcedCategory
      ? { ...fallbackExtraction, category: forcedCategory }
      : fallbackExtraction;

    return saveTransactionAndBuildReply({
      userId: params.userId,
      messageId: params.messageId,
      extraction: fallbackWithCategory,
      rawText: textInput,
      analysisPayload: {
        source: "fallback_after_non_transaction_intent",
        aiIntent: extraction.intent,
        fallbackExtraction: fallbackWithCategory
      },
      forcedCategory
    }).then((result) =>
      observeAndReturn(result, {
        handledBy: "transaction_recorded",
        fallbackStage: "fallback_after_non_transaction_intent"
      })
    );
  }

  return saveTransactionAndBuildReply({
    userId: params.userId,
    messageId: params.messageId,
    extraction: extractionWithCategory,
    rawText: textInput,
    forcedCategory
  }).then((result) =>
    observeAndReturn(result, {
      handledBy: "transaction_recorded"
    })
  );
};
