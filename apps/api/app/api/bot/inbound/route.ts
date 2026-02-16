import { inboundMessageSchema } from "@finance/shared";
import { AnalysisType, MessageType, TransactionSource } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { HELP_TEXT } from "@/lib/constants";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAIAnalysisLog } from "@/lib/services/ai-log-service";
import { extractIntentAndTransaction } from "@/lib/services/ai-service";
import { checkBudgetAlert, upsertCategoryBudget } from "@/lib/services/budget-service";
import { parseCommand } from "@/lib/services/command-service";
import { getSavingsGoalStatus, refreshSavingsGoalProgress, setSavingsGoalTarget } from "@/lib/services/goal-service";
import { generateUserInsight } from "@/lib/services/insight-service";
import { createMessageLog } from "@/lib/services/message-service";
import { buildSubscriptionRequiredText, handleOnboarding } from "@/lib/services/onboarding-service";
import { extractTextFromImage } from "@/lib/services/ocr-service";
import {
  buildReportText,
  getReportChartBase64,
  getUserReportData,
  parseReportPeriod
} from "@/lib/services/report-service";
import { hasUsableSubscription } from "@/lib/services/subscription-service";
import { createTransactionFromExtraction, isTransactionExtractable } from "@/lib/services/transaction-service";
import { findOrCreateUserByWaNumber } from "@/lib/services/user-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_TEXT =
  "Maaf, saya belum bisa memproses pesan Anda sekarang. Coba lagi beberapa saat lagi atau ketik /help.";

const confirmTransactionText = (params: {
  type: "INCOME" | "EXPENSE";
  amount: number;
  category: string;
  occurredAt: Date;
  merchant?: string | null;
}) =>
  [
    "Transaksi berhasil dicatat:",
    `- Tipe: ${params.type}`,
    `- Amount: ${params.amount.toFixed(2)}`,
    `- Category: ${params.category}`,
    params.merchant ? `- Merchant: ${params.merchant}` : null,
    `- Tanggal: ${params.occurredAt.toISOString()}`
  ]
    .filter(Boolean)
    .join("\n");

const buildBudgetSetText = (params: {
  category: string;
  monthlyLimit: number;
  spentThisMonth: number;
  remainingThisMonth: number;
}) =>
  [
    "Budget kategori berhasil disimpan:",
    `- Category: ${params.category}`,
    `- Limit bulanan: ${params.monthlyLimit.toFixed(2)}`,
    `- Terpakai bulan ini: ${params.spentThisMonth.toFixed(2)}`,
    `- Sisa bulan ini: ${params.remainingThisMonth.toFixed(2)}`
  ].join("\n");

const buildGoalStatusText = (params: {
  targetAmount: number;
  currentProgress: number;
  remainingAmount: number;
  progressPercent: number;
}) => {
  if (params.targetAmount <= 0) {
    return "Target tabungan belum diset. Gunakan `/goal set <target>`.";
  }

  return [
    "Status goal tabungan:",
    `- Target: ${params.targetAmount.toFixed(2)}`,
    `- Progress: ${params.currentProgress.toFixed(2)}`,
    `- Remaining: ${params.remainingAmount.toFixed(2)}`,
    `- Progress: ${params.progressPercent.toFixed(1)}%`
  ].join("\n");
};

const buildReportResponse = async (userId: string, period: "daily" | "weekly" | "monthly") => {
  const reportData = await getUserReportData(userId, period);
  const summaryText = buildReportText(
    period,
    reportData.incomeTotal,
    reportData.expenseTotal,
    reportData.categoryBreakdown
  );

  if (reportData.incomeTotal === 0 && reportData.expenseTotal === 0) {
    return {
      replyText: `Belum ada transaksi untuk report ${period}.`,
      imageBase64: undefined as string | undefined
    };
  }

  try {
    const imageBase64 = await getReportChartBase64(reportData);
    return { replyText: summaryText, imageBase64 };
  } catch (error) {
    logger.error({ err: error }, "Failed to generate chart image");
    return { replyText: `${summaryText} (Chart unavailable sementara.)`, imageBase64: undefined };
  }
};

const parseSentAt = (raw: string | undefined) => {
  if (!raw) return new Date();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsedBody = inboundMessageSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { replyText: "Payload tidak valid.", issues: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const payload = parsedBody.data;
    const rateLimit = checkRateLimit(payload.waNumber, env.RATE_LIMIT_MAX, env.RATE_LIMIT_WINDOW_MS);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          replyText: `Terlalu banyak request. Coba lagi dalam ${Math.ceil(
            rateLimit.retryAfterMs / 1000
          )} detik.`
        },
        { status: 429 }
      );
    }

    const userResult = await findOrCreateUserByWaNumber(payload.waNumber);
    const user = userResult.user;
    const messageLog = await createMessageLog({
      userId: user.id,
      messageType: payload.messageType as MessageType,
      contentOrCaption:
        payload.messageType === "TEXT" ? payload.text ?? "" : payload.caption ?? "(image message)",
      mediaUrlOrLocalPath: payload.messageType === "IMAGE" ? "uploaded:base64" : undefined,
      sentAt: parseSentAt(payload.sentAt)
    });

    const onboardingResult = await handleOnboarding({
      user,
      isNew: userResult.isNew,
      messageType: payload.messageType,
      text: payload.messageType === "TEXT" ? payload.text : payload.caption
    });
    if (onboardingResult.handled) {
      return NextResponse.json({ replyText: onboardingResult.replyText });
    }

    const canUseSubscription = await hasUsableSubscription(user.id);
    if (!canUseSubscription) {
      const replyText = await buildSubscriptionRequiredText(user.id);
      return NextResponse.json({ replyText });
    }

    if (payload.messageType === "TEXT") {
      const command = parseCommand(payload.text);
      if (command.kind === "HELP") {
        return NextResponse.json({ replyText: HELP_TEXT });
      }

      if (command.kind === "REPORT") {
        const report = await buildReportResponse(user.id, command.period);
        return NextResponse.json({
          replyText: report.replyText,
          imageBase64: report.imageBase64,
          imageMimeType: report.imageBase64 ? "image/png" : undefined
        });
      }

      if (command.kind === "INSIGHT") {
        const insightText = await generateUserInsight(user.id);
        await createAIAnalysisLog({
          userId: user.id,
          messageId: messageLog.id,
          analysisType: AnalysisType.INSIGHT,
          payload: { insightText, source: "command" }
        });
        return NextResponse.json({ replyText: insightText });
      }

      if (command.kind === "BUDGET_SET") {
        const budget = await upsertCategoryBudget({
          userId: user.id,
          category: command.category,
          monthlyLimit: command.monthlyLimit
        });
        return NextResponse.json({ replyText: buildBudgetSetText(budget) });
      }

      if (command.kind === "GOAL_SET") {
        const goalStatus = await setSavingsGoalTarget(user.id, command.targetAmount);
        return NextResponse.json({ replyText: buildGoalStatusText(goalStatus) });
      }

      if (command.kind === "GOAL_STATUS") {
        const goalStatus = await getSavingsGoalStatus(user.id);
        return NextResponse.json({ replyText: buildGoalStatusText(goalStatus) });
      }

      const textInput = payload.text ?? "";
      const extraction = await extractIntentAndTransaction(textInput);
      await createAIAnalysisLog({
        userId: user.id,
        messageId: messageLog.id,
        analysisType: AnalysisType.INTENT,
        payload: extraction
      });

      if (extraction.intent === "HELP") {
        return NextResponse.json({ replyText: HELP_TEXT });
      }

      if (extraction.intent === "REQUEST_REPORT") {
        const period = parseReportPeriod(extraction.reportPeriod ?? undefined);
        const report = await buildReportResponse(user.id, period);
        return NextResponse.json({
          replyText: report.replyText,
          imageBase64: report.imageBase64,
          imageMimeType: report.imageBase64 ? "image/png" : undefined
        });
      }

      if (extraction.intent === "REQUEST_INSIGHT") {
        const insightText = await generateUserInsight(user.id);
        await createAIAnalysisLog({
          userId: user.id,
          messageId: messageLog.id,
          analysisType: AnalysisType.INSIGHT,
          payload: { insightText, source: "intent" }
        });
        return NextResponse.json({ replyText: insightText });
      }

      if (!isTransactionExtractable(extraction)) {
        return NextResponse.json({
          replyText: "Saya belum bisa membaca detail transaksi. Contoh: `makan siang 45000`."
        });
      }

      const transaction = await createTransactionFromExtraction({
        userId: user.id,
        extraction,
        source: TransactionSource.TEXT,
        rawText: textInput
      });
      await refreshSavingsGoalProgress(user.id);

      await createAIAnalysisLog({
        userId: user.id,
        messageId: messageLog.id,
        analysisType: AnalysisType.EXTRACTION,
        payload: extraction
      });

      const amountNumber = Number(transaction.amount);
      const alertText = await checkBudgetAlert(user.id, transaction.category, transaction.occurredAt);
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

      return NextResponse.json({ replyText });
    }

    if (!payload.imageBase64) {
      return NextResponse.json({ replyText: "Gambar tidak ditemukan di payload." }, { status: 400 });
    }

    let ocrText = "";
    try {
      ocrText = await extractTextFromImage(payload.imageBase64);
    } catch (error) {
      logger.error({ err: error }, "OCR failed");
      return NextResponse.json({
        replyText:
          "Gagal membaca teks dari gambar saat ini. Silakan kirim foto yang lebih jelas atau catat via teks."
      });
    }

    const combinedInput = [payload.caption, ocrText].filter(Boolean).join("\n");
    const extraction = await extractIntentAndTransaction(combinedInput);
    await createAIAnalysisLog({
      userId: user.id,
      messageId: messageLog.id,
      analysisType: AnalysisType.EXTRACTION,
      payload: { extraction, ocrText }
    });

    if (!isTransactionExtractable(extraction)) {
      return NextResponse.json({
        replyText:
          "Teks receipt berhasil terbaca, tapi detail transaksi belum lengkap. Coba tambahkan caption seperti `expense makan 45000`."
      });
    }

    const transaction = await createTransactionFromExtraction({
      userId: user.id,
      extraction,
      source: TransactionSource.OCR,
      rawText: ocrText
    });
    await refreshSavingsGoalProgress(user.id);

    const alertText = await checkBudgetAlert(user.id, transaction.category, transaction.occurredAt);
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

    return NextResponse.json({ replyText });
  } catch (error) {
    logger.error({ err: error }, "Inbound processing failed");
    return NextResponse.json({ replyText: FALLBACK_TEXT }, { status: 500 });
  }
}
