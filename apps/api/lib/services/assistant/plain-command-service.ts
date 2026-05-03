import type { ReportPeriod } from "@finance/shared";

export type ParsedPlainCommand =
  | { kind: "REPORT"; period: ReportPeriod }
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

export const parsePlainTextCommand = (rawText: string | undefined): ParsedPlainCommand => {
  if (!rawText) return { kind: "NONE" };
  const text = normalizeText(rawText);
  if (!text || text.startsWith("/")) return { kind: "NONE" };

  const report = parseReportCommand(text);
  if (report.kind !== "NONE") return report;

  return { kind: "NONE" };
};
