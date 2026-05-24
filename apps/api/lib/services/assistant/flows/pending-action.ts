import type { GeminiExtraction } from "@finance/shared";
import { AnalysisType, FinancialGoalType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAIAnalysisLog } from "@/lib/services/ai/analysis-logs";
import { refreshSavingsGoalProgress } from "@/lib/services/planning/goal";
import {
  findBudgetItemByCategoryName,
  getMatchingCategoryBudget,
  listCategoryBudgets,
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
import { inferTransactionDetailTag } from "@/lib/services/transactions/detail-tags";
import {
  buildBudgetSetText,
  buildGoalStatusReplyPayload
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

type PendingTransactionCategoryChoicePayload = {
  kind: "PENDING_TRANSACTION_CATEGORY_CHOICE";
  rawText: string;
  extraction: GeminiExtraction;
  forcedCategory?: string | null;
  categoryOptions: string[];
  sourceMessageId: string;
};

type PendingTransactionCategoryCreatePayload = {
  kind: "PENDING_TRANSACTION_CATEGORY_CREATE";
  rawText: string;
  extraction: GeminiExtraction;
  forcedCategory?: string | null;
  step: "ASK_CATEGORY" | "ASK_AMOUNT";
  category?: string | null;
  sourceMessageId: string;
};

type PendingBudgetDraftPayload = {
  kind: "PENDING_BUDGET_DRAFT";
  category: string;
  monthlyLimit: number;
  returnTransaction?: {
    rawText: string;
    extraction: GeminiExtraction;
    forcedCategory?: string | null;
  } | null;
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
  | PendingTransactionCategoryChoicePayload
  | PendingTransactionCategoryCreatePayload
  | PendingBudgetDraftPayload
  | PendingGoalDraftPayload
  | PendingDeleteDraftPayload;

type PendingDraft = {
  id: string;
  payload: PendingDraftPayload;
};

const ACTION_TEXT =
  [
    "📝 Instruksi:",
    "",
    "· Ketik edit untuk masuk mode edit, lalu kirim koreksi yang diinginkan. Contoh: `edit 50rb` atau `edit kategori Food & Drink`",
    "",
    "· Ketik simpan untuk konfirmasi dan menyimpan data ini",
    "",
    "· Ketik buang untuk membatalkan draf ini"
  ].join("\n");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isTransactionDraftPayload = (value: unknown): value is PendingTransactionDraftPayload =>
  isRecord(value) &&
  value.kind === "PENDING_TRANSACTION_DRAFT" &&
  isRecord(value.extraction) &&
  typeof value.rawText === "string" &&
  typeof value.sourceMessageId === "string";

const isTransactionCategoryChoicePayload = (
  value: unknown
): value is PendingTransactionCategoryChoicePayload =>
  isRecord(value) &&
  value.kind === "PENDING_TRANSACTION_CATEGORY_CHOICE" &&
  isRecord(value.extraction) &&
  typeof value.rawText === "string" &&
  Array.isArray(value.categoryOptions) &&
  typeof value.sourceMessageId === "string";

const isTransactionCategoryCreatePayload = (
  value: unknown
): value is PendingTransactionCategoryCreatePayload =>
  isRecord(value) &&
  value.kind === "PENDING_TRANSACTION_CATEGORY_CREATE" &&
  isRecord(value.extraction) &&
  typeof value.rawText === "string" &&
  (value.step === "ASK_CATEGORY" || value.step === "ASK_AMOUNT") &&
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

const AMOUNT_TEXT_PATTERN =
  /\b(?:rp\.?\s*)?\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?\b/gi;

const stripTransactionAmountText = (value: string) =>
  value
    .replace(/\bkategori\s+.+$/i, "")
    .replace(AMOUNT_TEXT_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildTransactionDraftTitle = (payload: {
  rawText: string;
  extraction: GeminiExtraction;
}) => {
  const note = payload.extraction.note?.trim();
  const rawTitle = stripTransactionAmountText(payload.rawText);
  const merchant = payload.extraction.merchant?.trim();
  return titleCase(note || rawTitle || merchant || "Transaksi");
};

const buildCategoryDisplayLabel = (category: string, detailTag?: string | null) => {
  const detail = detailTag?.trim();
  if (!detail || detail.toLowerCase() === category.toLowerCase()) return category;
  return `${category} / ${detail}`;
};

const resolveExpenseDraftCategory = (rawCategory: string | null | undefined, rawText: string) => {
  const normalized = normalizeExpenseBucketCategory(rawCategory ?? rawText);
  const cleaned = rawCategory?.trim();
  if (cleaned && normalized === "Others" && cleaned.toLowerCase() !== "others") {
    return titleCase(cleaned);
  }
  return normalized;
};

const buildTransactionDraftText = (payload: PendingTransactionDraftPayload) => {
  const type = payload.extraction.type ?? "EXPENSE";
  const category =
    type === "EXPENSE"
      ? resolveExpenseDraftCategory(payload.extraction.category, payload.rawText)
      : titleCase(payload.extraction.category ?? "Other Income");
  const detailTag = inferTransactionDetailTag({
    type,
    category,
    merchant: payload.extraction.merchant,
    note: payload.extraction.note,
    rawText: payload.rawText
  });
  const merchantLabel =
    type === "INCOME" ? "Sumber" : type === "SAVING" ? "Tujuan" : "Toko";
  const merchant = payload.extraction.merchant?.trim();

  return [
    "📝 Cek dulu ya, Boss",
    "",
    "Aku menangkap transaksi ini:",
    "",
    buildTransactionDraftTitle(payload),
    formatMoney(payload.extraction.amount ?? 0),
    `Kategori: ${buildCategoryDisplayLabel(category, detailTag)}`,
    merchant ? `${merchantLabel}: ${merchant}` : null,
    "",
    "Mau disimpan ke catatan keuangan?",
    "",
    "Balas:",
    "",
    "✅ simpan untuk menyimpan",
    "✏️ edit untuk ubah data",
    "❌ buang untuk batal"
  ]
    .filter((line) => line !== null)
    .join("\n");
};

const buildTransactionDraftResult = (payload: PendingTransactionDraftPayload): InboundHandlerResult =>
  ok({ replyText: buildTransactionDraftText(payload) });

const OPTION_LABELS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

const formatOptionNumber = (index: number) => OPTION_LABELS[index] ?? `${index + 1}.`;

const buildTransactionCategoryChoiceText = (payload: PendingTransactionCategoryChoicePayload) => {
  const createOptionNumber = payload.categoryOptions.length;
  const othersOptionNumber = payload.categoryOptions.length + 1;
  const optionLines = [
    ...payload.categoryOptions.map(
      (category, index) => `${formatOptionNumber(index)} ${category}`
    ),
    `${formatOptionNumber(createOptionNumber)} Buat kategori baru`,
    `${formatOptionNumber(othersOptionNumber)} Masukkan ke Others`
  ];

  return [
    "📝 Aku belum yakin kategori transaksi ini",
    "",
    `${buildTransactionDraftTitle(payload)} — ${formatMoney(payload.extraction.amount ?? 0)}`,
    "",
    "Mau dimasukkan ke kategori mana?",
    "",
    ...optionLines
  ].join("\n");
};

const buildTransactionCategoryChoiceResult = (
  payload: PendingTransactionCategoryChoicePayload
): InboundHandlerResult => ok({ replyText: buildTransactionCategoryChoiceText(payload) });

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
        isTransactionCategoryChoicePayload(payload) ||
        isTransactionCategoryCreatePayload(payload) ||
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

const CHOICE_WORDS: Record<string, number> = {
  satu: 1,
  pertama: 1,
  dua: 2,
  kedua: 2,
  tiga: 3,
  ketiga: 3,
  empat: 4,
  keempat: 4,
  lima: 5,
  kelima: 5,
  enam: 6,
  keenam: 6,
  tujuh: 7,
  ketujuh: 7,
  delapan: 8,
  kedelapan: 8,
  sembilan: 9,
  kesembilan: 9
};

const parseChoiceNumber = (text: string) => {
  const normalized = text.trim().toLowerCase();
  const digit = normalized.match(/\d+/)?.[0];
  if (digit) return Number(digit);

  for (const [word, value] of Object.entries(CHOICE_WORDS)) {
    if (new RegExp(`\\b(?:yang\\s+)?(?:ke\\s*)?${word}\\b`, "i").test(normalized)) {
      return value;
    }
  }

  return null;
};

const normalizeChoiceText = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/&]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const resolveCategoryChoice = (
  payload: PendingTransactionCategoryChoicePayload,
  text: string
):
  | { kind: "CATEGORY"; category: string }
  | { kind: "CREATE_CATEGORY" }
  | { kind: "OTHERS" }
  | null => {
  const choiceNumber = parseChoiceNumber(text);
  const createNumber = payload.categoryOptions.length + 1;
  const othersNumber = payload.categoryOptions.length + 2;

  if (choiceNumber != null) {
    if (choiceNumber >= 1 && choiceNumber <= payload.categoryOptions.length) {
      return { kind: "CATEGORY", category: payload.categoryOptions[choiceNumber - 1]! };
    }
    if (choiceNumber === createNumber) return { kind: "CREATE_CATEGORY" };
    if (choiceNumber === othersNumber) return { kind: "OTHERS" };
  }

  const normalized = normalizeChoiceText(text);
  if (/\b(buat|bikin|tambah|kategori baru|baru)\b/i.test(normalized)) {
    return { kind: "CREATE_CATEGORY" };
  }
  if (/\b(others|other|lainnya|lain)\b/i.test(normalized)) {
    return { kind: "OTHERS" };
  }

  const matchedCategory = payload.categoryOptions.find(
    (category) =>
      normalizeChoiceText(category) === normalized ||
      normalizeChoiceText(category).includes(normalized) ||
      normalized.includes(normalizeChoiceText(category))
  );
  return matchedCategory ? { kind: "CATEGORY", category: matchedCategory } : null;
};

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

const buildDiscardReply = (payload: PendingDraftPayload) => {
  if (payload.kind === "PENDING_DELETE_DRAFT") {
    return "Penghapusan dibatalkan. Transaksi tetap tersimpan.";
  }
  if (payload.kind === "PENDING_TRANSACTION_DRAFT") {
    return "✅ Draf transaksi berhasil dibuang.";
  }
  if (
    payload.kind === "PENDING_TRANSACTION_CATEGORY_CHOICE" ||
    payload.kind === "PENDING_TRANSACTION_CATEGORY_CREATE"
  ) {
    return "✅ Draf transaksi berhasil dibuang.";
  }
  if (payload.kind === "PENDING_BUDGET_DRAFT") {
    return "✅ Draf budget berhasil dibuang.";
  }
  return "✅ Draf goal berhasil dibuang.";
};

const buildTransactionDraftPayload = (params: {
  rawText: string;
  extraction: GeminiExtraction;
  forcedCategory?: string | null;
  sourceMessageId: string;
  category?: string | null;
}): PendingTransactionDraftPayload => ({
  kind: "PENDING_TRANSACTION_DRAFT",
  rawText: params.rawText,
  extraction: params.category
    ? { ...params.extraction, category: params.category }
    : params.extraction,
  forcedCategory: params.forcedCategory ?? null,
  sourceMessageId: params.sourceMessageId
});

const listUserCategoryChoiceOptions = async (userId: string) =>
  (await listCategoryBudgets(userId))
    .map((budget) => budget.category)
    .filter((category) => normalizeBudgetCategoryName(category).toLowerCase() !== "others");

const resolveKnownExpenseCategory = async (params: {
  userId: string;
  extraction: GeminiExtraction;
}) => {
  if (params.extraction.type !== "EXPENSE" || !params.extraction.category) return null;
  const exactBudget = await findBudgetItemByCategoryName({
    userId: params.userId,
    category: params.extraction.category
  });
  return exactBudget?.category ?? null;
};

const shouldAskExpenseCategory = async (params: {
  userId: string;
  extraction: GeminiExtraction;
  rawText: string;
  forcedCategory?: string | null;
}) => {
  if (params.extraction.type !== "EXPENSE" || params.forcedCategory) return false;
  const knownCategory = await resolveKnownExpenseCategory({
    userId: params.userId,
    extraction: params.extraction
  });
  if (knownCategory) return false;

  return normalizeExpenseBucketCategory(params.extraction.category ?? params.rawText) === "Others";
};

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

  if (
    await shouldAskExpenseCategory({
      userId: params.userId,
      extraction: params.extraction,
      rawText: params.rawText,
      forcedCategory: params.forcedCategory
    })
  ) {
    const payload: PendingTransactionCategoryChoicePayload = {
      kind: "PENDING_TRANSACTION_CATEGORY_CHOICE",
      rawText: params.rawText,
      extraction: params.extraction,
      forcedCategory: params.forcedCategory ?? null,
      categoryOptions: await listUserCategoryChoiceOptions(params.userId),
      sourceMessageId: params.messageId
    };

    await createPendingDraft({
      userId: params.userId,
      messageId: params.messageId,
      payload
    });

    return buildTransactionCategoryChoiceResult(payload);
  }

  const knownCategory = await resolveKnownExpenseCategory({
    userId: params.userId,
    extraction: params.extraction
  });
  const payload = buildTransactionDraftPayload({
    rawText: params.rawText,
    extraction: params.extraction,
    forcedCategory: params.forcedCategory,
    sourceMessageId: params.messageId,
    category: knownCategory
  });

  await createPendingDraft({
    userId: params.userId,
    messageId: params.messageId,
    payload
  });

  return buildTransactionDraftResult(payload);
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
    const budgetReplyText = buildBudgetSetText(budget);
    if (payload.returnTransaction) {
      const transactionPayload = buildTransactionDraftPayload({
        rawText: payload.returnTransaction.rawText,
        extraction: payload.returnTransaction.extraction,
        forcedCategory: payload.returnTransaction.forcedCategory ?? null,
        sourceMessageId: params.messageId,
        category: budget.category
      });
      await createPendingDraft({
        userId: params.userId,
        messageId: params.messageId,
        payload: transactionPayload
      });
      return ok({
        replyText: `${budgetReplyText}\n\n${buildTransactionDraftText(transactionPayload)}`
      });
    }
    return ok({ replyText: budgetReplyText });
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

  if (payload.kind !== "PENDING_GOAL_DRAFT") {
    return ok({
      replyText:
        "Pilih kategori transaksi dulu ya Boss, baru nanti bisa disimpan ke catatan."
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
  let patched: PendingDraftPayload | null = null;
  if (payload.kind === "PENDING_TRANSACTION_DRAFT") {
    patched = patchTransactionDraft(payload, params.text);
  } else if (payload.kind === "PENDING_BUDGET_DRAFT") {
    patched = patchBudgetDraft(payload, params.text);
  } else if (payload.kind === "PENDING_GOAL_DRAFT") {
    patched = patchGoalDraft(payload, params.text);
  } else {
    return ok({
      replyText:
        "Untuk tahap ini, pilih kategori dulu ya Boss. Balas nomor kategori, nama kategorinya, `buat kategori baru`, atau `Others`."
    });
  }

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
    return buildTransactionDraftResult(patched);
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

const handleCategoryChoiceDraft = async (params: {
  userId: string;
  messageId: string;
  draft: PendingDraft;
  payload: PendingTransactionCategoryChoicePayload;
  text: string;
}): Promise<InboundHandlerResult> => {
  const choice = resolveCategoryChoice(params.payload, params.text);
  if (!choice) {
    return ok({
      replyText:
        "Saya belum menangkap pilihan kategorinya. Balas nomor kategori, nama kategorinya, `buat kategori baru`, atau `Others` ya Boss."
    });
  }

  await markDraftResolved({
    userId: params.userId,
    messageId: params.messageId,
    draftId: params.draft.id,
    action: "EDITED"
  });

  if (choice.kind === "CREATE_CATEGORY") {
    const payload: PendingTransactionCategoryCreatePayload = {
      kind: "PENDING_TRANSACTION_CATEGORY_CREATE",
      rawText: params.payload.rawText,
      extraction: params.payload.extraction,
      forcedCategory: params.payload.forcedCategory ?? null,
      step: "ASK_CATEGORY",
      sourceMessageId: params.messageId
    };
    await createPendingDraft({
      userId: params.userId,
      messageId: params.messageId,
      payload
    });
    return ok({ replyText: "Nama kategori barunya apa Boss?" });
  }

  const transactionPayload = buildTransactionDraftPayload({
    rawText: params.payload.rawText,
    extraction: params.payload.extraction,
    forcedCategory: params.payload.forcedCategory ?? null,
    sourceMessageId: params.messageId,
    category: choice.kind === "OTHERS" ? "Others" : choice.category
  });
  await createPendingDraft({
    userId: params.userId,
    messageId: params.messageId,
    payload: transactionPayload
  });
  return buildTransactionDraftResult(transactionPayload);
};

const handleCategoryCreateDraft = async (params: {
  userId: string;
  messageId: string;
  draft: PendingDraft;
  payload: PendingTransactionCategoryCreatePayload;
  text: string;
}): Promise<InboundHandlerResult> => {
  if (params.payload.step === "ASK_CATEGORY") {
    const category = normalizeBudgetCategoryName(params.text);
    if (!category) {
      return ok({ replyText: "Nama kategorinya belum kebaca. Coba tulis nama kategori baru ya Boss." });
    }

    await markDraftResolved({
      userId: params.userId,
      messageId: params.messageId,
      draftId: params.draft.id,
      action: "EDITED"
    });
    const payload: PendingTransactionCategoryCreatePayload = {
      ...params.payload,
      step: "ASK_AMOUNT",
      category,
      sourceMessageId: params.messageId
    };
    await createPendingDraft({
      userId: params.userId,
      messageId: params.messageId,
      payload
    });
    return ok({ replyText: `Limit bulanan untuk ${category} berapa Boss?` });
  }

  const amount = parsePositiveAmount(params.text);
  if (!amount) {
    return ok({
      replyText:
        "Nominal budget belum terbaca. Coba tulis ulang lagi Boss, misalnya `500rb` atau `Rp500.000`."
    });
  }

  await markDraftResolved({
    userId: params.userId,
    messageId: params.messageId,
    draftId: params.draft.id,
    action: "EDITED"
  });
  const category = params.payload.category ?? "Kategori Baru";
  const budgetPayload: PendingBudgetDraftPayload = {
    kind: "PENDING_BUDGET_DRAFT",
    category,
    monthlyLimit: amount,
    returnTransaction: {
      rawText: params.payload.rawText,
      extraction: { ...params.payload.extraction, category },
      forcedCategory: params.payload.forcedCategory ?? null
    },
    sourceMessageId: params.messageId
  };
  await createPendingDraft({
    userId: params.userId,
    messageId: params.messageId,
    payload: budgetPayload
  });
  return buildBubbleResult(buildBudgetDraftText(budgetPayload));
};

export const tryHandlePendingAction = async (params: {
  userId: string;
  messageId: string;
  text: string;
}): Promise<InboundHandlerResult | null> => {
  const action = detectPendingAction(params.text);
  const draft = await findLatestPendingDraft(params.userId);
  if (!draft) return null;

  if (action === "DISCARD") {
    await markDraftResolved({
      userId: params.userId,
      messageId: params.messageId,
      draftId: draft.id,
      action: "DISCARDED"
    });
    return ok({ replyText: buildDiscardReply(draft.payload) });
  }

  if (draft.payload.kind === "PENDING_TRANSACTION_CATEGORY_CHOICE") {
    return handleCategoryChoiceDraft({
      userId: params.userId,
      messageId: params.messageId,
      draft,
      payload: draft.payload,
      text: params.text
    });
  }

  if (draft.payload.kind === "PENDING_TRANSACTION_CATEGORY_CREATE") {
    return handleCategoryCreateDraft({
      userId: params.userId,
      messageId: params.messageId,
      draft,
      payload: draft.payload,
      text: params.text
    });
  }

  if (!action) return null;

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
