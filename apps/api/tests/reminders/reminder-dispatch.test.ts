import { describe, expect, it } from "vitest";
import { runProactiveReminders } from "@/lib/services/reminders/dispatch";

describe("reminder dispatch", () => {
  it("runs reminder sweep", async () => {
    const result = await runProactiveReminders(
      new Date("2026-02-25T00:05:00.000Z")
    );

    expect(result).toHaveProperty("processedUsers");
    expect(result).toHaveProperty("queued");
    expect(result).toHaveProperty("queuedByType");
  });
});
