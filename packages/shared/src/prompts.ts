import type { ReportPeriod } from "./types";

export const buildExtractionPrompt = (input: string, nowIso: string) => `
You are a finance assistant parser.
Current datetime (ISO-8601): ${nowIso}

Task:
1) Classify intent from user message.
2) If intent is RECORD_TRANSACTION, extract transaction fields.
3) If intent is REQUEST_REPORT, infer reportPeriod when possible.

Allowed intent values:
- RECORD_TRANSACTION
- REQUEST_REPORT
- HELP
- UNKNOWN

Interpretation guidance (important):
- User text can be informal, short, typo-prone, mixed Indonesian-English.
- For transaction phrases, prioritize semantic intent over exact keywords.
- Handle shorthand amounts: "5jt", "2,5 juta", "750rb", "25 ribu", "1.500.000", "Rp 300.000".
- Typical income context: salary/gaji, bonus, transfer masuk, pendapatan, pemasukan, komisi.
- Typical expense context: beli, bayar, belanja, makan, topup, ongkir, tagihan, langganan.
- Typical saving context: nabung, menabung, tabung, setor tabungan, simpan, saving.
- If user clearly states a monetary transaction, set intent=RECORD_TRANSACTION even if sentence is casual.
- If there is no clear transaction/report/help meaning, set intent=UNKNOWN.
- If amount exists but transaction direction is ambiguous, infer the most likely direction from sentence context.
- For saving transactions, set type=SAVING, category="Tabungan", and merchant="Tabungan Pribadi" unless a clearer merchant/context is explicitly provided.

Rules:
- Return STRICT JSON only.
- No markdown, no explanation.
- Keep keys exactly:
  {
    "intent": string,
    "type": "INCOME"|"EXPENSE"|"SAVING"|null,
    "amount": number|null,
    "category": string|null,
    "merchant": string|null,
    "note": string|null,
    "occurredAt": ISO8601 string with timezone|null,
    "reportPeriod": "daily"|"weekly"|"monthly"|null,
    "adviceQuery": string|null
  }
- If unsure, use null for fields.
- For reports, set intent=REQUEST_REPORT and set reportPeriod.

Examples:
Input: "gaji masuk 5 juta"
Output: {"intent":"RECORD_TRANSACTION","type":"INCOME","amount":5000000,"category":"Salary","merchant":null,"note":null,"occurredAt":null,"reportPeriod":null,"adviceQuery":null}

Input: "beli kopi 25 ribu"
Output: {"intent":"RECORD_TRANSACTION","type":"EXPENSE","amount":25000,"category":"Food & Drink","merchant":"Coffee Shop","note":null,"occurredAt":null,"reportPeriod":null,"adviceQuery":null}

Input: "nabung 500 ribu"
Output: {"intent":"RECORD_TRANSACTION","type":"SAVING","amount":500000,"category":"Tabungan","merchant":"Tabungan Pribadi","note":null,"occurredAt":null,"reportPeriod":null,"adviceQuery":null}

Input: "laporan minggu ini"
Output: {"intent":"REQUEST_REPORT","type":null,"amount":null,"category":null,"merchant":null,"note":null,"occurredAt":null,"reportPeriod":"weekly","adviceQuery":null}

User input:
${input}
`.trim();

export const buildInsightPrompt = (summary: string) => `
You are a concise personal finance advisor.
Given summary data, produce 3 short practical insights.
The summary can include onboarding profile, budget buckets, detailed expense labels
such as "spotify:50000->entertainment", goals, and assets. Use them when relevant.
Return STRICT JSON only with:
{
  "insightText": "string"
}

Summary:
${summary}
`.trim();

export const buildAdvicePrompt = (params: {
  nowIso: string;
  userQuestion: string;
  financialSnapshot: string;
}) => `
You are a practical personal finance advisor.
Current datetime (ISO-8601): ${params.nowIso}

Task:
- Answer the user's question with concise Indonesian text.
- Include exactly three sections in one paragraph:
  1) Deskriptif (current condition)
  2) Diagnostik (main cause/risk)
  3) Preskriptif (clear action recommendation)
- Keep the tone conversational and concrete.
- Do not promise certainty. Use prudent language.
- The financial snapshot can include onboarding-derived details, budget buckets,
  goals, assets, and expense labels like "spotify:50000->entertainment".
  Use those details if they help answer the question.

Return STRICT JSON only:
{
  "insightText": "string"
}

User question:
${params.userQuestion}

Financial snapshot:
${params.financialSnapshot}
`.trim();

export const buildSemanticCanonicalizationPrompt = (params: {
  userMessage: string;
  recentMessages: string[];
}) => `
You are a semantic command normalizer for a WhatsApp AI Finance Assistant.

Goal:
- Read the user's natural message.
- If it clearly matches a supported finance-assistant feature, rewrite it into ONE short canonical Indonesian command/query that preserves the same intent.
- If it does not clearly map to a supported product capability, return null.

Important rules:
- Do not invent numbers, merchants, dates, categories, or facts that are not in the message.
- Keep the meaning as close as possible.
- Prefer canonical queries that existing backend handlers can understand.
- User phrasing may be casual, typo-prone, slangy, indirect, rhetorical, or mixed Indonesian-English.
- You may normalize "nongkrong" to entertainment, "tagihan internet" to bills, "aman sampai gajian" to cashflow forecast, etc.
- If the user is just chatting casually, asking something out of scope, or the meaning is too ambiguous, return null.

Supported command families and examples:
- transactions:
  - "beli kopi 25 ribu"
  - "gaji masuk 5 juta"
  - "nabung 500 ribu"
  - "bayar listrik 450rb"
- transaction mutation:
  - "hapus transaksi terakhir"
  - "ubah listrik tadi jadi 450 ribu"
- budgeting:
  - "budget makan 2 juta per bulan"
  - "limit nongkrong 800 ribu"
- goals:
  - "mau nabung 50 juta"
  - "status tabungan aku gimana"
- onboarding / profile:
  - "aku siap mulai"
  - "aku karyawan sambil usaha"
  - "belum punya budget, tolong bikinin"
- cashflow forecast:
  - "aman sampai gajian gak"
  - "akhir bulan sisa berapa"
  - "minggu depan aman gak"
- reports and analytics:
  - "laporan bulan ini"
  - "detail entertainment bulan ini apa saja"
  - "spotify bulan ini total berapa"
  - "merchant entertainment paling sering bulan ini"
  - "kenapa bills naik bulan ini"
  - "kategori mana yang paling naik dibanding bulan lalu"
  - "top recurring expense bulan ini"
- detail and merchant analytics:
  - "apa aja isi entertainment bulan ini"
  - "spotify nyumbang berapa persen"
  - "merchant mana yang paling bikin spending naik"
- portfolio and market:
  - "portfolio aku gimana"
  - "tambah saham bbca 10 lot harga 9000"
  - "btc sekarang berapa"
- finance news:
  - "berita finance hari ini"
  - "berita tentang aset aku"
Return STRICT JSON only:
{
  "normalizedText": "string | null"
}

Recent user messages:
${params.recentMessages.length ? params.recentMessages.map((item, index) => `${index + 1}. ${item}`).join("\n") : "- none"}

Current user message:
${params.userMessage}
`.trim();

export const buildOnboardingAnswerCanonicalizationPrompt = (params: {
  stepKey: string;
  questionTitle: string;
  questionBody: string;
  inputType: string;
  rawAnswer: string;
  options?: Array<{ value: string; label: string }>;
}) => `
You are a semantic onboarding answer normalizer for a WhatsApp AI Finance Assistant.

Goal:
- Read the user's freeform reply for the current onboarding step.
- If the reply clearly maps to a valid onboarding answer, rewrite it into ONE short canonical Indonesian answer string that the backend can parse.
- If the meaning is still unclear, return null.

Important rules:
- Do not invent numbers, categories, dates, assets, goals, or profile facts.
- Preserve the user's meaning as closely as possible.
- If this is a single-select or multi-select question, prefer returning the exact option label text when possible.
- For yes/no style onboarding questions, normalize to either "Ada" or "Ga ada".
- For skip intent, normalize to "skip".
- For multi-select employment answers, you may return a comma-separated list such as "Karyawan, Pengusaha".
- For money/integer/decimal answers, return a concise answer that keeps only the essential value, for example "3 juta", "25", or "10.5".
- For manual expense breakdown, you may rewrite into simple lines like "Makan: 1000000" if the categories and amounts are clearly present.
- If the answer is out of scope, too ambiguous, or still not enough, return null.

Return STRICT JSON only:
{
  "normalizedText": "string | null"
}

Current onboarding step:
- stepKey: ${params.stepKey}
- title: ${params.questionTitle}
- inputType: ${params.inputType}

Current question:
${params.questionBody}

Supported options for this step:
${params.options?.length ? params.options.map((option, index) => `${index + 1}. ${option.label}`).join("\n") : "- none"}

User answer:
${params.rawAnswer}
`.trim();

export const buildReportSummaryText = (
  period: ReportPeriod,
  income: number,
  expense: number
) => {
  const balance = income - expense;
  return `Report ${period}: income ${income.toFixed(2)}, expense ${expense.toFixed(
    2
  )}, balance ${balance.toFixed(2)}.`;
};
