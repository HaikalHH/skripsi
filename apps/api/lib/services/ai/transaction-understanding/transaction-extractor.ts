import {
  buildExtractionPrompt,
  extractJsonObject,
  geminiExtractionSchema
} from "@finance/shared";
import { callGemini } from "@/lib/services/ai/gemini";

export const extractIntentAndTransaction = async (rawInput: string) => {
  const prompt = buildExtractionPrompt(rawInput, new Date().toISOString());
  const output = await callGemini(prompt);
  const parsed = extractJsonObject(output);
  return geminiExtractionSchema.parse(parsed);
};
