import { describe, expect, it } from "vitest";
import { GeminiRateLimitError, isGeminiRateLimitError } from "@/lib/services/ai-service";

describe("ai service errors", () => {
  it("detects GeminiRateLimitError type", () => {
    const rateLimitError = new GeminiRateLimitError("quota exceeded");
    expect(isGeminiRateLimitError(rateLimitError)).toBe(true);
    expect(isGeminiRateLimitError(new Error("generic"))).toBe(false);
  });
});
