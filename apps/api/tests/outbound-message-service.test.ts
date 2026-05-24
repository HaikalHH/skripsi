import { describe, expect, it } from "vitest";
import { toSafeOutboundMessageText } from "@/lib/services/messaging/outbound";

describe("outbound message safety", () => {
  it("normalizes whitespace", () => {
    const value = toSafeOutboundMessageText("Reminder Budget\nmakan\t hampir  habis");
    expect(value).toBe("Reminder Budget makan hampir habis");
  });

  it("truncates message to database-safe length", () => {
    const longText = `Reminder ${"x".repeat(400)}`;
    const value = toSafeOutboundMessageText(longText);
    expect(value.length).toBeLessThanOrEqual(191);
    expect(value.endsWith("...")).toBe(true);
  });

  it("removes invalid unicode before storing outbound messages", () => {
    const value = toSafeOutboundMessageText("Reminder \uD83D");
    expect(value).toBe("Reminder");
  });

  it("does not split emoji surrogate pairs when truncating", () => {
    const value = toSafeOutboundMessageText(`${"a".repeat(187)}😀 reminder`);
    expect(value.length).toBeLessThanOrEqual(191);
    expect(value).not.toMatch(/[\uD800-\uDFFF](?![\uDC00-\uDFFF])/);
    expect(value.endsWith("...")).toBe(true);
  });
});

