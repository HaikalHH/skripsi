import { describe, expect, it } from "vitest";
import {
  applyBossFinanceEmojiStyle,
  styleBotReplyPayload
} from "@/lib/services/messaging/bot-style";

describe("bot text emoji styling", () => {
  it("does not inject contextual emojis into plain text", () => {
    expect(applyBossFinanceEmojiStyle("Cashflow kamu masih cukup aman minggu ini.")).toBe(
      "Cashflow kamu masih cukup aman minggu ini."
    );
  });

  it("preserves manually authored emojis", () => {
    expect(applyBossFinanceEmojiStyle("1. 🎯 Dana darurat\n2. Beli rumah")).toBe(
      "1. 🎯 Dana darurat\n2. Beli rumah"
    );
  });

  it("leaves reply payloads unchanged", () => {
    const payload = {
      replyText: "Pilihan:\n1. Dana darurat",
      replyTexts: ["Target rumah masih jalan."]
    };

    expect(styleBotReplyPayload(payload)).toEqual(payload);
  });
});
