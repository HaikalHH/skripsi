import type {
  GoldAddResolution,
  GoldDraft,
  GoldQuestion
} from "@/lib/services/market/commands/portfolio-command.types";
import { GOLD_ADD_INTENT_PATTERN } from "@/lib/services/market/commands/gold-command-constants";
import {
  normalizeSpaces
} from "@/lib/services/market/commands/portfolio-formatters";
import {
  applyGoldDraftInferences,
  detectKnownGoldBrand,
  detectKnownGoldPlatform,
  detectSingleMenuChoice,
  hasGoldDraftFields,
  mergeGoldDraft
} from "@/lib/services/market/commands/gold-draft-normalizers";
import {
  extractGoldDraftFromAnswer,
  extractGoldDraftFromFreeText
} from "@/lib/services/market/commands/gold-draft-parser";
import { buildGoldAddInput, getGoldQuestionText } from "@/lib/services/market/commands/gold-reply-builder";
import { buildGoldConversationState } from "@/lib/services/market/commands/gold-conversation-state";

const looksLikeGoldFollowUpText = (text: string) => {
  const normalized = normalizeSpaces(text);
  if (!normalized) return false;
  if (detectSingleMenuChoice(normalized) != null) return true;
  if (/\b(?:gram|gr|karat|per\s*gram|total|harga|batangan|perhiasan|digital)\b/i.test(normalized)) return true;
  if (detectKnownGoldBrand(normalized) || detectKnownGoldPlatform(normalized)) return true;
  return normalized.split(" ").length <= 4;
};

const determineNextGoldQuestion = (draft: GoldDraft): GoldQuestion | null => {
  if (!draft.assetType) return "TYPE";
  if (draft.assetType === "BATANGAN") {
    if (!draft.brand) return "BRAND";
    if (!draft.quantityGram) return "WEIGHT";
  }
  if (draft.assetType === "PERHIASAN") {
    if (!draft.quantityGram) return "WEIGHT";
    if (!draft.karat) return "KARAT";
  }
  if (draft.assetType === "DIGITAL") {
    if (!draft.quantityGram) return "DIGITAL_WEIGHT";
    if (!draft.platform) return "PLATFORM";
  }
  if (!draft.priceAmount) return "PRICE";
  if (!draft.priceMode) return "PRICE_MODE";
  return null;
};

export const tryResolveGoldAdd = async (params: {
  userId: string;
  text: string;
  currentMessageId?: string;
}): Promise<GoldAddResolution | null> => {
  const text = normalizeSpaces(params.text);
  const directIntent = GOLD_ADD_INTENT_PATTERN.test(text);
  let draft = directIntent ? applyGoldDraftInferences(extractGoldDraftFromFreeText(text)) : null;

  if (!directIntent) {
    if (!looksLikeGoldFollowUpText(text)) return null;
    const conversationState = await buildGoldConversationState(params);
    if (!conversationState?.lastQuestion) return null;

    const resolution = extractGoldDraftFromAnswer(text, conversationState.lastQuestion);
    if (!resolution.promptOverride && !hasGoldDraftFields(resolution.update)) return null;
    if (resolution.promptOverride) {
      return { handled: true as const, replyText: getGoldQuestionText(resolution.promptOverride) };
    }
    draft = mergeGoldDraft(conversationState.draft, resolution.update);
  }

  if (!draft || (!directIntent && !hasGoldDraftFields(draft))) return null;
  const nextQuestion = determineNextGoldQuestion(draft);
  if (nextQuestion) return { handled: true as const, replyText: getGoldQuestionText(nextQuestion) };

  const input = buildGoldAddInput(draft);
  return input ? { handled: true as const, draft, input } : null;
};
