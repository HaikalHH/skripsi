import type { GeminiExtraction } from "@finance/shared";
import { TransactionSource } from "@prisma/client";
import { prisma } from "../prisma";

const requiredFieldsPresent = (parsed: GeminiExtraction) =>
  Boolean(parsed.type && parsed.amount && parsed.category);

export const isTransactionExtractable = (parsed: GeminiExtraction): boolean =>
  parsed.intent === "RECORD_TRANSACTION" && requiredFieldsPresent(parsed);

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

  return prisma.transaction.create({
    data: {
      userId: params.userId,
      type: extraction.type!,
      amount: extraction.amount!,
      category: extraction.category!,
      merchant: extraction.merchant,
      note: extraction.note,
      occurredAt,
      source: params.source,
      rawText: params.rawText
    }
  });
};
