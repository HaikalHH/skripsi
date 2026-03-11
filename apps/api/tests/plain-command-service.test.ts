import { describe, expect, it } from "vitest";
import { parsePlainTextCommand } from "@/lib/services/plain-command-service";

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

  it("parses natural budget set phrases", () => {
    expect(parsePlainTextCommand("budget makan 2 juta/bulan")).toEqual({
      kind: "BUDGET_SET",
      category: "makan",
      monthlyLimit: 2000000
    });
    expect(parsePlainTextCommand("set budget nongkrong 750rb")).toEqual({
      kind: "BUDGET_SET",
      category: "nongkrong",
      monthlyLimit: 750000
    });
  });

  it("parses natural goal set phrases", () => {
    expect(parsePlainTextCommand("mau nabung 50 juta")).toEqual({
      kind: "GOAL_SET",
      targetAmount: 50000000
    });
    expect(parsePlainTextCommand("target dp rumah 200 juta")).toEqual({
      kind: "GOAL_SET",
      targetAmount: 200000000
    });
  });

  it("returns NONE for regular transaction text", () => {
    expect(parsePlainTextCommand("beli kopi 25 ribu")).toEqual({ kind: "NONE" });
    expect(parsePlainTextCommand("nabung 500 ribu")).toEqual({ kind: "NONE" });
  });
});
