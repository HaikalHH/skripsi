import { parsePositiveAmount } from "@/lib/services/transactions/amount";
import type { CashflowForecastHorizon, CashflowForecastMode, CashflowForecastQuery } from "./types";

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

const hasAnyPhrase = (text: string, phrases: string[]) => phrases.some((phrase) => text.includes(phrase));

const PAYDAY_TERMS = [
  "gajian",
  "gaji lagi",
  "tanggal gajian",
  "tgl gajian",
  "payday",
  "gaji berikutnya"
];

const MONTH_END_TERMS = [
  "akhir bulan",
  "ujung bulan",
  "sampai bulan habis",
  "sampe bulan habis",
  "sampai bulan kelar",
  "sampe bulan kelar",
  "sampai bulan ganti",
  "sampe bulan ganti",
  "end of month",
  "bulan ini kelar"
];

const NEXT_WEEK_TERMS = [
  "minggu depan",
  "pekan depan",
  "7 hari ke depan",
  "7 hari lagi",
  "sepekan ke depan",
  "seminggu ke depan",
  "satu minggu ke depan"
];

const WEEKEND_TERMS = ["weekend", "akhir pekan", "ujung pekan", "akhir minggu", "sabtu minggu"];
const TOMORROW_TERMS = ["besok", "tomorrow"];
const CONDITIONAL_TERMS = ["kalau", "jika", "misalnya", "misal", "andaikan", "seandainya"];
const SCENARIO_EXPENSE_TERMS = [
  "bayar",
  "beli",
  "belanja",
  "keluarin",
  "keluar",
  "transfer",
  "spend",
  "bayarin",
  "top up",
  "topup",
  "makan",
  "jajan",
  "ngopi",
  "cicilan",
  "tagihan"
];

const SAFETY_TERMS = [
  "aman",
  "cukup",
  "kuat",
  "survive",
  "bertahan",
  "tekor",
  "minus",
  "boncos",
  "nombok",
  "seret",
  "habis sebelum"
];

const REMAINING_TERMS = [
  "sisa berapa",
  "sisa uang",
  "tinggal berapa",
  "masih ada berapa",
  "remain",
  "remaining",
  "kira kira sisa",
  "estimasi sisa"
];

const SCENARIO_STRIP_PATTERN =
  /\b(?:buat|untuk|yang|biar|supaya|nanti|dulu|aja|saja|doang|masih|aman|cukup|kuat|gimana|gmn|berapa|sisa|uang|ini|itu|besok|tomorrow|weekend|akhir|pekan|minggu|sampe|sampai|bulan|gajian|ga|gak|nggak|tidak)\b/gi;

const parseScenarioExpense = (rawText: string) => {
  const normalized = normalizeText(rawText);
  if (!hasAnyPhrase(normalized, CONDITIONAL_TERMS) || !hasAnyPhrase(normalized, SCENARIO_EXPENSE_TERMS)) {
    return {};
  }

  const verbPattern = SCENARIO_EXPENSE_TERMS.map((term) => term.replace(/\s+/g, "\\s+")).join("|");
  const segmentMatch = normalized.match(new RegExp(`\\b(?:${verbPattern})\\b\\s+(.+)`, "i"));
  const segment = segmentMatch?.[1] ?? normalized;
  const amountMatch = segment.match(/(?:rp\.?\s*)?(\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?)/i);
  if (!amountMatch) return {};

  const scenarioExpenseAmount = parsePositiveAmount(amountMatch[1]);
  if (!scenarioExpenseAmount) return {};

  const scenarioExpenseLabel = segment
    .replace(amountMatch[0], " ")
    .replace(SCENARIO_STRIP_PATTERN, " ")
    .replace(/[?.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    scenarioExpenseAmount,
    scenarioExpenseLabel: scenarioExpenseLabel || "pengeluaran tambahan"
  };
};

export const parseCashflowForecastQuery = (rawText: string): CashflowForecastQuery | null => {
  const text = normalizeText(rawText);
  if (!text) return null;

  const horizon: CashflowForecastHorizon | null = hasAnyPhrase(text, PAYDAY_TERMS)
    ? "PAYDAY"
    : hasAnyPhrase(text, MONTH_END_TERMS)
      ? "MONTH_END"
      : hasAnyPhrase(text, NEXT_WEEK_TERMS)
        ? "NEXT_7_DAYS"
        : hasAnyPhrase(text, WEEKEND_TERMS)
          ? "WEEKEND"
          : hasAnyPhrase(text, TOMORROW_TERMS)
            ? "TOMORROW"
            : null;

  if (!horizon) return null;

  const mode: CashflowForecastMode = hasAnyPhrase(text, REMAINING_TERMS) ? "REMAINING" : "SAFETY";
  const looksLikeForecast =
    hasAnyPhrase(text, SAFETY_TERMS) ||
    hasAnyPhrase(text, REMAINING_TERMS) ||
    /\b(gimana|gmn|berapa|ga|gak|nggak|tidak)\b/i.test(text) ||
    /\b(kalau pola sekarang|dengan pola sekarang|kalau begini terus)\b/i.test(text);

  if (!looksLikeForecast) return null;

  return {
    horizon,
    mode,
    ...parseScenarioExpense(rawText)
  };
};
