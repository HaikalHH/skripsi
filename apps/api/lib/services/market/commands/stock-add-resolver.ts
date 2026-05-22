import {
  getMarketQuoteBySymbol,
  isMarketDataError
} from "@/lib/services/market/quote";
import type {
  StockAddResolution,
  StockDraft,
  StockQuestion
} from "@/lib/services/market/commands/portfolio-command.types";
import {
  STOCK_ADD_INTENT_PATTERN,
  STOCK_CORRECTION_QUESTION,
  STOCK_PRICE_QUESTION,
  STOCK_QUANTITY_QUESTION,
  STOCK_SYMBOL_QUESTION,
  STOCK_VALIDATION_UNAVAILABLE_REPLY
} from "@/lib/services/market/commands/stock-command-constants";
import { normalizeSpaces } from "@/lib/services/market/commands/portfolio-formatters";
import { buildStockConversationState } from "@/lib/services/market/commands/stock-conversation-state";
import {
  extractStockDraftFromFreeText,
  mergeStockDraft,
  normalizeStockSymbolCandidate,
  parseStockConfirmation,
  parseStockCorrectionField,
  parseStockPrice,
  parseStockQuantity
} from "@/lib/services/market/commands/stock-draft-parser";
import {
  buildStockAddInput,
  buildStockSummaryReply,
  getStockQuestionText
} from "@/lib/services/market/commands/stock-reply-builder";

const looksLikeStockFollowUpText = (text: string) => {
  const normalized = normalizeSpaces(text);
  if (!normalized) return false;
  if (parseStockConfirmation(normalized) !== null) return true;
  if (parseStockCorrectionField(normalized)) return true;
  if (parseStockQuantity(normalized)) return true;
  if (parseStockPrice(normalized, true)) return true;
  if (normalizeStockSymbolCandidate(normalized)) return true;
  return normalized.split(" ").length <= 4;
};

const validateStockSymbol = async (symbol: string) => {
  try {
    const quote = await getMarketQuoteBySymbol(symbol);
    return { ok: true as const, symbol: quote.symbol.toUpperCase() };
  } catch (error) {
    if (isMarketDataError(error) && error.code === "SYMBOL_NOT_FOUND") {
      return {
        ok: false as const,
        replyText: `Kode saham ${symbol.toUpperCase()} tidak ditemukan, coba cek kembali ya kode sahamnya.`
      };
    }
    return { ok: false as const, replyText: STOCK_VALIDATION_UNAVAILABLE_REPLY };
  }
};

const determineNextStockQuestion = (
  draft: StockDraft
): Exclude<StockQuestion, "CONFIRM" | "CORRECTION"> | null => {
  if (!draft.symbol) return "SYMBOL";
  if (!draft.quantityAmount || !draft.quantityUnit || !draft.quantityShares) return "QUANTITY";
  if (!draft.pricePerUnit) return "PRICE";
  return null;
};

export const tryResolveStockAdd = async (params: {
  userId: string;
  text: string;
  currentMessageId?: string;
}): Promise<StockAddResolution | null> => {
  const text = normalizeSpaces(params.text);
  const directIntent = STOCK_ADD_INTENT_PATTERN.test(text);
  let draft = directIntent ? mergeStockDraft({}, extractStockDraftFromFreeText(text)) : null;
  let lastQuestion: StockQuestion | null = null;

  if (!directIntent) {
    if (!looksLikeStockFollowUpText(text)) return null;
    const conversationState = await buildStockConversationState(params);
    if (!conversationState?.lastQuestion) return null;
    draft = conversationState.draft;
    lastQuestion = conversationState.lastQuestion;
  }

  if (!draft) draft = {};
  if (lastQuestion === "CONFIRM") {
    const confirmation = parseStockConfirmation(text);
    if (confirmation === true) {
      const input = buildStockAddInput(draft);
      if (!input) return null;
      return { handled: true as const, draft, input };
    }
    if (confirmation === false) return { handled: true as const, replyText: STOCK_CORRECTION_QUESTION };
    return {
      handled: true as const,
      replyText: `Balas \`ya\` kalau sudah benar, atau \`tidak\` kalau mau koreksi ya.\n\n${buildStockSummaryReply(draft)}`
    };
  }

  const resolution = await resolveStockDraftStep(text, directIntent, draft, lastQuestion);
  if ("replyText" in resolution) return { handled: true as const, replyText: resolution.replyText };

  const nextQuestion = determineNextStockQuestion(resolution.draft);
  return nextQuestion
    ? { handled: true as const, replyText: getStockQuestionText(nextQuestion) }
    : { handled: true as const, replyText: buildStockSummaryReply(resolution.draft) };
};

const resolveStockDraftStep = async (
  text: string,
  directIntent: boolean,
  draft: StockDraft,
  lastQuestion: StockQuestion | null
): Promise<{ draft: StockDraft } | { replyText: string }> => {
  if (lastQuestion === "CORRECTION") return resolveStockCorrection(text);

  let resolvedDraft = draft;
  if (directIntent || lastQuestion === "SYMBOL") {
    const symbolCandidate = directIntent ? resolvedDraft.symbol ?? null : normalizeStockSymbolCandidate(text);
    if (!symbolCandidate) return { replyText: STOCK_SYMBOL_QUESTION };
    const validation = await validateStockSymbol(symbolCandidate);
    if (!validation.ok) return { replyText: validation.replyText };
    resolvedDraft = mergeStockDraft(resolvedDraft, { symbol: validation.symbol });
  }

  if (lastQuestion === "QUANTITY") {
    const quantity = parseStockQuantity(text);
    if (!quantity) return { replyText: `${STOCK_QUANTITY_QUESTION}\n\nTulis misalnya \`2 lot\` atau \`150 lembar\` ya.` };
    resolvedDraft = mergeStockDraft(resolvedDraft, quantity);
  }
  if (lastQuestion === "PRICE") {
    const pricePerUnit = parseStockPrice(text, true);
    if (!pricePerUnit) return { replyText: `${STOCK_PRICE_QUESTION}\n\nKirim angka rupiahnya ya.` };
    resolvedDraft = mergeStockDraft(resolvedDraft, { pricePerUnit });
  }

  return { draft: resolvedDraft };
};

const resolveStockCorrection = (text: string) => {
  const correctionField = parseStockCorrectionField(text);
  if (!correctionField) {
    return { replyText: `${STOCK_CORRECTION_QUESTION}\n\nBalas salah satu: kode saham, jumlah, atau harga saat dicatat.` };
  }
  return { replyText: getStockQuestionText(correctionField) };
};
