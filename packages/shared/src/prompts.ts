import type { ReportPeriod } from "./types";

export const buildExtractionPrompt = (input: string, nowIso: string) => `
You are a finance assistant parser.
Current datetime (ISO-8601): ${nowIso}

Task:
1) Classify intent from user message.
2) If intent is RECORD_TRANSACTION, extract transaction fields.
3) If intent is REQUEST_REPORT, infer reportPeriod when possible.
4) If intent is REQUEST_FINANCIAL_ADVICE, copy the original question into adviceQuery.

Allowed intent values:
- RECORD_TRANSACTION
- REQUEST_REPORT
- REQUEST_INSIGHT
- REQUEST_FINANCIAL_ADVICE
- HELP
- UNKNOWN

Rules:
- Return STRICT JSON only.
- No markdown, no explanation.
- Keep keys exactly:
  {
    "intent": string,
    "type": "INCOME"|"EXPENSE"|null,
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
- For advice questions (financial health, affordability, spending decision), set intent=REQUEST_FINANCIAL_ADVICE and set adviceQuery.

User input:
${input}
`.trim();

export const buildInsightPrompt = (summary: string) => `
You are a concise personal finance advisor.
Given summary data, produce 3 short practical insights.
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

Return STRICT JSON only:
{
  "insightText": "string"
}

User question:
${params.userQuestion}

Financial snapshot:
${params.financialSnapshot}
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
