import { AnalysisType, TransactionSource } from "@prisma/client";
import { HELP_TEXT } from "@/lib/constants";
import { createAIAnalysisLog } from "@/lib/services/ai-log-service";
import { extractIntentAndTransaction } from "@/lib/services/ai-service";
import { checkBudgetAlert, upsertCategoryBudget } from "@/lib/services/budget-service";
import { parseCommand } from "@/lib/services/command-service";
import { generateUserFinancialAdvice } from "@/lib/services/advice-service";
import { getSavingsGoalStatus, refreshSavingsGoalProgress, setSavingsGoalTarget } from "@/lib/services/goal-service";
import { generateUserInsight } from "@/lib/services/insight-service";
import { parseReportPeriod } from "@/lib/services/report-service";
import { createTransactionFromExtraction, isTransactionExtractable } from "@/lib/services/transaction-service";
import { buildBudgetSetText, buildGoalStatusText, confirmTransactionText } from "./formatters";
import { buildReportResponse, toReportReplyBody } from "./report";
import { ok, type InboundHandlerResult } from "./result";
import type { MessageContext } from "./types";

type HandleTextMessageInput = MessageContext & {
  text: string | undefined;
};

export const handleTextMessage = async (
  params: HandleTextMessageInput
): Promise<InboundHandlerResult> => {
  const command = parseCommand(params.text);
  if (command.kind === "HELP") {
    return ok({ replyText: HELP_TEXT });
  }

  if (command.kind === "REPORT") {
    const report = await buildReportResponse(params.userId, command.period);
    return ok(toReportReplyBody(report));
  }

  if (command.kind === "INSIGHT") {
    const insightText = await generateUserInsight(params.userId);
    await createAIAnalysisLog({
      userId: params.userId,
      messageId: params.messageId,
      analysisType: AnalysisType.INSIGHT,
      payload: { insightText, source: "command" }
    });
    return ok({ replyText: insightText });
  }

  if (command.kind === "ADVICE") {
    const userQuestion =
      command.question ?? "Keuangan aku sehat gak? Kasih saran yang paling penting bulan ini.";
    const insightText = await generateUserFinancialAdvice(params.userId, userQuestion);
    await createAIAnalysisLog({
      userId: params.userId,
      messageId: params.messageId,
      analysisType: AnalysisType.INSIGHT,
      payload: { insightText, source: "command_advice", userQuestion }
    });
    return ok({ replyText: insightText });
  }

  if (command.kind === "BUDGET_SET") {
    const budget = await upsertCategoryBudget({
      userId: params.userId,
      category: command.category,
      monthlyLimit: command.monthlyLimit
    });
    return ok({ replyText: buildBudgetSetText(budget) });
  }

  if (command.kind === "GOAL_SET") {
    const goalStatus = await setSavingsGoalTarget(params.userId, command.targetAmount);
    return ok({ replyText: buildGoalStatusText(goalStatus) });
  }

  if (command.kind === "GOAL_STATUS") {
    const goalStatus = await getSavingsGoalStatus(params.userId);
    return ok({ replyText: buildGoalStatusText(goalStatus) });
  }

  const textInput = params.text ?? "";
  const extraction = await extractIntentAndTransaction(textInput);
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
    const userQuestion = extraction.adviceQuery ?? textInput;
    const insightText = await generateUserFinancialAdvice(params.userId, userQuestion);
    await createAIAnalysisLog({
      userId: params.userId,
      messageId: params.messageId,
      analysisType: AnalysisType.INSIGHT,
      payload: { insightText, source: "intent_advice", userQuestion }
    });
    return ok({ replyText: insightText });
  }

  if (!isTransactionExtractable(extraction)) {
    return ok({
      replyText: "Saya belum bisa membaca detail transaksi. Contoh: `makan siang 45000`."
    });
  }

  const transaction = await createTransactionFromExtraction({
    userId: params.userId,
    extraction,
    source: TransactionSource.TEXT,
    rawText: textInput
  });
  await refreshSavingsGoalProgress(params.userId);

  await createAIAnalysisLog({
    userId: params.userId,
    messageId: params.messageId,
    analysisType: AnalysisType.EXTRACTION,
    payload: extraction
  });

  const amountNumber = Number(transaction.amount);
  const alertText = await checkBudgetAlert(params.userId, transaction.category, transaction.occurredAt);
  const replyText = [
    confirmTransactionText({
      type: transaction.type,
      amount: amountNumber,
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
