import { loadRecentConversationTurns } from "@/lib/services/assistant/conversation-memory-service";
import type {
  StockConversationState,
  StockDraft,
  StockQuestion
} from "@/lib/services/market/commands/portfolio-command.types";
import { STOCK_ADD_INTENT_PATTERN } from "@/lib/services/market/commands/stock-command-constants";
import { normalizeSpaces } from "@/lib/services/market/commands/portfolio-formatters";
import {
  detectStockQuestion,
  extractStockDraftFromFreeText,
  mergeStockDraft,
  normalizeStockSymbolCandidate,
  parseStockPrice,
  parseStockQuantity
} from "@/lib/services/market/commands/stock-draft-parser";

const isStockSuccessMessage = (text: string) =>
  /^\u2705?\s*Saham berhasil dicatat:/i.test(normalizeSpaces(text));

export const buildStockConversationState = async (params: {
  userId: string;
  currentMessageId?: string;
}): Promise<StockConversationState | null> => {
  const recentTurns = await loadRecentConversationTurns({
    userId: params.userId,
    currentMessageId: params.currentMessageId,
    limit: 12
  });
  if (!recentTurns.length) return null;

  let draft: StockDraft | null = null;
  let lastQuestion: StockQuestion | null = null;

  for (const turn of [...recentTurns].reverse()) {
    if (turn.role === "assistant") {
      if (isStockSuccessMessage(turn.text)) {
        draft = null;
        lastQuestion = null;
        continue;
      }

      const question = detectStockQuestion(turn.text);
      if (question) {
        draft = draft ?? {};
        lastQuestion = question;
      }
      continue;
    }

    if (STOCK_ADD_INTENT_PATTERN.test(turn.text)) {
      draft = mergeStockDraft(draft ?? {}, extractStockDraftFromFreeText(turn.text));
      lastQuestion = null;
      continue;
    }

    if (!draft || !lastQuestion) continue;
    if (lastQuestion === "SYMBOL") {
      const symbol = normalizeStockSymbolCandidate(turn.text);
      if (symbol) draft = mergeStockDraft(draft, { symbol });
      continue;
    }
    if (lastQuestion === "QUANTITY") {
      const quantity = parseStockQuantity(turn.text);
      if (quantity) draft = mergeStockDraft(draft, quantity);
      continue;
    }
    if (lastQuestion === "PRICE") {
      const pricePerUnit = parseStockPrice(turn.text, true);
      if (pricePerUnit) draft = mergeStockDraft(draft, { pricePerUnit });
    }
  }

  if (!draft) return null;
  return { draft, lastQuestion };
};
