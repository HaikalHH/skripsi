import type { ReportPeriod } from "@finance/shared";
import { FinancialGoalType } from "@prisma/client";
import { parseReportPeriod } from "@/lib/services/reporting/report-service";

export type ParsedCommand =
  | { kind: "HELP" }
  | { kind: "REPORT"; period: ReportPeriod }
  | { kind: "BUDGET_SET_FLOW_START" }
  | { kind: "GOAL_SET_FLOW_START" }
  | { kind: "GOAL_ADD_FLOW_START" }
  | { kind: "GOAL_STATUS_FLOW_START" }
  | { kind: "ASSET_ADD_FLOW_START" }
  | { kind: "BUDGET_SET"; category: string; monthlyLimit: number }
  | {
      kind: "GOAL_SET";
      targetAmount: number;
      goalName: string | null;
      goalType: FinancialGoalType | null;
    }
  | {
      kind: "GOAL_CONTRIBUTE";
      amount: number;
      goalQuery: string | null;
      goalType: FinancialGoalType | null;
    }
  | { kind: "GOAL_STATUS"; goalQuery: string | null; goalType: FinancialGoalType | null }
  | { kind: "NONE" };

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

export const parseCommand = (rawText: string | undefined): ParsedCommand => {
  if (!rawText) return { kind: "NONE" };
  const text = normalizeText(rawText);
  if (!text.startsWith("/")) return { kind: "NONE" };
  const lowerText = text.toLowerCase();

  if (lowerText === "/help") return { kind: "HELP" };
  if (lowerText === "/set goal" || lowerText.startsWith("/set goal ")) {
    return { kind: "GOAL_SET_FLOW_START" };
  }
  if (lowerText === "/goal add" || lowerText.startsWith("/goal add ")) {
    return { kind: "GOAL_ADD_FLOW_START" };
  }
  if (lowerText === "/goal status" || lowerText.startsWith("/goal status ")) {
    return { kind: "GOAL_STATUS_FLOW_START" };
  }
  if (lowerText === "/budget set" || lowerText.startsWith("/budget set ")) {
    return { kind: "BUDGET_SET_FLOW_START" };
  }
  if (lowerText === "/tambah aset" || lowerText.startsWith("/tambah aset ")) {
    return { kind: "ASSET_ADD_FLOW_START" };
  }

  if (lowerText.startsWith("/report")) {
    const [, periodText] = lowerText.split(/\s+/);
    return { kind: "REPORT", period: parseReportPeriod(periodText) };
  }

  return { kind: "NONE" };
};
