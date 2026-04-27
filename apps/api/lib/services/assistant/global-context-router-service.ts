import type { ReportPeriod } from "@finance/shared";
import { FinancialGoalType } from "@prisma/client";
import { parsePositiveAmount } from "@/lib/services/transactions/amount-parser";
import {
  parseCashflowForecastQuery,
  type CashflowForecastHorizon,
  type CashflowForecastMode
} from "@/lib/services/planning/cashflow-forecast-service";
import { type FinancialHealthMode } from "@/lib/services/planning/financial-health-service";
import { buildGoalIntentDetails } from "@/lib/services/planning/goal-intent-service";
import { type GoalPlannerMode } from "@/lib/services/planning/goal-planner-service";
import {
  parseGeneralReportQuery,
  parseGeneralAnalyticsQuery,
  parseCategoryReportQuery,
  type CategoryReportQueryMode,
  type ReportComparisonRange,
  type ReportDateRange,
  type CategoryReportRangeWindow,
  type GeneralAnalyticsReportMode
} from "@/lib/services/reporting/report-service";
import {
  parseReminderPreferenceCommand,
  type ReminderPreferenceCommand
} from "@/lib/services/reminders/reminder-preference-service";
import { parseCommand, type ParsedCommand } from "@/lib/services/assistant/command-service";
import { parsePlainTextCommand } from "@/lib/services/assistant/plain-command-service";
import { isLikelySavingTransactionText } from "@/lib/services/transactions/saving-intent-service";

export type GlobalContextModule =
  | "TRANSACTION_MUTATION"
  | "PORTFOLIO"
  | "MARKET"
  | "NEWS"
  | "PRIVACY"
  | "TRANSACTION";

export type GlobalContextCommand =
  | Exclude<ParsedCommand, { kind: "NONE" } | { kind: "REPORT" }>
  | {
      kind: "REPORT";
      period: ReportPeriod;
      dateRange?: ReportDateRange | null;
      comparisonRange?: ReportComparisonRange | null;
    }
  | {
      kind: "CATEGORY_DETAIL_REPORT";
      period: ReportPeriod;
      category: string;
      filterText: string | null;
      mode: CategoryReportQueryMode;
      limit: number | null;
      rangeWindow: CategoryReportRangeWindow | null;
      dateRange?: ReportDateRange | null;
      comparisonRange?: ReportComparisonRange | null;
    }
  | {
      kind: "GENERAL_ANALYTICS_REPORT";
      mode: GeneralAnalyticsReportMode;
      period: ReportPeriod;
      limit: number | null;
      rangeWindow: CategoryReportRangeWindow | null;
      dateRange?: ReportDateRange | null;
      comparisonRange?: ReportComparisonRange | null;
    }
  | {
      kind: "CASHFLOW_FORECAST";
      horizon: CashflowForecastHorizon;
      mode: CashflowForecastMode;
      scenarioExpenseAmount?: number;
      scenarioExpenseLabel?: string | null;
    }
  | {
      kind: "GOAL_PLAN";
      mode: GoalPlannerMode;
      goalQuery: string | null;
      goalType: FinancialGoalType | null;
      focusMonths?: number | null;
      splitRatio?: { primary: number; secondary: number } | null;
      annualExpenseGrowthRate?: number | null;
    }
  | {
      kind: "GOAL_CONTRIBUTE";
      amount: number;
      goalQuery: string | null;
      goalType: FinancialGoalType | null;
    }
  | {
      kind: "REMINDER_PREFERENCE";
      command: ReminderPreferenceCommand;
    }
  | {
      kind: "FINANCIAL_HEALTH";
      mode: FinancialHealthMode;
      period: ReportPeriod;
      dateRange?: ReportDateRange | null;
      comparisonRange?: ReportComparisonRange | null;
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
  "PRIVACY",
  "TRANSACTION"
];

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

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
  if (isLikelySavingTransactionText(text)) {
    return { kind: "NONE" };
  }

  const goalIntent = buildGoalIntentDetails(text);
  const focusDurationMatch = text.match(/\b(\d{1,2})\s*(?:bulan|bln)\b/i);
  const ratioMatch = text.match(/\b(\d{1,2})\s*[:/-]\s*(\d{1,2})\b/);
  const expenseGrowthMatch = text.match(
    /\b(?:expense|pengeluaran)\b.*?\bnaik\b.*?(\d{1,2})(?:[.,]\d+)?\s*%\s*(?:per|tiap)\s*tahun\b/i
  );

  if (expenseGrowthMatch && /\b(target|goal|rumah|kendaraan|liburan|tabungan)\b/i.test(text)) {
    return {
      kind: "GOAL_PLAN",
      mode: "EXPENSE_GROWTH",
      goalQuery: goalIntent.goalQuery,
      goalType: goalIntent.goalType,
      annualExpenseGrowthRate: Number(expenseGrowthMatch[1])
    };
  }

  if (ratioMatch && /\b(goal|target|tabungan|split|bagi|dibagi|alokasi)\b/i.test(text)) {
    return {
      kind: "GOAL_PLAN",
      mode: "SPLIT_RATIO",
      goalQuery: goalIntent.goalQuery,
      goalType: goalIntent.goalType,
      splitRatio: {
        primary: Math.max(1, Math.min(99, Number(ratioMatch[1]))),
        secondary: Math.max(1, Math.min(99, Number(ratioMatch[2])))
      }
    };
  }

  if (
    focusDurationMatch &&
    /\b(fokus|focus)\b/i.test(text) &&
    (goalIntent.goalType !== null || goalIntent.goalQuery)
  ) {
    return {
      kind: "GOAL_PLAN",
      mode: "FOCUS_DURATION",
      goalQuery: goalIntent.goalQuery,
      goalType: goalIntent.goalType,
      focusMonths: Number(focusDurationMatch[1])
    };
  }

  if (
    /\b(fokus|prioritas|realistis|dibagi|bagiin|split|alokasi).*?\b(goal|target|tabungan)\b/i.test(text) ||
    /\b(goal|target)\b.*?\b(fokus|prioritas|realistis|dibagi|split|alokasi)\b/i.test(text) ||
    (goalIntent.goalType !== null && /\b(fokus|prioritas|realistis|dulu)\b/i.test(text))
  ) {
    const mode: GoalPlannerMode =
      /\b(prioritas|realistis|mana dulu)\b/i.test(text)
          ? "PRIORITY"
        : /\b(fokus|focus|dulu)\b/i.test(text)
          ? "FOCUS"
          : "SPLIT";

    return {
      kind: "GOAL_PLAN",
      mode,
      goalQuery: goalIntent.goalQuery,
      goalType: goalIntent.goalType,
      ...(focusDurationMatch && mode === "FOCUS"
        ? {
            mode: "FOCUS_DURATION" as GoalPlannerMode,
            focusMonths: Number(focusDurationMatch[1])
          }
        : {})
    };
  }

  if (
    /(kalau|jika).*(nabung|invest|investasi).*(jadi berapa|hasilnya berapa|berapa nanti|berapa lama|kapan tercapai)/i.test(
      text
    )
  ) {
    return { kind: "NONE" };
  }

  const contributionAmountMatch = text.match(/(\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?)/i);
  const contributionAmount = contributionAmountMatch ? parsePositiveAmount(contributionAmountMatch[1]) : null;
  const contributionIntent =
    contributionAmount &&
    (goalIntent.goalType !== null || goalIntent.goalQuery) &&
    !/\b(target|goal)\b.*\b(set|pasang|buat)\b/i.test(text) &&
    !/\b(mau|ingin|pengen)\s+(?:nabung|tabung)\b/i.test(text) &&
    (
      /\b(setor|top\s?up|topup|masukin|masukkan|alokasi(?:kan)?|tambahkan?|isi)\b/i.test(text) ||
      (/\b(nabung|tabung)\b/i.test(text) && /\b(ke|buat|untuk)\b/i.test(text)) ||
      (/^\s*(nabung|tabung)\b/i.test(text) && !/\b(target|goal)\b/i.test(text)) ||
      /\b(progress|progres)\b/i.test(text)
    );

  if (contributionIntent) {
    return {
      kind: "GOAL_CONTRIBUTE",
      amount: contributionAmount,
      goalQuery: goalIntent.goalQuery,
      goalType: goalIntent.goalType
    };
  }

  if (/(status target|status goal|goal status|status tabungan|progress tabungan|progress goal)/i.test(text)) {
    const goalIntent = buildGoalIntentDetails(text);
    return {
      kind: "GOAL_STATUS",
      goalQuery: goalIntent.goalQuery,
      goalType: goalIntent.goalType
    };
  }

  const hasGoalIntent =
    /\b(target|goal|tabungan|saving|dp)\b/i.test(text) ||
    /\b(mau|ingin|pengen)\s+(?:nabung|tabung)\b/i.test(text);
  if (!hasGoalIntent) return { kind: "NONE" };

  const amountMatch = text.match(/(\d[\d.,]*(?:\s*(?:jt|juta|rb|ribu|k))?)/i);
  if (!amountMatch) return { kind: "NONE" };

  const targetAmount = parsePositiveAmount(amountMatch[1]);
  if (!targetAmount) return { kind: "NONE" };

  return {
    kind: "GOAL_SET",
    targetAmount,
    goalName: goalIntent.goalName,
    goalType: goalIntent.goalType
  };
};

const parseFlexibleReportCommand = (text: string): GlobalContextCommand => {
  const parsed = parseGeneralReportQuery(text);
  if (!parsed) return { kind: "NONE" };

  return {
    kind: "REPORT",
    period: parsed.period,
    ...(parsed.dateRange ? { dateRange: parsed.dateRange } : {}),
    ...(parsed.comparisonRange ? { comparisonRange: parsed.comparisonRange } : {})
  };
};

const parseFlexibleCategoryDetailCommand = (text: string): GlobalContextCommand => {
  if (/\b(hapus|delete|ubah|edit|ganti|koreksi)\b/i.test(text)) {
    return { kind: "NONE" };
  }

  const parsed = parseCategoryReportQuery(text);
  if (!parsed) return { kind: "NONE" };

  return {
    kind: "CATEGORY_DETAIL_REPORT",
    period: parsed.period,
    category: parsed.category,
    filterText: parsed.filterText,
    mode: parsed.mode,
    limit: parsed.limit,
    rangeWindow: parsed.rangeWindow,
    ...(parsed.dateRange ? { dateRange: parsed.dateRange } : {}),
    ...(parsed.comparisonRange ? { comparisonRange: parsed.comparisonRange } : {})
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
    rangeWindow: parsed.rangeWindow,
    ...(parsed.dateRange ? { dateRange: parsed.dateRange } : {}),
    ...(parsed.comparisonRange ? { comparisonRange: parsed.comparisonRange } : {})
  };
};

const parseFlexibleCashflowForecastCommand = (text: string): GlobalContextCommand => {
  const parsed = parseCashflowForecastQuery(text);
  if (!parsed) return { kind: "NONE" };

  return {
    kind: "CASHFLOW_FORECAST",
    horizon: parsed.horizon,
    mode: parsed.mode,
    ...(parsed.scenarioExpenseAmount
      ? {
          scenarioExpenseAmount: parsed.scenarioExpenseAmount,
          scenarioExpenseLabel: parsed.scenarioExpenseLabel ?? null
        }
      : {})
  };
};

const parseFlexibleReminderPreferenceCommand = (text: string): GlobalContextCommand => {
  const parsed = parseReminderPreferenceCommand(text);
  if (!parsed) return { kind: "NONE" };

  return {
    kind: "REMINDER_PREFERENCE",
    command: parsed
  };
};

const parseFlexibleFinancialHealthCommand = (text: string): GlobalContextCommand => {
  if (
    !/\b(health score|skor keuangan|skor kesehatan keuangan|closing|monthly closing|tutup buku|rapor keuangan|kesehatan keuangan)\b/i.test(
      text
    )
  ) {
    return { kind: "NONE" };
  }

  const reportQuery = parseGeneralReportQuery(`laporan ${text}`);
  const mode: FinancialHealthMode =
    /\b(closing|monthly closing|tutup buku|rapor keuangan)\b/i.test(text) ? "CLOSING" : "SCORE";

  return {
    kind: "FINANCIAL_HEALTH",
    mode,
    period: reportQuery?.period ?? "monthly",
    ...(reportQuery?.dateRange ? { dateRange: reportQuery.dateRange } : {}),
    ...(reportQuery?.comparisonRange ? { comparisonRange: reportQuery.comparisonRange } : {})
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

  const financialHealth = parseFlexibleFinancialHealthCommand(text);
  if (financialHealth.kind !== "NONE") return financialHealth;

  const reminderPreference = parseFlexibleReminderPreferenceCommand(text);
  if (reminderPreference.kind !== "NONE") return reminderPreference;

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
  /\b(portfolio|portofolio|aset investasi|nilai aset|komposisi aset|risiko portfolio|risiko portofolio|rebalance|rebalancing|aset paling dominan|holding terbesar|aset terbesar|portfolio terlalu numpuk|portofolio terlalu numpuk|aset paling cuan|aset paling rugi|performa portfolio|performa portofolio|profit portfolio|rugi portfolio|diversifikasi portfolio|diversifikasi portofolio|portfolio terdiversifikasi|portofolio terdiversifikasi|tambah emas|beli emas|tambah saham|tambah crypto|tambah kripto|tambah reksa dana|tambah reksadana|tambah properti|tambah deposito|tambah bisnis|tambah tabungan|tambah cash|tambah kas|catat emas|catat saham|catat crypto|catat kripto|catat tabungan)\b/i.test(
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

const looksLikePrivacy = (text: string) =>
  /\b(privasi|data aku aman|export data|download data|minta export)\b/i.test(text);

const looksLikeTransaction = (text: string) =>
  hasMoneyLikeText(text) &&
  /\b(beli|bayar|masuk|gaji|transfer|top up|topup|nabung|menabung|setor tabungan|simpan|saving|belanja|makan|minum|kopi|parkir|listrik|internet|qr|qris|ongkir|transport|pulsa)\b/i.test(
    text
  );

const detectModuleOrder = (rawText: string): GlobalContextModule[] => {
  const text = normalizeText(rawText);
  const candidates: Array<{ module: GlobalContextModule; score: number }> = [];

  if (looksLikeTransactionMutation(text)) addModuleCandidate(candidates, "TRANSACTION_MUTATION", 100);
  if (looksLikePortfolio(text)) addModuleCandidate(candidates, "PORTFOLIO", 88);
  if (looksLikeMarket(text)) addModuleCandidate(candidates, "MARKET", 86);
  if (looksLikeNews(text)) addModuleCandidate(candidates, "NEWS", 84);
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
