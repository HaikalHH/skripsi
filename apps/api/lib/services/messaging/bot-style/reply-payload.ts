import { applyBossFinanceEmojiStyle } from "./emoji-style";

export const styleBotReplyPayload = <
  T extends {
    replyText?: unknown;
    replyTexts?: unknown;
  }
>(
  body: T
): T => {
  const styledReplyText =
    typeof body.replyText === "string" ? applyBossFinanceEmojiStyle(body.replyText) : body.replyText;
  const styledReplyTexts = Array.isArray(body.replyTexts)
    ? body.replyTexts.map((item) =>
      typeof item === "string" ? applyBossFinanceEmojiStyle(item) : item
    )
    : body.replyTexts;

  return {
    ...body,
    replyText: styledReplyText,
    replyTexts: styledReplyTexts
  };
};
