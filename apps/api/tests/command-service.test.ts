import { describe, expect, it } from "vitest";
import { parseCommand } from "@/lib/services/assistant/command-service";

describe("command parser", () => {
  it("starts conversational budget and goal command flows", () => {
    expect(parseCommand("/budget set")).toEqual({ kind: "BUDGET_SET_FLOW_START" });
    expect(parseCommand("/budget set makan luar 1500000")).toEqual({
      kind: "BUDGET_SET_FLOW_START"
    });
    expect(parseCommand("/set goal")).toEqual({ kind: "GOAL_SET_FLOW_START" });
    expect(parseCommand("/set goal rumah 750jt")).toEqual({ kind: "GOAL_SET_FLOW_START" });
    expect(parseCommand("/goal add")).toEqual({ kind: "GOAL_ADD_FLOW_START" });
    expect(parseCommand("/goal status")).toEqual({ kind: "GOAL_STATUS_FLOW_START" });
    expect(parseCommand("/goal status rumah")).toEqual({ kind: "GOAL_STATUS_FLOW_START" });
  });

  it("starts conversational asset add flow", () => {
    expect(parseCommand("/tambah aset")).toEqual({ kind: "ASSET_ADD_FLOW_START" });
    expect(parseCommand("/tambah aset saham")).toEqual({ kind: "ASSET_ADD_FLOW_START" });
  });

  it("keeps report and help slash commands", () => {
    expect(parseCommand("/help")).toEqual({ kind: "HELP" });
    expect(parseCommand("/report daily")).toEqual({ kind: "REPORT", period: "daily" });
  });

  it("does not parse old inline goal set command", () => {
    expect(parseCommand("/goal set 1.5jt")).toEqual({ kind: "NONE" });
    expect(parseCommand("/goal set rumah 750jt")).toEqual({ kind: "NONE" });
  });

  it("does not parse retired insight and advice commands", () => {
    expect(parseCommand("/insight")).toEqual({ kind: "NONE" });
    expect(parseCommand("/advice")).toEqual({ kind: "NONE" });
    expect(parseCommand("/advice boleh beli hp 3500000 bulan ini?")).toEqual({ kind: "NONE" });
  });
});
