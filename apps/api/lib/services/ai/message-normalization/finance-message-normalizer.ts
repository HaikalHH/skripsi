import {
  buildSemanticCanonicalizationPrompt,
  extractJsonObject
} from "@finance/shared";
import { z } from "zod";
import { callGemini } from "@/lib/services/ai/gemini";

const semanticCanonicalizationSchema = z.object({
  normalizedText: z.string().min(1).max(500).nullable()
});

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
