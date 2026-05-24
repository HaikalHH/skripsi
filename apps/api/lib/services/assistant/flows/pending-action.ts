import type { GeminiExtraction } from "@finance/shared";
import { AnalysisType, FinancialGoalType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAIAnalysisLog } from "@/lib/services/ai/analysis-logs";
import { refreshSavingsGoalProgress } from "@/lib/services/planning/goal";
import {
  getMatchingCategoryBudget,
  normalizeBudgetCategoryName,
  upsertCategoryBudget
} from "@/lib/services/transactions/budget";
import {
  extractForcedCategory,
  normalizeExpenseBucketCategory
} from "@/lib/services/transactions/category";
import { parsePositiveAmount } from "@/lib/services/transactions/amount";
import { setSavingsGoalTarget } from "@/lib/services/planning/goal";
import { formatMoney } from "@/lib/services/shared/money";
import {
  buildBudgetSetText,
  buildGoalStatusReplyPayload,
  confirmTransactionText
} from "@/lib/inbound/formatting/formatters";
import { ok, type InboundHandlerResult } from "@/lib/inbound/shared/result";
import { saveTransactionAndBuildReply } from "@/lib/inbound/transactions/transaction-reply";

type PendingTransactionDraftPayload = {
  kind: "PENDING_TRANSACTION_DRAFT";
  rawText: string;
  extraction: GeminiExtraction;
  forcedCategory?: string | null;
  sourceMessageId: string;
};

type PendingBudgetDraftPayload = {
  kind: "PENDING_BUDGET_DRAFT";
  category: string;
  monthlyLimit: number;
  sourceMessageId: string;
};

type PendingGoalDraftPayload = {
  kind: "PENDING_GOAL_DRAFT";
  targetAmount: number;
  goalName: string | null;
  goalType: FinancialGoalType | null;
  goalQuery?: string | null;
  targetMonth?: number | null;
  targetYear?: number | null;
  sourceMessageId: string;
};

type PendingDeleteDraftPayload = {
  kind: "PENDING_DELETE_DRAFT";
  transactionId: string;
  transactionLabel: string;
  transactionAmount: number;
  sourceMessageId: string;
};

type PendingResolutionPayload = {
  kind: "PENDING_ACTION_RESOLUTION";
  draftId: string;
  action: "SAVED" | "DISCARDED" | "EDITED";
  sourceMessageId: string;
};

type PendingDraftPayload =
  | PendingTransactionDraftPayload
  | PendingBudgetDraftPayload
  | PendingGoalDraftPayload
  | PendingDeleteDraftPayload;

type PendingDraft = {
  id: string;
  payload: PendingDraftPayload;
};

const ACTION_TEXT =
  "Balas dengan salah satu:\n✅ simpan: kalau sudah benar\n✏️ edit (Transaksi): contoh `edit 50rb` atau `edit kategori Food & Drink`\n🗑️ buang: kalau batal";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isTransactionDraftPayload = (value: unknown): value is PendingTransactionDraftPayload =>
  isRecord(value) &&
  value.kind === "PENDING_TRANSACTION_DRAFT" &&
  isRecord(value.extraction) &&
  typeof value.rawText === "string" &&
  typeof value.sourceMessageId === "string";

const isBudgetDraftPayload = (value: unknown): value is PendingBudgetDraftPayload =>
  isRecord(value) &&
  value.kind === "PENDING_BUDGET_DRAFT" &&
  typeof value.category === "string" &&
  typeof value.monthlyLimit === "number" &&
  typeof value.sourceMessageId === "string";

const isGoalDraftPayload = (value: unknown): value is PendingGoalDraftPayload =>
  isRecord(value) &&
  value.kind === "PENDING_GOAL_DRAFT" &&
  typeof value.targetAmount === "number" &&
  typeof value.sourceMessageId === "string";

const isDeleteDraftPayload = (value: unknown): value is PendingDeleteDraftPayload =>
  isRecord(value) &&
  value.kind === "PENDING_DELETE_DRAFT" &&
  typeof value.transactionId === "string" &&
  typeof value.sourceMessageId === "string";

const isResolutionPayload = (value: unknown): value is PendingResolutionPayload =>
  isRecord(value) &&
  value.kind === "PENDING_ACTION_RESOLUTION" &&
  typeof value.draftId === "string";

const buildBubbleResult = (first: string, second = ACTION_TEXT): InboundHandlerResult =>
  ok({
    replyText: `${first}\n\n${second}`,
    replyTexts: [first, second],
    preserveReplyTextBubbles: true
  });

const buildTransactionDraftText = (payload: PendingTransactionDraftPayload) =>
  {
    const category =
      payload.extraction.type === "EXPENSE"
        ? normalizeExpenseBucketCategory(payload.extraction.category ?? "")
        : payload.extraction.category ?? "Others";
    return [
    "📝 Draf transaksi belum disimpan:",
    `- Tipe: ${payload.extraction.type ?? "EXPENSE"}`,
    `- Amount: ${formatMoney(payload.extraction.amount ?? 0)}`,
    `- Category: ${category}`,
    payload.extraction.merchant ? `- Merchant: ${payload.extraction.merchant}` : null,
    "Saya tunggu konfirmasi dulu sebelum masuk ke catatan."
  ]
    .filter(Boolean)
    .join("\n");
};

const buildBudgetDraftText = (payload: PendingBudgetDraftPayload) =>
  [
    "Draf budget belum disimpan:",
    `- Category: ${payload.category}`,
    `- Limit bulanan: ${formatMoney(payload.monthlyLimit)}`,
    "Saya tunggu konfirmasi dulu sebelum budget ini aktif."
  ].join("\n");

const buildGoalDraftText = (payload: PendingGoalDraftPayload) =>
  [
    "Draf goal belum disimpan:",
    `- Nama: ${payload.goalName ?? "Target Tabungan"}`,
    `- Target: ${formatMoney(payload.targetAmount)}`,
    payload.targetMonth && payload.targetYear
      ? `- Deadline: ${formatMonthYearLabel(payload.targetMonth, payload.targetYear)}`
      : null,
    "Saya tunggu konfirmasi dulu sebelum goal ini aktif."
  ]
    .filter(Boolean)
    .join("\n");

const createPendingDraft = async (params: {
  userId: string;
  messageId: string;
  payload: PendingDraftPayload;
}) =>
  createAIAnalysisLog({
    userId: params.userId,
    messageId: params.messageId,
    analysisType: AnalysisType.EXTRACTION,
    payload: params.payload
  });

const markDraftResolved = async (params: {
  userId: string;
  messageId: string;
  draftId: string;
  action: PendingResolutionPayload["action"];
}) =>
  createAIAnalysisLog({
    userId: params.userId,
    messageId: params.messageId,
    analysisType: AnalysisType.EXTRACTION,
    payload: {
      kind: "PENDING_ACTION_RESOLUTION",
      draftId: params.draftId,
      action: params.action,
      sourceMessageId: params.messageId
    } satisfies PendingResolutionPayload
  });

const getAnalysisLogModel = () => (prisma as { aIAnalysisLog?: any }).aIAnalysisLog;

const findLatestPendingDraft = async (userId: string): Promise<PendingDraft | null> => {
  const model = getAnalysisLogModel();
  if (!model?.findMany) return null;

  const rows = await model.findMany({
    where: {
      userId,
      analysisType: AnalysisType.EXTRACTION
    },
    orderBy: { createdAt: "desc" },
    take: 30
  });

  const resolvedDraftIds = new Set<string>();
  for (const row of rows) {
    const payload = row.payloadJson;
    if (isResolutionPayload(payload)) {
      resolvedDraftIds.add(payload.draftId);
      continue;
    }

    if (
      (isTransactionDraftPayload(payload) ||
        isBudgetDraftPayload(payload) ||
        isGoalDraftPayload(payload) ||
        isDeleteDraftPayload(payload)) &&
      !resolvedDraftIds.has(row.id)
    ) {
      return {
        id: row.id,
        payload
      };
    }
  }

  return null;
};

const detectPendingAction = (text: string): "SAVE" | "DISCARD" | "EDIT" | "DELETE_CONFIRM" | null => {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;

  if (/^(simpan|save|catat|oke|ok|iya|ya|yes|setuju|lanjut|lanjutin|pakai ini|pake ini|tetap itu aja|tetep itu aja|itu aja|ituaja)$/.test(normalized)) {
    return "SAVE";
  }

  if (/^(buang|batal|cancel|discard|hapus draft|batalkan|jangan)$/.test(normalized)) {
    return "DISCARD";
  }

  if (/^(hapus|delete)$/i.test(normalized)) {
    return "DELETE_CONFIRM";
  }

  if (/^(edit|ubah|ganti|koreksi)\b/i.test(text)) {
    return "EDIT";
  }

  return null;
};

const extractAmountUpdate = (text: string) => {
  const match = text.match(/(\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?)/i);
  return match ? parsePositiveAmount(match[1]) : null;
};

const stripEditWords = (text: string) =>
  text
    .replace(/^(edit|ubah|ganti|koreksi)\b/i, "")
    .replace(/\b(jadi|ke|to)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const titleCase = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric"
});

const formatMonthYearLabel = (month: number, year: number) =>
  MONTH_YEAR_FORMATTER.format(new Date(Date.UTC(year, Math.max(0, month - 1), 1)));

const patchTransactionDraft = (
  payload: PendingTransactionDraftPayload,
  text: string
): PendingTransactionDraftPayload | null => {
  const amount = extractAmountUpdate(text);
  const { forcedCategory } = extractForcedCategory(text);
  const changed = Boolean(amount || forcedCategory);
  const nextExtraction = {
    ...payload.extraction,
    ...(amount ? { amount } : {}),
    ...(forcedCategory ? { category: forcedCategory } : {})
  };

  if (!changed) return null;
  return {
    ...payload,
    extraction: nextExtraction,
    rawText: payload.rawText
  };
};

const patchBudgetDraft = (
  payload: PendingBudgetDraftPayload,
  text: string
): PendingBudgetDraftPayload | null => {
  const amount = extractAmountUpdate(text);
  const cleaned = stripEditWords(text);
  const categoryMatch = cleaned.match(/\b(?:kategori|category|budget|anggaran)\s+(.+?)(?=\s+\d|$)/i);
  const category = categoryMatch?.[1]?.trim();

  const nextPayload = {
    ...payload,
    ...(amount ? { monthlyLimit: amount } : {}),
    ...(category ? { category: normalizeBudgetCategoryName(category) } : {})
  };

  return nextPayload.monthlyLimit !== payload.monthlyLimit || nextPayload.category !== payload.category
    ? nextPayload
    : null;
};

const patchGoalDraft = (
  payload: PendingGoalDraftPayload,
  text: string
): PendingGoalDraftPayload | null => {
  const amount = extractAmountUpdate(text);
  const cleaned = stripEditWords(text);
  const nameMatch = cleaned.match(/\b(?:nama|target|goal)\s+(.+?)(?=\s+\d|$)/i);
  const goalName = nameMatch?.[1]?.trim();

  const nextPayload = {
    ...payload,
    ...(amount ? { targetAmount: amount } : {}),
    ...(goalName ? { goalName: titleCase(goalName), goalQuery: titleCase(goalName), goalType: FinancialGoalType.CUSTOM } : {})
  };

  return nextPayload.targetAmount !== payload.targetAmount || nextPayload.goalName !== payload.goalName
    ? nextPayload
    : null;
};

const buildMissingBudgetReply = (category: string) =>
  [
    `Kategori ${category} belum punya budget aktif.`,
    "",
    "Buat budget dulu supaya kategori ini punya batas bulanan.",
    "Ketik `/budget set`, nanti saya tanya kategori dan limitnya satu per satu.",
    "",
    "Setelah budget tersimpan, kirim ulang transaksinya ya Boss."
  ].join("\n");

export const stageTransactionAndBuildReply = async (params: {
  userId: string;
  messageId: string;
  extraction: GeminiExtraction;
  rawText: string;
  analysisPayload?: unknown;
  forcedCategory?: string | null;
}): Promise<InboundHandlerResult> => {
  if (params.extraction.amount != null && params.extraction.amount < 0) {
    return ok({
      replyText: "Maaf, nominal tidak boleh negatif atau minus. Silakan masukkan nominal yang valid, contoh: `makan 45000` atau `gaji masuk 5 juta`."
    });
  }

  const shouldStageTransaction =
    params.extraction.type === "EXPENSE" || params.extraction.type === "INCOME";

  if (!shouldStageTransaction) {
    return saveTransactionAndBuildReply(params);
  }

  if (params.extraction.type === "EXPENSE" && params.forcedCategory) {
    const matchedBudget = await getMatchingCategoryBudget({
      userId: params.userId,
      category: params.forcedCategory
    });
    if (!matchedBudget.budget) {
      return ok({
        replyText: buildMissingBudgetReply(matchedBudget.category)
      });
    }
  }

  const payload: PendingTransactionDraftPayload = {
    kind: "PENDING_TRANSACTION_DRAFT",
    rawText: params.rawText,
    extraction: params.extraction,
    forcedCategory: params.forcedCategory ?? null,
    sourceMessageId: params.messageId
  };

  await createPendingDraft({
    userId: params.userId,
    messageId: params.messageId,
    payload
  });

  return buildBubbleResult(buildTransactionDraftText(payload));
};

export const stageExpenseTransactionAndBuildReply = stageTransactionAndBuildReply;

export const stageBudgetAndBuildReply = async (params: {
  userId: string;
  messageId: string;
  category: string;
  monthlyLimit: number;
}): Promise<InboundHandlerResult> => {
  const payload: PendingBudgetDraftPayload = {
    kind: "PENDING_BUDGET_DRAFT",
    category: params.category,
    monthlyLimit: params.monthlyLimit,
    sourceMessageId: params.messageId
  };

  await createPendingDraft({
    userId: params.userId,
    messageId: params.messageId,
    payload
  });

  return buildBubbleResult(buildBudgetDraftText(payload));
};

export const stageGoalAndBuildReply = async (params: {
  userId: string;
  messageId: string;
  targetAmount: number;
  goalName: string | null;
  goalType: FinancialGoalType | null;
  goalQuery?: string | null;
  targetMonth?: number | null;
  targetYear?: number | null;
}): Promise<InboundHandlerResult> => {
  const payload: PendingGoalDraftPayload = {
    kind: "PENDING_GOAL_DRAFT",
    targetAmount: params.targetAmount,
    goalName: params.goalName,
    goalType: params.goalType,
    goalQuery: params.goalQuery ?? params.goalName,
    targetMonth: params.targetMonth ?? null,
    targetYear: params.targetYear ?? null,
    sourceMessageId: params.messageId
  };

  await createPendingDraft({
    userId: params.userId,
    messageId: params.messageId,
    payload
  });

  return buildBubbleResult(buildGoalDraftText(payload));
};

const savePendingDraft = async (params: {
  userId: string;
  messageId: string;
  draft: PendingDraft;
}): Promise<InboundHandlerResult> => {
  const { payload } = params.draft;
  await markDraftResolved({
    userId: params.userId,
    messageId: params.messageId,
    draftId: params.draft.id,
    action: "SAVED"
  });

  if (payload.kind === "PENDING_TRANSACTION_DRAFT") {
    return saveTransactionAndBuildReply({
      userId: params.userId,
      messageId: params.messageId,
      extraction: payload.extraction,
      rawText: payload.rawText,
      analysisPayload: {
        source: "pending_transaction_confirmation",
        extraction: payload.extraction
      },
      forcedCategory: payload.forcedCategory ?? null
    });
  }

  if (payload.kind === "PENDING_BUDGET_DRAFT") {
    const budget = await upsertCategoryBudget({
      userId: params.userId,
      category: payload.category,
      monthlyLimit: payload.monthlyLimit
    });
    return ok({ replyText: buildBudgetSetText(budget) });
  }

  if (payload.kind === "PENDING_DELETE_DRAFT") {
    const existing = await prisma.transaction.findUnique({ where: { id: payload.transactionId } });
    if (!existing) {
      return ok({ replyText: "Transaksi sudah tidak ada atau sudah dihapus sebelumnya." });
    }
    await prisma.transaction.delete({ where: { id: payload.transactionId } });
    await refreshSavingsGoalProgress(params.userId);
    return ok({
      replyText: `Transaksi ${payload.transactionLabel} sebesar ${formatMoney(payload.transactionAmount)} berhasil dihapus.`
    });
  }

  const goalStatus = await setSavingsGoalTarget(params.userId, payload.targetAmount, {
    goalName: payload.goalName,
    goalType: payload.goalType,
    goalQuery: payload.goalQuery ?? payload.goalName,
    targetMonth: payload.targetMonth ?? null,
    targetYear: payload.targetYear ?? null
  });
  return ok(buildGoalStatusReplyPayload(goalStatus));
};

const editPendingDraft = async (params: {
  userId: string;
  messageId: string;
  draft: PendingDraft;
  text: string;
}): Promise<InboundHandlerResult> => {
  const { payload } = params.draft;
  const patched =
    payload.kind === "PENDING_TRANSACTION_DRAFT"
      ? patchTransactionDraft(payload, params.text)
      : payload.kind === "PENDING_BUDGET_DRAFT"
        ? patchBudgetDraft(payload, params.text)
        : patchGoalDraft(payload, params.text);

  if (!patched) {
    return ok({
      replyText:
        "Saya belum menangkap bagian yang mau diedit. Coba tulis misalnya `edit 50rb`, `edit kategori Food & Drink`, atau `buang` kalau batal."
    });
  }

  await markDraftResolved({
    userId: params.userId,
    messageId: params.messageId,
    draftId: params.draft.id,
    action: "EDITED"
  });
  await createPendingDraft({
    userId: params.userId,
    messageId: params.messageId,
    payload: patched
  });

  if (patched.kind === "PENDING_TRANSACTION_DRAFT") {
    return buildBubbleResult(buildTransactionDraftText(patched));
  }
  if (patched.kind === "PENDING_BUDGET_DRAFT") {
    return buildBubbleResult(buildBudgetDraftText(patched));
  }
  return buildBubbleResult(buildGoalDraftText(patched));
};

export const stageDeleteAndBuildReply = async (params: {
  userId: string;
  messageId: string;
  transactionId: string;
  transactionLabel: string;
  transactionAmount: number;
  confirmationText: string;
}): Promise<InboundHandlerResult> => {
  const payload: PendingDeleteDraftPayload = {
    kind: "PENDING_DELETE_DRAFT",
    transactionId: params.transactionId,
    transactionLabel: params.transactionLabel,
    transactionAmount: params.transactionAmount,
    sourceMessageId: params.messageId
  };

  await createPendingDraft({
    userId: params.userId,
    messageId: params.messageId,
    payload
  });

  const deleteActionText =
    "Balas dengan salah satu:\n✅ hapus: kalau mau dihapus\n🗑️ batal: kalau batal";
  return buildBubbleResult(params.confirmationText, deleteActionText);
};

export const tryHandlePendingAction = async (params: {
  userId: string;
  messageId: string;
  text: string;
}): Promise<InboundHandlerResult | null> => {
  const action = detectPendingAction(params.text);
  if (!action) return null;

  const draft = await findLatestPendingDraft(params.userId);
  if (!draft) return null;

  if (action === "DISCARD") {
    await markDraftResolved({
      userId: params.userId,
      messageId: params.messageId,
      draftId: draft.id,
      action: "DISCARDED"
    });
    const discardText =
      draft.payload.kind === "PENDING_DELETE_DRAFT"
        ? "Penghapusan dibatalkan. Transaksi tetap tersimpan."
        : "Draf saya buang. Tidak ada data yang disimpan.";
    return ok({ replyText: discardText });
  }

  if (action === "EDIT") {
    if (draft.payload.kind === "PENDING_DELETE_DRAFT") {
      return ok({ replyText: "Penghapusan transaksi tidak bisa diedit. Balas \"hapus\" untuk menghapus atau \"batal\" untuk membatalkan." });
    }
    return editPendingDraft({
      userId: params.userId,
      messageId: params.messageId,
      draft,
      text: params.text
    });
  }

  if (action === "DELETE_CONFIRM") {
    if (draft.payload.kind === "PENDING_DELETE_DRAFT") {
      return savePendingDraft({
        userId: params.userId,
        messageId: params.messageId,
        draft
      });
    }
    return null;
  }

  return savePendingDraft({
    userId: params.userId,
    messageId: params.messageId,
    draft
  });
};
