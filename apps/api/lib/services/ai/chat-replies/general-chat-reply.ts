import { extractJsonObject } from "@finance/shared";
import { z } from "zod";
import { callGemini } from "@/lib/services/ai/gemini";
import { applyBossFinanceEmojiStyle } from "@/lib/services/messaging/bot-style";

const generalChatSchema = z.object({
  replyText: z.string().min(1)
});

const CONTEXTUAL_EMOJI_STYLE_GUIDE = `
Style:
- Do not add emojis automatically.
- Only keep an emoji if it is explicitly part of fixed product copy supplied in context.
- Keep the tone premium, calm, and practical.
`.trim();

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

${CONTEXTUAL_EMOJI_STYLE_GUIDE}

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
  return applyBossFinanceEmojiStyle(generalChatSchema.parse(parsed).replyText);
};
