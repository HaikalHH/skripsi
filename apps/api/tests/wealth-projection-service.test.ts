import { describe, expect, it } from "vitest";
import { tryHandleWealthProjection } from "@/lib/services/wealth-projection-service";

describe("wealth projection", () => {
  it("parses monthly saving projection", () => {
    const result = tryHandleWealthProjection("kalau nabung 2 juta/bulan 5 tahun jadi berapa");
    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toContain("Simulasi tabungan");
      expect(result.replyText).toContain("Skenario moderat");
      expect(result.replyText).toContain("Total setoran");
    }
  });

  it("parses target eta projection", () => {
    const result = tryHandleWealthProjection(
      "kalau invest 3 juta per bulan target 1 miliar kapan tercapai"
    );
    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toContain("Estimasi waktu menuju target");
      expect(result.replyText).toContain("Skenario agresif");
    }
  });

  it("returns not handled for irrelevant text", () => {
    const result = tryHandleWealthProjection("beli kopi 25 ribu");
    expect(result.handled).toBe(false);
  });
});
