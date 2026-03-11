import type { ReportPeriod } from "@finance/shared";
import { parsePositiveAmount } from "./amount-parser";
import {
  parseCashflowForecastQuery,
  type CashflowForecastHorizon,
  type CashflowForecastMode
} from "./cashflow-forecast-service";
import {
  parseGeneralAnalyticsQuery,
  parseCategoryReportQuery,
  type CategoryReportQueryMode,
  type CategoryReportRangeWindow,
  type GeneralAnalyticsReportMode
} from "./report-service";
import { parseCommand, type ParsedCommand } from "./command-service";
import { parsePlainTextCommand } from "./plain-command-service";

export type GlobalContextModule =
  | "TRANSACTION_MUTATION"
  | "PORTFOLIO"
  | "MARKET"
  | "NEWS"
  | "SMART_ALLOCATION"
  | "FINANCIAL_FREEDOM"
  | "WEALTH_PROJECTION"
  | "PRIVACY"
  | "TRANSACTION";

export type GlobalContextCommand =
  | Exclude<ParsedCommand, { kind: "NONE" }>
  | {
      kind: "CATEGORY_DETAIL_REPORT";
      period: ReportPeriod;
      category: string;
      filterText: string | null;
      mode: CategoryReportQueryMode;
      limit: number | null;
      rangeWindow: CategoryReportRangeWindow | null;
    }
  | {
      kind: "GENERAL_ANALYTICS_REPORT";
      mode: GeneralAnalyticsReportMode;
      period: ReportPeriod;
      limit: number | null;
      rangeWindow: CategoryReportRangeWindow | null;
    }
  | {
      kind: "CASHFLOW_FORECAST";
      horizon: CashflowForecastHorizon;
      mode: CashflowForecastMode;
    }
  | { kind: "NONE" };

export type GlobalContextRoute = {
  command: GlobalContextCommand;
  moduleOrder: GlobalContextModule[];
};

export const ALL_GLOBAL_CONTEXT_MODULES: GlobalContextModule[] = [
  "TRANSACTION_MUTATION",
  "PORTFOLIO",
  "MARKET",
  "NEWS",
  "SMART_ALLOCATION",
  "FINANCIAL_FREEDOM",
  "WEALTH_PROJECTION",
  "PRIVACY",
  "TRANSACTION"
];

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

const detectReportPeriod = (lowerText: string): ReportPeriod => {
  if (/(hari ini|today|harian|daily)/i.test(lowerText)) return "daily";
  if (/(minggu ini|pekan ini|weekly|mingguan)/i.test(lowerText)) return "weekly";
  return "monthly";
};

const parseFlexibleBudgetCommand = (text: string): GlobalContextCommand => {
  const match = text.match(
    /^(?:set\s+)?(?:budget|anggaran|alokasi|limit)\s+(.+?)\s+(?:jadi\s+|sebesar\s+)?(\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?)(?:\s*(?:\/\s*bulan|per\s*bulan|bulan|bln))?$/i
  );
  if (!match) return { kind: "NONE" };

  const category = normalizeText(match[1])
    .replace(/\buntuk\b/i, "")
    .replace(/\b(?:sekitar|kurang lebih)\b$/i, "")
    .trim();
  const monthlyLimit = parsePositiveAmount(match[2]);
  if (!category || !monthlyLimit) return { kind: "NONE" };

  return {
    kind: "BUDGET_SET",
    category,
    monthlyLimit
  };
};

const parseFlexibleGoalCommand = (text: string): GlobalContextCommand => {
  if (/(kalau|jika).*(nabung|invest).*(jadi berapa|hasilnya berapa|berapa nanti)/i.test(text)) {
    return { kind: "NONE" };
  }

  if (/(status target|status goal|goal status|status tabungan|progress tabungan|progress goal)/i.test(text)) {
    return { kind: "GOAL_STATUS" };
  }

  const match = text.match(
    /(?:target(?: tabungan)?|goal(?: tabungan)?|mau nabung|ingin nabung|pengen nabung|nabung)\s+(\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?)/i
  );
  if (!match) return { kind: "NONE" };

  const targetAmount = parsePositiveAmount(match[1]);
  if (!targetAmount) return { kind: "NONE" };

  return {
    kind: "GOAL_SET",
    targetAmount
  };
};

const parseFlexibleReportCommand = (text: string): GlobalContextCommand => {
  if (!/\b(laporan|report|summary|ringkasan|rekap)\b/i.test(text)) {
    return { kind: "NONE" };
  }

  return {
    kind: "REPORT",
    period: detectReportPeriod(text.toLowerCase())
  };
};

const parseFlexibleCategoryDetailCommand = (text: string): GlobalContextCommand => {
  const parsed = parseCategoryReportQuery(text);
  if (!parsed) return { kind: "NONE" };

  return {
    kind: "CATEGORY_DETAIL_REPORT",
    period: parsed.period,
    category: parsed.category,
    filterText: parsed.filterText,
    mode: parsed.mode,
    limit: parsed.limit,
    rangeWindow: parsed.rangeWindow
  };
};

const parseFlexibleGeneralAnalyticsCommand = (text: string): GlobalContextCommand => {
  const parsed = parseGeneralAnalyticsQuery(text);
  if (!parsed) return { kind: "NONE" };

  return {
    kind: "GENERAL_ANALYTICS_REPORT",
    mode: parsed.mode,
    period: parsed.period,
    limit: parsed.limit,
    rangeWindow: parsed.rangeWindow
  };
};

const parseFlexibleCashflowForecastCommand = (text: string): GlobalContextCommand => {
  const parsed = parseCashflowForecastQuery(text);
  if (!parsed) return { kind: "NONE" };

  return {
    kind: "CASHFLOW_FORECAST",
    horizon: parsed.horizon,
    mode: parsed.mode
  };
};

const parseFlexibleInsightCommand = (text: string): GlobalContextCommand => {
  if (!/\b(pola pengeluaran|kategori paling boros|tren pengeluaran|kebiasaan|insight)\b/i.test(text)) {
    return { kind: "NONE" };
  }

  return { kind: "INSIGHT" };
};

const parseFlexibleAdviceCommand = (text: string): GlobalContextCommand => {
  if (
    !/\b(keuangan .* sehat|sehat gak|boros gak|aman gak|boleh beli|boleh gak|saran keuangan|menurut kamu|sebaiknya)\b/i.test(
      text
    )
  ) {
    return { kind: "NONE" };
  }

  return {
    kind: "ADVICE",
    question: normalizeText(text)
  };
};

const parseFlexibleHelpCommand = (text: string): GlobalContextCommand => {
  if (!/\b(help|menu|fitur apa|bisa apa|cara pakai|panduan)\b/i.test(text)) {
    return { kind: "NONE" };
  }

  return { kind: "HELP" };
};

const parseNaturalLanguageCommand = (rawText: string): GlobalContextCommand => {
  const slashCommand = parseCommand(rawText);
  if (slashCommand.kind !== "NONE") return slashCommand;

  const text = normalizeText(rawText);
  const help = parseFlexibleHelpCommand(text);
  if (help.kind !== "NONE") return help;

  const categoryDetail = parseFlexibleCategoryDetailCommand(text);
  if (categoryDetail.kind !== "NONE") return categoryDetail;

  const generalAnalytics = parseFlexibleGeneralAnalyticsCommand(text);
  if (generalAnalytics.kind !== "NONE") return generalAnalytics;

  const cashflowForecast = parseFlexibleCashflowForecastCommand(text);
  if (cashflowForecast.kind !== "NONE") return cashflowForecast;

  const report = parseFlexibleReportCommand(text);
  if (report.kind !== "NONE") return report;

  const insight = parseFlexibleInsightCommand(text);
  if (insight.kind !== "NONE") return insight;

  const advice = parseFlexibleAdviceCommand(text);
  if (advice.kind !== "NONE") return advice;

  const budget = parseFlexibleBudgetCommand(text);
  if (budget.kind !== "NONE") return budget;

  const goal = parseFlexibleGoalCommand(text);
  if (goal.kind !== "NONE") return goal;

  const plainCommand = parsePlainTextCommand(rawText);
  if (plainCommand.kind !== "NONE") {
    return plainCommand;
  }

  return { kind: "NONE" };
};

const addModuleCandidate = (
  candidates: Array<{ module: GlobalContextModule; score: number }>,
  module: GlobalContextModule,
  score: number
) => {
  const existing = candidates.find((item) => item.module === module);
  if (existing) {
    existing.score = Math.max(existing.score, score);
    return;
  }
  candidates.push({ module, score });
};

const hasMoneyLikeText = (text: string) =>
  /(?:rp\.?\s*)?\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?/i.test(text);

const looksLikeTransactionMutation = (text: string) =>
  /\b(hapus|delete|ubah|edit|ganti|koreksi)\b/i.test(text);

const looksLikePortfolio = (text: string) =>
  /\b(portfolio|portofolio|aset investasi|nilai aset|komposisi aset|tambah emas|tambah saham|tambah crypto|tambah kripto|tambah reksa dana|tambah reksadana|tambah properti|tambah deposito|tambah bisnis|tambah tabungan|tambah cash|tambah kas|catat emas|catat saham|catat crypto|catat kripto|catat tabungan)\b/i.test(
    text
  );

const looksLikeMarket = (text: string) =>
  !looksLikePortfolio(text) &&
  (
    /\b(harga|price|cek harga|lihat harga|berapa sekarang|hari ini berapa)\b/i.test(text) ||
    /\b[a-z]{2,10}\b\s+(?:sekarang|hari ini)\s+(?:berapa|gimana)\b/i.test(text)
  );

const looksLikeNews = (text: string) =>
  /\b(berita|news|headline|digest|update ekonomi|update finance|ringkas berita)\b/i.test(text);

const looksLikeSmartAllocation = (text: string) =>
  /\b(sisa uang|alokasi|invest berapa|nabung berapa|smart allocation)\b/i.test(text);

const looksLikeFinancialFreedom = (text: string) =>
  /\b(financial freedom|bebas finansial|pensiun dini)\b/i.test(text);

const looksLikeWealthProjection = (text: string) =>
  /\b(kalau|jika)\b.*\b(nabung|invest|investasi)\b.*\b(jadi berapa|hasilnya berapa|berapa nanti|berapa lama|kapan tercapai)\b/i.test(
    text
  );

const looksLikePrivacy = (text: string) =>
  /\b(privasi|data aku aman|export data|download data|minta export)\b/i.test(text);

const looksLikeTransaction = (text: string) =>
  hasMoneyLikeText(text) &&
  /\b(beli|bayar|masuk|gaji|transfer|top up|topup|nabung|belanja|makan|minum|kopi|parkir|listrik|internet|qr|qris|ongkir|transport|pulsa)\b/i.test(
    text
  );

const detectModuleOrder = (rawText: string): GlobalContextModule[] => {
  const text = normalizeText(rawText);
  const candidates: Array<{ module: GlobalContextModule; score: number }> = [];

  if (looksLikeTransactionMutation(text)) addModuleCandidate(candidates, "TRANSACTION_MUTATION", 100);
  if (looksLikeWealthProjection(text)) addModuleCandidate(candidates, "WEALTH_PROJECTION", 95);
  if (looksLikeFinancialFreedom(text)) addModuleCandidate(candidates, "FINANCIAL_FREEDOM", 90);
  if (looksLikePortfolio(text)) addModuleCandidate(candidates, "PORTFOLIO", 88);
  if (looksLikeMarket(text)) addModuleCandidate(candidates, "MARKET", 86);
  if (looksLikeNews(text)) addModuleCandidate(candidates, "NEWS", 84);
  if (looksLikeSmartAllocation(text)) addModuleCandidate(candidates, "SMART_ALLOCATION", 82);
  if (looksLikePrivacy(text)) addModuleCandidate(candidates, "PRIVACY", 80);
  if (looksLikeTransaction(text)) addModuleCandidate(candidates, "TRANSACTION", 40);

  if (!candidates.some((item) => item.module === "TRANSACTION")) {
    addModuleCandidate(candidates, "TRANSACTION", 1);
  }

  return candidates.sort((left, right) => right.score - left.score).map((item) => item.module);
};

export const routeGlobalTextContext = (rawText: string | undefined): GlobalContextRoute => {
  if (!rawText) {
    return {
      command: { kind: "NONE" },
      moduleOrder: ["TRANSACTION"]
    };
  }

  return {
    command: parseNaturalLanguageCommand(rawText),
    moduleOrder: detectModuleOrder(rawText)
  };
};
