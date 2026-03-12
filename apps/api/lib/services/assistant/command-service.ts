import type { ReportPeriod } from "@finance/shared";
import { FinancialGoalType } from "@prisma/client";
import { parsePositiveAmount } from "@/lib/services/transactions/amount-parser";
import { buildGoalIntentDetails } from "@/lib/services/planning/goal-intent-service";
import { parseReportPeriod } from "@/lib/services/reporting/report-service";

export type ParsedCommand =
  | { kind: "HELP" }
  | { kind: "INSIGHT" }
  | { kind: "ADVICE"; question: string | null }
  | { kind: "REPORT"; period: ReportPeriod }
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
  if (lowerText === "/insight") return { kind: "INSIGHT" };
  if (lowerText === "/advice") return { kind: "ADVICE", question: null };
  if (lowerText === "/goal status") return { kind: "GOAL_STATUS", goalQuery: null, goalType: null };

  if (lowerText.startsWith("/advice ")) {
    const question = normalizeText(text.slice("/advice ".length));
    if (!question) return { kind: "ADVICE", question: null };
    return { kind: "ADVICE", question };
  }

  if (lowerText.startsWith("/report")) {
    const [, periodText] = lowerText.split(/\s+/);
    return { kind: "REPORT", period: parseReportPeriod(periodText) };
  }

  if (lowerText.startsWith("/goal status ")) {
    const goalQuery = normalizeText(text.slice("/goal status ".length));
    const goalIntent = buildGoalIntentDetails(goalQuery);
    return {
      kind: "GOAL_STATUS",
      goalQuery: goalQuery || goalIntent.goalQuery,
      goalType: goalIntent.goalType
    };
  }

  if (lowerText.startsWith("/goal set ")) {
    const remainder = normalizeText(text.slice("/goal set ".length));
    const amountMatch = remainder.match(/(\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?)/i);
    const amount = amountMatch ? parsePositiveAmount(amountMatch[1]) : null;
    if (!amount) return { kind: "NONE" };
    const goalIntent = buildGoalIntentDetails(remainder);
    return {
      kind: "GOAL_SET",
      targetAmount: amount,
      goalName: goalIntent.goalName,
      goalType: goalIntent.goalType
    };
  }

  if (lowerText.startsWith("/goal add ")) {
    const remainder = normalizeText(text.slice("/goal add ".length));
    const amountMatch = remainder.match(/(\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?)/i);
    const amount = amountMatch ? parsePositiveAmount(amountMatch[1]) : null;
    if (!amount) return { kind: "NONE" };
    const goalIntent = buildGoalIntentDetails(remainder);
    return {
      kind: "GOAL_CONTRIBUTE",
      amount,
      goalQuery: goalIntent.goalQuery,
      goalType: goalIntent.goalType
    };
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
