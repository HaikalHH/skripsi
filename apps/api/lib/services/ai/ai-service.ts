import {
  buildAdvicePrompt,
  buildExtractionPrompt,
  buildInsightPrompt,
  buildOnboardingAnswerCanonicalizationPrompt,
  buildSemanticCanonicalizationPrompt,
  extractJsonObject,
  geminiExtractionSchema
} from "@finance/shared";
import { z } from "zod";
import { env } from "@/lib/env";

const insightSchema = z.object({
  insightText: z.string().min(1)
});

const generalChatSchema = z.object({
  replyText: z.string().min(1)
});

const semanticCanonicalizationSchema = z.object({
  normalizedText: z.string().min(1).max(500).nullable()
});

const GEMINI_MAX_RETRIES = 3;

export class GeminiRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiRateLimitError";
  }
}

export const isGeminiRateLimitError = (error: unknown): error is GeminiRateLimitError =>
  error instanceof GeminiRateLimitError;

const normalizeModelName = (model: string) => model.trim().replace(/^models\//, "");

const isRetryableGeminiStatus = (status: number) => status === 429 || status === 503;

const sleep = async (ms: number) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const getRetryDelayMs = (attempt: number, retryAfterHeader: string | null): number => {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(10_000, Math.round(seconds * 1000));
    }
  }

  const base = 400 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 150);
  return Math.min(5_000, base + jitter);
};

const getModelCandidates = (): string[] => {
  const rawCandidates = [
    env.GEMINI_MODEL,
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash-latest",
    "gemini-flash-latest"
  ];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of rawCandidates) {
    const normalized = normalizeModelName(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
};

const callGemini = async (prompt: string): Promise<string> => {
  let lastNotFoundError = "";
  let lastRateLimitError = "";
  const modelCandidates = getModelCandidates();

  for (const model of modelCandidates) {
    for (let attempt = 0; attempt < GEMINI_MAX_RETRIES; attempt += 1) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        if (response.status === 404) {
          lastNotFoundError = `${model}: ${errorBody}`;
          break;
        }

        if (isRetryableGeminiStatus(response.status)) {
          lastRateLimitError = `${model}: ${response.status} ${errorBody}`;
          const hasMoreAttempt = attempt < GEMINI_MAX_RETRIES - 1;
          if (hasMoreAttempt) {
            const delayMs = getRetryDelayMs(attempt, response.headers.get("retry-after"));
            await sleep(delayMs);
            continue;
          }

          break;
        }

        throw new Error(`Gemini API error: ${response.status} ${errorBody}`);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text ?? "")
        .join("")
        .trim();

      if (!text) {
        throw new Error("Gemini output is empty");
      }

      return text;
    }
  }

  if (lastRateLimitError) {
    throw new GeminiRateLimitError(
      `Gemini API temporarily unavailable due to quota/rate limit. Last=${lastRateLimitError}`
    );
  }

  throw new Error(
    `Gemini API error: no supported model for generateContent. Tried models=${modelCandidates.join(
      ", "
    )}. Last 404=${lastNotFoundError}`
  );
};

export const extractIntentAndTransaction = async (rawInput: string) => {
  const prompt = buildExtractionPrompt(rawInput, new Date().toISOString());
  const output = await callGemini(prompt);
  const parsed = extractJsonObject(output);
  return geminiExtractionSchema.parse(parsed);
};

export const generateAIInsight = async (summaryText: string) => {
  const prompt = buildInsightPrompt(summaryText);
  const output = await callGemini(prompt);
  const parsed = extractJsonObject(output);
  return insightSchema.parse(parsed).insightText;
};

export const generateAIFinancialAdvice = async (params: {
  userQuestion: string;
  financialSnapshot: string;
}) => {
  const prompt = buildAdvicePrompt({
    nowIso: new Date().toISOString(),
    userQuestion: params.userQuestion,
    financialSnapshot: params.financialSnapshot
  });
  const output = await callGemini(prompt);
  const parsed = extractJsonObject(output);
  return insightSchema.parse(parsed).insightText;
};

export const generateGroundedGeneralChatReply = async (params: {
  userMessage: string;
  appCapabilities: string;
  userContext: string;
  recentMessages: string[];
}) => {
  const prompt = `
You are a WhatsApp AI Finance Assistant.

Your job:
- Reply in natural Indonesian.
- Stay grounded to the product capabilities and provided user context only.
- You may help with:
  1. explaining how to use the finance assistant
  2. clarifying which feature matches the user's request
  3. general personal finance guidance that does NOT require unavailable personal data
  4. asking one concise clarifying question if the user's meaning is ambiguous
- If data/context is insufficient, explicitly say that you do not have enough data yet.
- If the request is outside finance assistant scope, say so politely and steer back to supported finance tasks.

Hard safety rules:
- Do NOT invent balances, transactions, budgets, goals, asset values, news, prices, or portfolio status.
- Do NOT claim an action was completed unless it is explicitly stated in the provided context.
- Do NOT hallucinate hidden context.
- If unsure, say what is missing and suggest the closest supported action.
- Keep the answer concise, practical, and conversational.
- Maximum 4 short sentences.

Return STRICT JSON only:
{
  "replyText": "string"
}

App capabilities:
${params.appCapabilities}

User context:
${params.userContext}

Recent inbound messages:
${params.recentMessages.length ? params.recentMessages.map((item, index) => `${index + 1}. ${item}`).join("\n") : "- none"}

Current user message:
${params.userMessage}
  `.trim();

  const output = await callGemini(prompt);
  const parsed = extractJsonObject(output);
  return generalChatSchema.parse(parsed).replyText;
};

export const canonicalizeSupportedFinanceMessage = async (params: {
  userMessage: string;
  recentMessages: string[];
}) => {
  const prompt = buildSemanticCanonicalizationPrompt({
    userMessage: params.userMessage,
    recentMessages: params.recentMessages
  });
  const output = await callGemini(prompt);
  const parsed = extractJsonObject(output);
  return semanticCanonicalizationSchema.parse(parsed).normalizedText;
};

export const canonicalizeOnboardingAnswer = async (params: {
  stepKey: string;
  questionTitle: string;
  questionBody: string;
  inputType: string;
  rawAnswer: string;
  options?: Array<{ value: string; label: string }>;
}) => {
  const prompt = buildOnboardingAnswerCanonicalizationPrompt(params);
  const output = await callGemini(prompt);
  const parsed = extractJsonObject(output);
  return semanticCanonicalizationSchema.parse(parsed).normalizedText;
};
