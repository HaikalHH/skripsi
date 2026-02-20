import { describe, expect, it } from "vitest";
import { parseCommand } from "@/lib/services/command-service";

describe("command parser", () => {
  it("parses budget set command", () => {
    const result = parseCommand("/budget set makan luar 1500000");
    expect(result).toEqual({
      kind: "BUDGET_SET",
      category: "makan luar",
      monthlyLimit: 1500000
    });
  });

  it("parses shorthand amount unit", () => {
    const result = parseCommand("/goal set 1.5jt");
    expect(result).toEqual({
      kind: "GOAL_SET",
      targetAmount: 1500000
    });
  });

  it("parses goal set and status commands", () => {
    const setCommand = parseCommand("/goal set 5000000");
    expect(setCommand).toEqual({
      kind: "GOAL_SET",
      targetAmount: 5000000
    });

    const statusCommand = parseCommand("/goal status");
    expect(statusCommand).toEqual({ kind: "GOAL_STATUS" });
  });

  it("parses advice command with and without question", () => {
    const noQuestion = parseCommand("/advice");
    expect(noQuestion).toEqual({ kind: "ADVICE", question: null });

    const withQuestion = parseCommand("/advice boleh beli hp 3500000 bulan ini?");
    expect(withQuestion).toEqual({
      kind: "ADVICE",
      question: "boleh beli hp 3500000 bulan ini?"
    });
  });

  it("returns NONE for invalid budget amount", () => {
    const result = parseCommand("/budget set transport abc");
    expect(result).toEqual({ kind: "NONE" });
  });
});
