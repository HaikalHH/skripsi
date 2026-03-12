import type { GeminiExtraction } from "@finance/shared";
import { parsePositiveAmount } from "@/lib/services/transactions/amount-parser";
import { normalizeDetectedMerchant } from "@/lib/services/transactions/merchant-normalization-service";

const INCOME_HINTS = [
  /\bgaji\b/i,
  /\bsalary\b/i,
  /\bpendapatan\b/i,
  /\bpemasukan\b/i,
  /\bincome\b/i,
  /\bbonus\b/i,
  /\bkomisi\b/i,
  /\binsentif\b/i,
  /\bmasuk\b/i,
  /\bnabung\b/i,
  /\btabungan\b/i
];

const EXPENSE_HINTS = [
  /\bbeli\b/i,
  /\bbayar\b/i,
  /\bbelanja\b/i,
  /\bmakan\b/i,
  /\bngopi\b/i,
  /\bkopi\b/i,
  /\bexpense\b/i,
  /\bpengeluaran\b/i,
  /\bkeluar\b/i,
  /\bjajan\b/i,
  /\bspend\b/i
];

const countMatches = (text: string, patterns: RegExp[]) =>
  patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);

const extractAmountPhrase = (text: string): string | null => {
  const withUnit = text.match(/\brp\.?\s*\d[\d.,]*\s*(?:jt|juta|rb|ribu|k)\b|\b\d[\d.,]*\s*(?:jt|juta|rb|ribu|k)\b/i);
  if (withUnit) return withUnit[0];

  const withRp = text.match(/\brp\.?\s*\d[\d.,]+\b/i);
  if (withRp) return withRp[0];

  const plainDigits = text.match(/\b\d{3,}\b/);
  if (plainDigits) return plainDigits[0];

  return null;
};

const detectIncomeCategory = (text: string) => {
  if (/\b(nabung|tabungan|saving)\b/i.test(text)) return "Savings";
  if (/\b(gaji|salary|payroll)\b/i.test(text)) return "Salary";
  if (/\b(bonus|thr|insentif|komisi)\b/i.test(text)) return "Bonus";
  if (/\b(freelance|project|proyek|client)\b/i.test(text)) return "Freelance";
  return "Other Income";
};

const detectExpenseCategory = (text: string) => {
  if (/\b(makan|minum|kopi|ngopi|coffee|resto|restoran|warung|sarapan|lunch|dinner|snack|cemilan)\b/i.test(text)) {
    return "Food & Drink";
  }
  if (/\b(groceries|grocery|sembako|belanja dapur|sayur|buah|beras|lauk)\b/i.test(text)) {
    return "Groceries";
  }
  if (/\b(transport|bensin|bbm|tol|parkir|ojek|ojol|gojek|grab|taxi|taksi|kereta|krl|mrt|lrt|bus|transjakarta)\b/i.test(text)) {
    return "Transport";
  }
  if (/\b(listrik|air|internet|pulsa|token|tagihan|bill|wifi|pdam|gas|sewa|kontrakan|kost|cicilan|kredit|angsuran|asuransi|bpjs)\b/i.test(text)) {
    return "Bills";
  }
  if (/\b(dokter|klinik|rumah sakit|hospital|apotek|obat|medical|kesehatan)\b/i.test(text)) {
    return "Health";
  }
  if (/\b(sekolah|kuliah|kampus|spp|les|kursus|tuition|pendidikan)\b/i.test(text)) {
    return "Education";
  }
  if (/\b(belanja|shopping|toko|market|mart|alfamart|indomaret|shopee|tokopedia|fashion|baju|pakaian|skincare|kosmetik|elektronik|gadget)\b/i.test(text)) {
    return "Shopping";
  }
  if (/\b(netflix|spotify|bioskop|cinema|movie|film|game|gaming|steam|playstation|ps5|xbox|konser|hobi|nongkrong|hangout)\b/i.test(text)) {
    return "Entertainment";
  }
  if (/\b(liburan|travel|traveling|hotel|tiket|pesawat)\b/i.test(text)) {
    return "Travel";
  }
  if (/\b(donasi|zakat|amal|sedekah|charity)\b/i.test(text)) {
    return "Charity";
  }
  if (/\b(istri|suami|anak|ortu|orang tua|keluarga)\b/i.test(text)) {
    return "Family";
  }
  return "General Expense";
};

export const parseFallbackTransactionExtraction = (rawText: string): GeminiExtraction | null => {
  const text = rawText.trim();
  if (!text || text.includes("?")) return null;

  const amountPhrase = extractAmountPhrase(text);
  if (!amountPhrase) return null;

  const amount = parsePositiveAmount(amountPhrase);
  if (!amount) return null;

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
    reportPeriod: null,
    adviceQuery: null
  };
};
