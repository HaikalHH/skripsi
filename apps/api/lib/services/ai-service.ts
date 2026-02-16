import {
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

const callGemini = async (prompt: string): Promise<string> => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
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
