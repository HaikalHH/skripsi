import type { GeminiExtraction } from "@finance/shared";
import { TransactionSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeTransactionCategory } from "../category";
import { inferTransactionDetailTag } from "../detail-tags";
import { resolveMerchantNameForUser } from "../merchant";
import { hasSavingKeyword, isLikelySavingTransactionText } from "../saving-intent";
import { isTransactionExtractable } from "./validation";

export { isTransactionExtractable } from "./validation";

export const createTransactionFromExtraction = async (params: {
  userId: string;
  extraction: GeminiExtraction;
  source: TransactionSource;
  rawText?: string;
}) => {
  const { extraction } = params;
  if (!isTransactionExtractable(extraction)) {
    throw new Error("Extraction is missing required transaction fields");
  }

  const occurredAt = extraction.occurredAt ? new Date(extraction.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error("Invalid occurredAt in extraction");
  }

  const normalizedType =
    extraction.type === "SAVING" ||
    isLikelySavingTransactionText(params.rawText ?? "") ||
    ((extraction.type === "INCOME" || extraction.type === null) &&
      hasSavingKeyword(
        [params.rawText ?? "", extraction.category ?? "", extraction.merchant ?? ""].filter(Boolean).join(" ")
      ))
      ? "SAVING"
      : extraction.type!;
  const normalizedCategory = normalizeTransactionCategory({
    type: normalizedType,
    category: extraction.category!,
    merchant: extraction.merchant,
    rawText: params.rawText ?? null
  });
  const normalizedMerchant =
    normalizedType === "SAVING"
      ? extraction.merchant?.trim() || "Tabungan Pribadi"
      : await resolveMerchantNameForUser({
          userId: params.userId,
          merchant: extraction.merchant,
          rawText: params.rawText ?? null
        });
  const detailTag = inferTransactionDetailTag({
    type: normalizedType,
    category: normalizedCategory,
    merchant: normalizedMerchant,
    note: extraction.note ?? null,
    rawText: params.rawText ?? null
  });

  return prisma.transaction.create({
    data: {
      userId: params.userId,
      type: normalizedType,
      amount: extraction.amount!,
      category: normalizedCategory,
      detailTag,
      merchant: normalizedMerchant,
      note: extraction.note,
      occurredAt,
      source: params.source,
      rawText: params.rawText
    }
  });
};
