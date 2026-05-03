import { describe, expect, it } from "vitest";
import { tryHandleGeneralChat } from "@/lib/services/assistant/general-chat-service";

describe("general chat service", () => {
  it("handles greeting in quick mode", async () => {
    const result = await tryHandleGeneralChat({
      userId: "user_test",
      text: "halo",
      mode: "quick"
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText.toLowerCase()).toContain("halo boss");
    }
  });

  it("handles capability question in quick mode", async () => {
    const result = await tryHandleGeneralChat({
      userId: "user_test",
      text: "kamu bisa apa?",
      mode: "quick"
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText.toLowerCase()).toContain("catat pemasukan");
      expect(result.replyText.toLowerCase()).not.toContain("financial freedom");
      expect(result.replyText.toLowerCase()).not.toContain("wealth projection");
      expect(result.replyText.toLowerCase()).not.toContain("/insight");
      expect(result.replyText.toLowerCase()).not.toContain("/advice");
      expect(result.replyText.toLowerCase()).not.toContain("insight dan advice");
    }
  });

  it("rejects out-of-scope chat safely", async () => {
    const result = await tryHandleGeneralChat({
      userId: "user_test",
      text: "cuaca hari ini gimana",
      mode: "quick"
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText.toLowerCase()).toContain("fokus saya di urusan keuangan");
    }
  });
});

