import { describe, expect, it } from "vitest";
import { formatDurationFromMonths } from "@/lib/services/shared/projection-math-service";

describe("projection math service", () => {
  it("formats decimal month estimates as bulan dan hari", () => {
    expect(formatDurationFromMonths(8.8)).toBe("8 bulan 24 hari");
    expect(formatDurationFromMonths(226.3)).toBe("226 bulan 9 hari");
    expect(formatDurationFromMonths(8)).toBe("8 bulan");
    expect(formatDurationFromMonths(0.5)).toBe("15 hari");
  });
});
