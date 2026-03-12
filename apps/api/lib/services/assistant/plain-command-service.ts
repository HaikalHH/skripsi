import type { ReportPeriod } from "@finance/shared";
import { FinancialGoalType } from "@prisma/client";
import { parsePositiveAmount } from "@/lib/services/transactions/amount-parser";
import { buildGoalIntentDetails } from "@/lib/services/planning/goal-intent-service";

export type ParsedPlainCommand =
  | { kind: "REPORT"; period: ReportPeriod }
  | { kind: "BUDGET_SET"; category: string; monthlyLimit: number }
  | {
      kind: "GOAL_SET";
      targetAmount: number;
      goalName: string | null;
      goalType: FinancialGoalType | null;
    }
  | { kind: "NONE" };

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

const detectReportPeriod = (lowerText: string): ReportPeriod => {
  if (/(hari ini|today|harian|daily)/i.test(lowerText)) return "daily";
  if (/(minggu ini|pekan ini|weekly|mingguan)/i.test(lowerText)) return "weekly";
  return "monthly";
};

const parseReportCommand = (text: string): ParsedPlainCommand => {
  if (!/\b(laporan|report|summary|ringkasan)\b/i.test(text)) return { kind: "NONE" };
  return { kind: "REPORT", period: detectReportPeriod(text.toLowerCase()) };
};

const parseBudgetCommand = (text: string): ParsedPlainCommand => {
  const budgetPrefix = text.match(/^(?:set\s+)?(?:budget|anggaran)\s+(.+)$/i);
  if (!budgetPrefix) return { kind: "NONE" };

  const remainder = budgetPrefix[1].trim();
  const amountTail = remainder.match(
    /(\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?)(?:\s*(?:\/\s*bulan|per\s*bulan|\/\s*bln|per\s*bln|bulan|bln))?$/i
  );
  if (!amountTail) return { kind: "NONE" };

  const monthlyLimit = parsePositiveAmount(amountTail[1]);
  if (!monthlyLimit) return { kind: "NONE" };

  const categoryRaw = remainder
    .slice(0, remainder.length - amountTail[0].length)
    .replace(/\bsebesar$/i, "")
    .trim();
  const category = normalizeText(categoryRaw);
  if (!category) return { kind: "NONE" };

  return { kind: "BUDGET_SET", category, monthlyLimit };
};

const parseGoalCommand = (text: string): ParsedPlainCommand => {
  const hasGoalIntent =
    /\b(target|goal|tabungan|saving|dp)\b/i.test(text) ||
    /\b(mau|ingin|pengen)\s+(?:nabung|tabung)\b/i.test(text);
  if (!hasGoalIntent) return { kind: "NONE" };

  const amountMatch = text.match(/(\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?)/i);
  if (!amountMatch) return { kind: "NONE" };

  const targetAmount = parsePositiveAmount(amountMatch[1]);
  if (!targetAmount) return { kind: "NONE" };
  const goalIntent = buildGoalIntentDetails(text);

  return {
    kind: "GOAL_SET",
    targetAmount,
    goalName: goalIntent.goalName,
    goalType: goalIntent.goalType
  };
};

export const parsePlainTextCommand = (rawText: string | undefined): ParsedPlainCommand => {
  if (!rawText) return { kind: "NONE" };
  const text = normalizeText(rawText);
  if (!text || text.startsWith("/")) return { kind: "NONE" };

  const report = parseReportCommand(text);
  if (report.kind !== "NONE") return report;

  const budget = parseBudgetCommand(text);
  if (budget.kind !== "NONE") return budget;

  const goal = parseGoalCommand(text);
  if (goal.kind !== "NONE") return goal;

  return { kind: "NONE" };
};
