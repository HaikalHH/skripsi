import type { ReportPeriod } from "@finance/shared";
import { parseReportPeriod } from "./report-service";

export type ParsedCommand =
  | { kind: "HELP" }
  | { kind: "INSIGHT" }
  | { kind: "REPORT"; period: ReportPeriod }
  | { kind: "BUDGET_SET"; category: string; monthlyLimit: number }
  | { kind: "GOAL_SET"; targetAmount: number }
  | { kind: "GOAL_STATUS" }
  | { kind: "NONE" };

const parsePositiveAmount = (raw: string): number | null => {
  const compact = raw.trim().toLowerCase().replace(/\s+/g, "");
  const unitMatch = compact.match(/^([\d.,]+)(jt|rb|k)$/);
  if (unitMatch) {
    const numericPart = unitMatch[1].replace(",", ".");
    const numericValue = Number(numericPart);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return null;

    const multiplier = unitMatch[2] === "jt" ? 1_000_000 : 1_000;
    return Math.round(numericValue * multiplier);
  }

  const digitsOnly = compact.replace(/[^\d]/g, "");
  if (!digitsOnly) return null;
  const amount = Number(digitsOnly);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
};

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

export const parseCommand = (rawText: string | undefined): ParsedCommand => {
  if (!rawText) return { kind: "NONE" };
  const text = normalizeText(rawText);
  if (!text.startsWith("/")) return { kind: "NONE" };
  const lowerText = text.toLowerCase();

  if (lowerText === "/help") return { kind: "HELP" };
  if (lowerText === "/insight") return { kind: "INSIGHT" };
  if (lowerText === "/goal status") return { kind: "GOAL_STATUS" };

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
