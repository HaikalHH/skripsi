import { describe, expect, it } from "vitest";
import { toSafeOutboundMessageText } from "@/lib/services/outbound-message-service";

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
});
