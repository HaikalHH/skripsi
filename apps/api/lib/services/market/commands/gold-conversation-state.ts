import { loadRecentConversationTurns } from "@/lib/services/assistant/conversation-memory-service";
import type {
  GoldConversationState,
  GoldDraft,
  GoldQuestion
} from "@/lib/services/market/commands/portfolio-command.types";
import { GOLD_ADD_INTENT_PATTERN } from "@/lib/services/market/commands/gold-command-constants";
import { normalizeSpaces } from "@/lib/services/market/commands/portfolio-formatters";
import {
  applyGoldDraftInferences,
  mergeGoldDraft
} from "@/lib/services/market/commands/gold-draft-normalizers";
import {
  detectGoldQuestion,
  extractGoldDraftFromAnswer,
  extractGoldDraftFromFreeText
} from "@/lib/services/market/commands/gold-draft-parser";

const isGoldConfirmationMessage = (text: string) =>
  /^\u2705?\s*Aset berhasil dicatat:/i.test(normalizeSpaces(text));

export const buildGoldConversationState = async (params: {
  userId: string;
  currentMessageId?: string;
}): Promise<GoldConversationState | null> => {
  const recentTurns = await loadRecentConversationTurns({
    userId: params.userId,
    currentMessageId: params.currentMessageId,
    limit: 12
  });
  if (!recentTurns.length) return null;

  let draft: GoldDraft | null = null;
  let lastQuestion: GoldQuestion | null = null;

  for (const turn of [...recentTurns].reverse()) {
    if (turn.role === "assistant") {
      if (isGoldConfirmationMessage(turn.text)) {
        draft = null;
        lastQuestion = null;
        continue;
      }

      const question = detectGoldQuestion(turn.text);
      if (question) {
        draft = draft ?? {};
        lastQuestion = question;
      }
      continue;
    }

    if (GOLD_ADD_INTENT_PATTERN.test(turn.text)) {
      draft = applyGoldDraftInferences(extractGoldDraftFromFreeText(turn.text));
      lastQuestion = null;
      continue;
    }

    if (!draft) continue;
    const resolution = extractGoldDraftFromAnswer(turn.text, lastQuestion);
    draft = mergeGoldDraft(draft, resolution.update);
  }

  if (!draft) return null;
  return { draft, lastQuestion };
};
