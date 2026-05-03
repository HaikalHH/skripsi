import { describe, expect, it } from "vitest";
import { parsePlainTextCommand } from "@/lib/services/assistant/plain-command-service";

describe("plain text command parser", () => {
  it("parses natural report phrases", () => {
    expect(parsePlainTextCommand("Laporan hari ini")).toEqual({
      kind: "REPORT",
      period: "daily"
    });
    expect(parsePlainTextCommand("summary minggu ini")).toEqual({
      kind: "REPORT",
      period: "weekly"
    });
    expect(parsePlainTextCommand("laporan bulan ini")).toEqual({
      kind: "REPORT",
      period: "monthly"
    });
  });

  it("does not parse natural budget writes", () => {
    expect(parsePlainTextCommand("budget makan 2 juta/bulan")).toEqual({ kind: "NONE" });
    expect(parsePlainTextCommand("set budget nongkrong 750rb")).toEqual({ kind: "NONE" });
  });

  it("does not parse natural goal writes", () => {
    expect(parsePlainTextCommand("mau nabung 50 juta")).toEqual({ kind: "NONE" });
    expect(parsePlainTextCommand("target dp rumah 200 juta")).toEqual({ kind: "NONE" });
    expect(parsePlainTextCommand("target liburan jepang 30 juta")).toEqual({ kind: "NONE" });
  });

  it("returns NONE for regular transaction text", () => {
    expect(parsePlainTextCommand("beli kopi 25 ribu")).toEqual({ kind: "NONE" });
    expect(parsePlainTextCommand("nabung 500 ribu")).toEqual({ kind: "NONE" });
    expect(parsePlainTextCommand("setor tabungan 500 ribu")).toEqual({ kind: "NONE" });
  });
});

