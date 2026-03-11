import type { GeminiExtraction } from "@finance/shared";
import { AnalysisType, TransactionSource } from "@prisma/client";
import { HELP_TEXT } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { createAIAnalysisLog } from "@/lib/services/ai-log-service";
import {
  canonicalizeSupportedFinanceMessage,
  extractIntentAndTransaction,
  isGeminiRateLimitError
} from "@/lib/services/ai-service";
import { checkBudgetAlert, upsertCategoryBudget } from "@/lib/services/budget-service";
import { buildCashflowForecastReply } from "@/lib/services/cashflow-forecast-service";
import { extractForcedCategory } from "@/lib/services/category-override-service";
import { tryHandleFinancialFreedomCommand } from "@/lib/services/financial-freedom-service";
import { tryHandleFinanceNewsCommand } from "@/lib/services/finance-news-service";
import { parseFallbackTransactionExtraction } from "@/lib/services/fallback-transaction-parser";
import { tryHandleGeneralChat } from "@/lib/services/general-chat-service";
import {
  ALL_GLOBAL_CONTEXT_MODULES,
  routeGlobalTextContext,
  type GlobalContextModule
} from "@/lib/services/global-context-router-service";
import { tryHandleMarketCommand } from "@/lib/services/market-command-service";
import { tryHandlePortfolioCommand } from "@/lib/services/portfolio-command-service";
import { tryHandlePrivacyCommand } from "@/lib/services/privacy-command-service";
import { buildSavingsProgressUpdateText } from "@/lib/services/savings-progress-service";
import { tryHandleSmartAllocation } from "@/lib/services/smart-allocation-service";
import { checkUnusualExpenseAlert } from "@/lib/services/spending-anomaly-service";
import { tryHandleTransactionMutationCommand } from "@/lib/services/transaction-mutation-command-service";
import { tryHandleWealthProjection } from "@/lib/services/wealth-projection-service";
import { generateUserFinancialAdvice } from "@/lib/services/advice-service";
import {
  loadRecentConversationTurns,
  resolveConversationMemory
} from "@/lib/services/conversation-memory-service";
import { getSavingsGoalStatus, refreshSavingsGoalProgress, setSavingsGoalTarget } from "@/lib/services/goal-service";
import { generateUserInsight } from "@/lib/services/insight-service";
import {
  buildCategoryDetailReport,
  buildGeneralAnalyticsReport,
  parseReportPeriod
} from "@/lib/services/report-service";
import { createTransactionFromExtraction, isTransactionExtractable } from "@/lib/services/transaction-service";
import { buildBudgetSetText, buildGoalStatusText, confirmTransactionText } from "./formatters";
import { buildReportResponse, toReportReplyBody } from "./report";
import { ok, type InboundHandlerResult } from "./result";
import type { MessageContext } from "./types";

type HandleTextMessageInput = MessageContext & {
  text: string | undefined;
};

const saveTransactionAndBuildReply = async (params: {
  userId: string;
  messageId: string;
  extraction: GeminiExtraction;
  rawText: string;
  analysisPayload?: unknown;
  forcedCategory?: string | null;
}) => {
  const transaction = await createTransactionFromExtraction({
    userId: params.userId,
    extraction: params.extraction,
    source: TransactionSource.TEXT,
    rawText: params.rawText
  });
  const goalStatus = await refreshSavingsGoalProgress(params.userId);

  await createAIAnalysisLog({
    userId: params.userId,
    messageId: params.messageId,
    analysisType: AnalysisType.EXTRACTION,
    payload: params.analysisPayload ?? params.extraction
  });

  const amountNumber = Number(transaction.amount);
  const alertText = await checkBudgetAlert(params.userId, transaction.category, transaction.occurredAt);
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

const tryHandleStructuredText = async (params: {
  userId: string;
  messageId: string;
  text: string;
}): Promise<InboundHandlerResult | null> => {
  const routedContext = routeGlobalTextContext(params.text);

  if (routedContext.command.kind === "HELP") {
    return ok({ replyText: HELP_TEXT });
  }

  if (routedContext.command.kind === "REPORT") {
    const report = await buildReportResponse(params.userId, routedContext.command.period);
    return ok(toReportReplyBody(report));
  }

  if (routedContext.command.kind === "CATEGORY_DETAIL_REPORT") {
    const replyText = await buildCategoryDetailReport({
      userId: params.userId,
      period: routedContext.command.period,
      category: routedContext.command.category,
      filterText: routedContext.command.filterText,
      mode: routedContext.command.mode,
      limit: routedContext.command.limit,
      rangeWindow: routedContext.command.rangeWindow
    });
    return ok({ replyText });
  }

  if (routedContext.command.kind === "GENERAL_ANALYTICS_REPORT") {
    const replyText = await buildGeneralAnalyticsReport({
      userId: params.userId,
      mode: routedContext.command.mode,
      period: routedContext.command.period,
      limit: routedContext.command.limit,
      rangeWindow: routedContext.command.rangeWindow
    });
    return ok({ replyText });
  }

  if (routedContext.command.kind === "CASHFLOW_FORECAST") {
    const replyText = await buildCashflowForecastReply({
      userId: params.userId,
      query: {
        horizon: routedContext.command.horizon,
        mode: routedContext.command.mode
      }
    });
    return ok({ replyText });
  }

  if (routedContext.command.kind === "INSIGHT") {
    const insightText = await generateUserInsight(params.userId);
    await createAIAnalysisLog({
      userId: params.userId,
      messageId: params.messageId,
      analysisType: AnalysisType.INSIGHT,
      payload: { insightText, source: "command" }
    });
    return ok({ replyText: insightText });
  }

  if (routedContext.command.kind === "ADVICE") {
    const userQuestion =
      routedContext.command.question ??
      "Keuangan aku sehat gak? Kasih saran yang paling penting bulan ini.";
    const insightText = await generateUserFinancialAdvice(params.userId, userQuestion);
    await createAIAnalysisLog({
      userId: params.userId,
      messageId: params.messageId,
      analysisType: AnalysisType.INSIGHT,
      payload: { insightText, source: "command_advice", userQuestion }
    });
    return ok({ replyText: insightText });
  }

  if (routedContext.command.kind === "BUDGET_SET") {
    const budget = await upsertCategoryBudget({
      userId: params.userId,
      category: routedContext.command.category,
      monthlyLimit: routedContext.command.monthlyLimit
    });
    return ok({ replyText: buildBudgetSetText(budget) });
  }

  if (routedContext.command.kind === "GOAL_SET") {
    const goalStatus = await setSavingsGoalTarget(params.userId, routedContext.command.targetAmount);
    return ok({ replyText: buildGoalStatusText(goalStatus) });
  }

  if (routedContext.command.kind === "GOAL_STATUS") {
    const goalStatus = await getSavingsGoalStatus(params.userId);
    return ok({ replyText: buildGoalStatusText(goalStatus) });
  }

  const triedModules = new Set<GlobalContextModule>();
  const modulesToTry = [
    ...routedContext.moduleOrder,
    ...ALL_GLOBAL_CONTEXT_MODULES.filter((module) => !routedContext.moduleOrder.includes(module))
  ];

  for (const module of modulesToTry) {
    if (triedModules.has(module)) continue;
    triedModules.add(module);

    if (module === "TRANSACTION") {
      continue;
    }

    if (module === "TRANSACTION_MUTATION") {
      const transactionMutation = await tryHandleTransactionMutationCommand({
        userId: params.userId,
        text: params.text
      });
      if (transactionMutation.handled) {
        return ok({ replyText: transactionMutation.replyText });
      }
      continue;
    }

    if (module === "PORTFOLIO") {
      const portfolioCommand = await tryHandlePortfolioCommand({
        userId: params.userId,
        text: params.text
      });
      if (portfolioCommand.handled) {
        return ok({ replyText: portfolioCommand.replyText });
      }
      continue;
    }

    if (module === "MARKET") {
      const marketCommand = await tryHandleMarketCommand(params.text);
      if (marketCommand.handled) {
        return ok({ replyText: marketCommand.replyText });
      }
      continue;
    }

    if (module === "NEWS") {
      try {
        const newsCommand = await tryHandleFinanceNewsCommand({
          userId: params.userId,
          text: params.text
        });
        if (newsCommand.handled) {
          return ok({ replyText: newsCommand.replyText });
        }
      } catch (error) {
        logger.warn({ err: error }, "Finance news retrieval failed");
        return ok({
          replyText: "Berita finance belum tersedia sementara. Coba lagi beberapa menit lagi."
        });
      }
      continue;
    }

    if (module === "SMART_ALLOCATION") {
      const allocationCommand = await tryHandleSmartAllocation({
        userId: params.userId,
        text: params.text
      });
      if (allocationCommand.handled) {
        return ok({ replyText: allocationCommand.replyText });
      }
      continue;
    }

    if (module === "FINANCIAL_FREEDOM") {
      const freedomCommand = await tryHandleFinancialFreedomCommand({
        userId: params.userId,
        text: params.text
      });
      if (freedomCommand.handled) {
        return ok({ replyText: freedomCommand.replyText });
      }
      continue;
    }

    if (module === "WEALTH_PROJECTION") {
      const projectionCommand = tryHandleWealthProjection(params.text);
      if (projectionCommand.handled) {
        return ok({ replyText: projectionCommand.replyText });
      }
      continue;
    }

    if (module === "PRIVACY") {
      const privacyCommand = await tryHandlePrivacyCommand(params.userId, params.text);
      if (privacyCommand.handled) {
        return ok({ replyText: privacyCommand.replyText });
      }
    }
  }

  return null;
};

export const handleTextMessage = async (
  params: HandleTextMessageInput
): Promise<InboundHandlerResult> => {
  const textInput = params.text ?? "";
  const memoryResolution = await resolveConversationMemory({
    userId: params.userId,
    currentMessageId: params.messageId,
    text: textInput
  });

  if (memoryResolution.kind === "reply") {
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
  const initialModuleOrder = routeGlobalTextContext(effectiveText).moduleOrder;
  const structuredResult = await tryHandleStructuredText({
    userId: params.userId,
    messageId: params.messageId,
    text: effectiveText
  });
  if (structuredResult) {
    return structuredResult;
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
        return normalizedResult;
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
    return ok({ replyText: quickGeneralChat.replyText });
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
      });
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
        return ok({ replyText: generalChat.replyText });
      }
    }

    if (isGeminiRateLimitError(error)) {
      return ok({
        replyText:
          "Layanan AI sedang penuh sementara. Coba lagi 1-2 menit lagi atau gunakan format langsung seperti `makan 45000`."
      });
    }

    return ok({
      replyText:
        "Layanan analisis AI sedang gangguan sementara. Coba lagi sebentar atau catat transaksi dengan format sederhana seperti `makan 45000`."
    });
  }

  await createAIAnalysisLog({
    userId: params.userId,
    messageId: params.messageId,
    analysisType: AnalysisType.INTENT,
    payload: extraction
  });

  if (extraction.intent === "HELP") {
    return ok({ replyText: HELP_TEXT });
  }

  if (extraction.intent === "REQUEST_REPORT") {
    const period = parseReportPeriod(extraction.reportPeriod ?? undefined);
    const report = await buildReportResponse(params.userId, period);
    return ok(toReportReplyBody(report));
  }

  if (extraction.intent === "REQUEST_INSIGHT") {
    const insightText = await generateUserInsight(params.userId);
    await createAIAnalysisLog({
      userId: params.userId,
      messageId: params.messageId,
      analysisType: AnalysisType.INSIGHT,
      payload: { insightText, source: "intent" }
    });
    return ok({ replyText: insightText });
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
    return ok({ replyText: insightText });
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
      });
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
      return ok({ replyText: generalChat.replyText });
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
        return ok({ replyText: generalChat.replyText });
      }

      return ok({
        replyText: "Saya belum cukup paham konteksnya, jadi saya belum mau jawab ngawur. Kalau maksudnya transaksi, coba tulis contoh seperti `makan siang 45000` atau `gaji masuk 5 juta`."
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
    });
  }

  return saveTransactionAndBuildReply({
    userId: params.userId,
    messageId: params.messageId,
    extraction: extractionWithCategory,
    rawText: textInput,
    forcedCategory
  });
};
