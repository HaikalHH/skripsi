import {
  buildAdvicePrompt,
  buildExtractionPrompt,
  buildInsightPrompt,
  extractJsonObject,
  geminiExtractionSchema
} from "@finance/shared";
import { z } from "zod";
import { env } from "../env";

const insightSchema = z.object({
  insightText: z.string().min(1)
});

const normalizeModelName = (model: string) => model.trim().replace(/^models\//, "");

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
  const modelCandidates = getModelCandidates();

  for (const model of modelCandidates) {
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
        continue;
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
