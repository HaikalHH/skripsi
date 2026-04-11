import { describe, expect, it } from "vitest";
import { tryHandleWealthProjection } from "@/lib/services/planning/wealth-projection-service";

describe("wealth projection", () => {
  it("parses monthly saving projection", () => {
    const result = tryHandleWealthProjection("kalau nabung 2 juta/bulan 5 tahun jadi berapa");
    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toContain("Simulasi tabungan");
      expect(result.replyText).toContain("Skenario moderat");
      expect(result.replyText).toContain("Total setoran");
      expect(result.replyText).toContain("hasil");
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
      expect(result.replyText).toContain("Selisih konservatif vs agresif");
    }
  });

  it("supports starting amount in projection", () => {
    const result = tryHandleWealthProjection(
      "kalau invest 3 juta per bulan mulai dari 50 juta 5 tahun jadi berapa"
    );
    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toContain("Modal awal");
      expect(result.replyText).toContain("Rp. 50.000.000,00");
    }
  });

  it("supports annual contribution growth in projection", () => {
    const result = tryHandleWealthProjection(
      "kalau invest 3 juta per bulan naik 10% tiap tahun 5 tahun jadi berapa"
    );
    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toContain("Skenario setoran naik 10%/tahun");
    }
  });

  it("returns not handled for irrelevant text", () => {
    const result = tryHandleWealthProjection("beli kopi 25 ribu");
    expect(result.handled).toBe(false);
  });
});

