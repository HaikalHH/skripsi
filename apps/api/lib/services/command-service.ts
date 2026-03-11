import type { ReportPeriod } from "@finance/shared";
import { parsePositiveAmount } from "./amount-parser";
import { parseReportPeriod } from "./report-service";

export type ParsedCommand =
  | { kind: "HELP" }
  | { kind: "INSIGHT" }
  | { kind: "ADVICE"; question: string | null }
  | { kind: "REPORT"; period: ReportPeriod }
  | { kind: "BUDGET_SET"; category: string; monthlyLimit: number }
  | { kind: "GOAL_SET"; targetAmount: number }
  | { kind: "GOAL_STATUS" }
  | { kind: "NONE" };

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

export const parseCommand = (rawText: string | undefined): ParsedCommand => {
  if (!rawText) return { kind: "NONE" };
  const text = normalizeText(rawText);
  if (!text.startsWith("/")) return { kind: "NONE" };
  const lowerText = text.toLowerCase();

  if (lowerText === "/help") return { kind: "HELP" };
  if (lowerText === "/insight") return { kind: "INSIGHT" };
  if (lowerText === "/advice") return { kind: "ADVICE", question: null };
  if (lowerText === "/goal status") return { kind: "GOAL_STATUS" };

  if (lowerText.startsWith("/advice ")) {
    const question = normalizeText(text.slice("/advice ".length));
    if (!question) return { kind: "ADVICE", question: null };
    return { kind: "ADVICE", question };
  }

  if (lowerText.startsWith("/report")) {
    const [, periodText] = lowerText.split(/\s+/);
    return { kind: "REPORT", period: parseReportPeriod(periodText) };
  }

  if (lowerText.startsWith("/goal set ")) {
    const [, , ...targetParts] = text.split(/\s+/);
    const amount = parsePositiveAmount(targetParts.join(" "));
    if (!amount) return { kind: "NONE" };
    return { kind: "GOAL_SET", targetAmount: amount };
  }

  if (lowerText.startsWith("/budget set ")) {
    const parts = text.split(/\s+/);
    if (parts.length < 4) return { kind: "NONE" };

    const amountRaw = parts.at(-1) ?? "";
    const monthlyLimit = parsePositiveAmount(amountRaw);
    if (!monthlyLimit) return { kind: "NONE" };

    const category = normalizeText(parts.slice(2, -1).join(" "));
    if (!category) return { kind: "NONE" };

    return { kind: "BUDGET_SET", category, monthlyLimit };
  }

  return { kind: "NONE" };
};
