import type { GeminiExtraction } from "@finance/shared";
import { isNegativeAmountInput, parsePositiveAmount } from "../amount";
import { normalizeDetectedMerchant } from "../merchant";
import { isLikelySavingTransactionText } from "../saving-intent";
import { detectExpenseCategory, detectIncomeCategory, extractAmountPhrase } from "./detectors";
import { EXPENSE_HINTS, INCOME_HINTS, countMatches } from "./hints";

export const parseFallbackTransactionExtraction = (rawText: string): GeminiExtraction | null => {
  const text = rawText.trim();
  if (!text || text.includes("?")) return null;

  const amountPhrase = extractAmountPhrase(text);
  if (!amountPhrase) return null;

  if (isNegativeAmountInput(amountPhrase)) return null;

  const amount = parsePositiveAmount(amountPhrase);
  if (!amount) return null;

  if (isLikelySavingTransactionText(text)) {
    return {
      intent: "RECORD_TRANSACTION",
      type: "SAVING",
      amount,
      category: "Tabungan",
      merchant: "Tabungan Pribadi",
      note: null,
      occurredAt: null,
      reportPeriod: null
    };
  }

  const incomeScore = countMatches(text, INCOME_HINTS);
  const expenseScore = countMatches(text, EXPENSE_HINTS);
  if (incomeScore === 0 && expenseScore === 0) return null;

  const type = incomeScore > expenseScore ? "INCOME" : "EXPENSE";
  const category = type === "INCOME" ? detectIncomeCategory(text) : detectExpenseCategory(text);
  const merchant = type === "EXPENSE" ? normalizeDetectedMerchant({ rawText: text }) : null;

  return {
    intent: "RECORD_TRANSACTION",
    type,
    amount,
    category,
    merchant,
    note: null,
    occurredAt: null,
    reportPeriod: null
  };
};
