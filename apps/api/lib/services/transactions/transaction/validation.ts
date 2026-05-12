import type { GeminiExtraction } from "@finance/shared";

const requiredFieldsPresent = (parsed: GeminiExtraction) =>
  Boolean(parsed.type && parsed.amount && parsed.category);

export const isTransactionExtractable = (parsed: GeminiExtraction): boolean =>
  parsed.intent === "RECORD_TRANSACTION" && requiredFieldsPresent(parsed);
