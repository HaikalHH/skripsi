import { describe, expect, it } from "vitest";
import { tryHandleGeneralChat } from "@/lib/services/general-chat-service";

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
