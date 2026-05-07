import type { ReportPeriod } from "@finance/shared";
import { FinancialGoalType } from "@prisma/client";
import { parseReportPeriod } from "@/lib/services/reporting/report-service";

export type ReportRangeMode = "default" | "calendar" | "financial_cycle";

export type ParsedCommand =
  | { kind: "HELP" }
  | { kind: "REPORT_MENU" }
  | { kind: "REPORT"; period: ReportPeriod; reportMode?: ReportRangeMode }
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
  if (lowerText === "/report") return { kind: "REPORT_MENU" };
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

  if (lowerText === "/monthly report") {
    return { kind: "REPORT", period: "monthly", reportMode: "default" };
  }
  if (
    lowerText === "/calendar report" ||
    lowerText === "/calendar monthly report" ||
    lowerText === "/monthly calendar report"
  ) {
    return { kind: "REPORT", period: "monthly", reportMode: "calendar" };
  }
  if (
    lowerText === "/cashflow report" ||
    lowerText === "/cash flow report" ||
    lowerText === "/salary report" ||
    lowerText === "/gajian report" ||
    lowerText === "/siklus report"
  ) {
    return { kind: "REPORT", period: "monthly", reportMode: "financial_cycle" };
  }
  if (lowerText === "/weekly report") {
    return { kind: "REPORT", period: "weekly" };
  }
  if (lowerText === "/daily report") {
    return { kind: "REPORT", period: "daily" };
  }

  if (lowerText.startsWith("/report")) {
    const [, periodText] = lowerText.split(/\s+/);
    if (["calendar", "kalender"].includes(periodText ?? "")) {
      return { kind: "REPORT", period: "monthly", reportMode: "calendar" };
    }
    if (["cashflow", "cash-flow", "salary", "gajian", "siklus"].includes(periodText ?? "")) {
      return { kind: "REPORT", period: "monthly", reportMode: "financial_cycle" };
    }
    return { kind: "REPORT", period: parseReportPeriod(periodText) };
  }

  return { kind: "NONE" };
};
