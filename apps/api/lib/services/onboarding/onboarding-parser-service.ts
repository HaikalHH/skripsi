import {
  AssetType,
  BudgetMode,
  EmploymentType,
  FinancialGoalType,
  OnboardingQuestionKey,
  OnboardingSession,
  OnboardingStep,
  PrimaryGoal
} from "@prisma/client";
import { parsePositiveAmount } from "@/lib/services/transactions/amount-parser";
import {
  ASSET_NONE_VALUE,
  ASSET_OPTIONS,
  BUDGET_MODE_OPTIONS,
  EMPLOYMENT_OPTIONS,
  GOAL_EXPENSE_STRATEGY_OPTIONS,
  GOAL_NONE_VALUE,
  GOAL_OPTIONS,
  PRIMARY_GOAL_OPTIONS,
  READY_COMMANDS,
  START_OPTIONS,
  type AssetSelectionValue,
  type GoalExpenseStrategyValue,
  type GoalSelectionValue
} from "@/lib/services/onboarding/onboarding-flow-service";
import type { ExpenseBreakdown } from "@/lib/services/onboarding/onboarding-calculation-service";
import {
  extractDecimalFromFreeText,
  extractIntegerFromFreeText,
  extractMoneyFromFreeText,
  matchMultiSelectIntent,
  matchSingleSelectIntent,
  normalizeLooseText,
  parseFlexibleBoolean,
  type FlexibleChoiceOption
} from "@/lib/services/onboarding/onboarding-intent-service";
import { normalizeWaNumber } from "@/lib/services/user/user-service";

export type SessionAnswerValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | ExpenseBreakdown
  | Record<string, unknown>;

export type StockQuantityUnit = "lot" | "lembar";

export type StockQuantityAnswer = {
  amount: number;
  unit: StockQuantityUnit;
  shares: number;
  displayLabel: string;
};

export const PHONE_PROMPT =
  "Sebelum lanjut, kirim nomor WhatsApp aktif Anda dulu.\nFormat: `62812xxxxxx`.";
export const HELP_CALCULATE_STRATEGY = "HELP_CALCULATE";
export const HAVE_EXPENSE_DATA_STRATEGY = "HAVE_DATA";
export const SKIP_STRATEGY = "SKIP";

export const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");
export const normalizeToken = (value: string) => normalizeText(value).toLowerCase();
export const isCanonicalWaPhone = (value: string | null | undefined) => !!value && /^62\d{7,15}$/.test(value);
const START_INTENT_OPTIONS: FlexibleChoiceOption[] = START_OPTIONS.map((option) => ({
  ...option,
  aliases: [
    ...READY_COMMANDS,
    "okey saya siap",
    "oke",
    "ok",
    "ayo mulai",
    "ayo lanjut",
    "gas",
    "lanjut"
  ]
}));

const PRIMARY_GOAL_INTENT_OPTIONS: FlexibleChoiceOption[] = PRIMARY_GOAL_OPTIONS.map((option) => ({
  ...option,
  aliases:
    option.value === PrimaryGoal.MANAGE_EXPENSES
      ? ["atur pengeluaran", "ngatur pengeluaran", "kontrol pengeluaran", "budgeting", "budget", "hemat", "catat pengeluaran"]
      : option.value === PrimaryGoal.SAVE_DISCIPLINED
        ? ["nabung disiplin", "lebih disiplin nabung", "menabung", "saving", "tabung rutin"]
        : option.value === PrimaryGoal.TRACK_INVESTMENTS
          ? ["pantau investasi", "monitor investasi", "portfolio", "investasi", "tracking asset", "aset"]
          : ["semua", "semua di atas", "semuanya", "all", "all in one", "semua fitur"]
}));

const EMPLOYMENT_INTENT_OPTIONS: FlexibleChoiceOption[] = EMPLOYMENT_OPTIONS.map((option) => ({
  ...option,
  aliases:
    option.value === EmploymentType.STUDENT
      ? ["mahasiswa", "student", "kuliah", "pelajar"]
      : option.value === EmploymentType.EMPLOYEE
        ? ["karyawan", "pegawai", "employee", "kantoran", "kerja kantoran", "ngantor"]
        : option.value === EmploymentType.FREELANCER
          ? ["freelance", "freelancer", "kerja lepas", "project based"]
          : option.value === EmploymentType.ENTREPRENEUR
            ? ["pengusaha", "usaha", "wirausaha", "bisnis", "business owner", "owner"]
            : ["lainnya", "other", "lain", "belum kerja", "ibu rumah tangga"]
}));

const BUDGET_MODE_INTENT_OPTIONS: FlexibleChoiceOption[] = BUDGET_MODE_OPTIONS.map((option) => ({
  ...option,
  aliases:
    option.value === BudgetMode.MANUAL_PLAN
      ? ["sudah punya", "udah punya", "sudah ada budget", "udah ada budget", "sudah ada alokasi", "punya perencanaan", "punya budgeting"]
      : option.value === BudgetMode.GUIDED_PLAN
        ? ["bantu buat", "dibantu buat", "tolong buatin", "bikinin budget", "buatkan alokasi", "belum punya tapi mau dibantu"]
        : ["analisis otomatis", "analisa otomatis", "auto dari transaksi", "dari transaksi aja", "pelajari transaksi dulu", "nanti dari transaksi"]
}));

const GOAL_INTENT_OPTIONS: FlexibleChoiceOption[] = GOAL_OPTIONS.map((option) => ({
  ...option,
  aliases:
    option.value === FinancialGoalType.EMERGENCY_FUND
      ? ["dana darurat", "emergency fund", "tabungan darurat"]
      : option.value === FinancialGoalType.HOUSE
        ? ["rumah", "beli rumah", "dp rumah", "property", "properti rumah"]
        : option.value === FinancialGoalType.VEHICLE
          ? ["kendaraan", "mobil", "motor", "beli mobil", "beli motor"]
          : option.value === FinancialGoalType.VACATION
            ? ["liburan", "travel", "jalan jalan", "holiday"]
            : option.value === GOAL_NONE_VALUE
              ? ["belum ada target", "ga ada target", "gak ada target", "tidak ada target", "no goal"]
              : ["custom", "target custom", "target lain", "target sendiri"]
}));

const GOAL_EXPENSE_STRATEGY_INTENT_OPTIONS: FlexibleChoiceOption[] = GOAL_EXPENSE_STRATEGY_OPTIONS.map((option) => ({
  ...option,
  aliases:
    option.value === HELP_CALCULATE_STRATEGY
      ? ["bantu hitung", "hitung pengeluaran", "tolong hitung", "dibantu hitung", "bantu saya hitung"]
      : option.value === HAVE_EXPENSE_DATA_STRATEGY
        ? ["sudah punya data", "udah punya data", "punya data pengeluaran", "sudah tahu pengeluaran", "udah tau pengeluaran"]
        : ["skip", "lewati", "lewati dulu", "nanti aja", "skip dulu"]
}));

const ASSET_INTENT_OPTIONS: FlexibleChoiceOption[] = ASSET_OPTIONS.map((option) => ({
  ...option,
  aliases:
    option.value === AssetType.SAVINGS
      ? ["tabungan", "cash", "saldo", "rekening", "uang tunai"]
      : option.value === AssetType.GOLD
        ? ["emas", "gold", "antam", "logam mulia"]
        : option.value === AssetType.STOCK
          ? ["saham", "stock", "bbca", "bmri", "tlkm"]
          : option.value === AssetType.CRYPTO
            ? ["crypto", "kripto", "btc", "bitcoin", "eth", "ethereum"]
            : option.value === AssetType.MUTUAL_FUND
              ? ["reksa dana", "mutual fund", "rd"]
              : option.value === AssetType.PROPERTY
                ? ["properti", "property", "rumah", "tanah", "apartemen", "ruko"]
                : ["belum punya", "belum ada aset", "ga ada aset", "gak ada aset", "tidak punya aset", "none"]
}));

export const isReadyCommand = (value: string) => Boolean(matchSingleSelectIntent(value, START_INTENT_OPTIONS));
export const isSkipChoice = (value: string) =>
  ["skip", "lewati", "lewati dulu", "nanti"].includes(normalizeToken(value));

export const parsePhoneInput = (raw: string): string | null => {
  const normalized = normalizeWaNumber(raw);
  return isCanonicalWaPhone(normalized) ? normalized : null;
};

export const parseDecimalInput = (raw: string): number | null => {
  const parsed = extractDecimalFromFreeText(raw.trim().toLowerCase().replace(/\s*gram$/i, ""));
  if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

export const parseStockSymbolInput = (raw: unknown) => {
  if (typeof raw !== "string") return null;

  const normalized = normalizeText(raw)
    .replace(/^kode\s+saham(?:nya)?[:\s-]*/i, "")
    .replace(/\s+/g, "")
    .toUpperCase();

  if (!/^[A-Z]{2,10}$/.test(normalized)) return null;
  return normalized;
};

export const parseStockQuantityInput = (raw: unknown): StockQuantityAnswer | null => {
  if (typeof raw !== "string") return null;

  const normalized = normalizeText(raw).toLowerCase();
  const hasLot = /lot\b/i.test(normalized);
  const hasLembar = /(?:lembar|lbr|share|shares|saham)\b/i.test(normalized);

  if ((hasLot && hasLembar) || (!hasLot && !hasLembar)) return null;

  const amountMatch = normalized.match(/(\d[\d.,]*)/);
  if (!amountMatch) return null;

  const compactAmount = amountMatch[1].replace(/[.,]/g, "");
  if (!/^\d+$/.test(compactAmount)) return null;

  const amount = Number(compactAmount);
  if (!Number.isInteger(amount) || amount <= 0) return null;

  const unit: StockQuantityUnit = hasLot ? "lot" : "lembar";
  const shares = unit === "lot" ? amount * 100 : amount;

  return {
    amount,
    unit,
    shares,
    displayLabel: unit === "lot" ? `${amount} lot` : `${amount} lembar`
  };
};

export const latestSessionForQuestion = (
  sessions: OnboardingSession[],
  questionKey: OnboardingQuestionKey
) => {
  const matches = sessions.filter((item) => item.questionKey === questionKey);
  return matches.at(-1) ?? null;
};

export const getSessionNormalizedValue = <T>(session: OnboardingSession | null): T | null => {
  if (!session || session.normalizedAnswerJson === null) return null;
  return session.normalizedAnswerJson as T;
};

export const parseBooleanAnswer = (raw: unknown) => {
  return parseFlexibleBoolean(raw);
};

export const parsePrimaryGoal = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(raw, PRIMARY_GOAL_INTENT_OPTIONS) as PrimaryGoal | null)
    : null;

export const parseEmploymentTypes = (raw: unknown): EmploymentType[] | null => {
  if (Array.isArray(raw)) {
    const values = raw
      .map((item) =>
        typeof item === "string"
          ? (matchSingleSelectIntent(item, EMPLOYMENT_INTENT_OPTIONS) as EmploymentType | null)
          : null
      )
      .filter((item): item is EmploymentType => Boolean(item));
    return values.length ? Array.from(new Set(values)) : null;
  }

  if (typeof raw !== "string") return null;
  const values = matchMultiSelectIntent(raw, EMPLOYMENT_INTENT_OPTIONS).filter(
    (item): item is EmploymentType => Boolean(item)
  );
  return values.length ? Array.from(new Set(values)) : null;
};

export const parseBudgetMode = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(raw, BUDGET_MODE_INTENT_OPTIONS) as BudgetMode | null)
    : null;

export const parseGoalSelection = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(raw, GOAL_INTENT_OPTIONS) as GoalSelectionValue | null)
    : null;

export const parseGoalExpenseStrategy = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(raw, GOAL_EXPENSE_STRATEGY_INTENT_OPTIONS) as GoalExpenseStrategyValue | null)
    : null;

export const parseAssetSelection = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(raw, ASSET_INTENT_OPTIONS) as AssetSelectionValue | null)
    : null;

export const parseMoneyInput = (raw: unknown) => {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return Math.round(raw);
  if (typeof raw !== "string") return null;
  if (/^0+$/.test(raw.trim())) return 0;
  return extractMoneyFromFreeText(raw);
};

export const parseDayOfMonth = (raw: unknown) => {
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? extractIntegerFromFreeText(raw, { min: 1, max: 31 }) : NaN;
  if (value === null || !Number.isInteger(value) || value < 1 || value > 31) return null;
  return value;
};

export const parseOptionalAge = (raw: unknown) => {
  if (typeof raw === "string" && isSkipChoice(raw)) return null;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? extractIntegerFromFreeText(raw, { min: 18, max: 100 }) : NaN;
  if (value === null || !Number.isInteger(value) || value < 18 || value > 100) return undefined;
  return value;
};

const ONBOARDING_EXPENSE_CATEGORY_MAP: Array<{ key: keyof ExpenseBreakdown; aliases: string[] }> = [
  {
    key: "food",
    aliases: [
      "makan",
      "food",
      "makan minum",
      "minum",
      "jajan",
      "konsumsi",
      "kopi",
      "ngopi",
      "resto",
      "restoran",
      "warung",
      "sarapan",
      "lunch",
      "dinner",
      "snack",
      "cemilan",
      "groceries",
      "grocery",
      "sembako",
      "dapur",
      "sayur",
      "buah",
      "beras",
      "lauk",
      "belanja bulanan",
      "belanja dapur"
    ]
  },
  {
    key: "transport",
    aliases: [
      "transport",
      "transportasi",
      "bensin",
      "bbm",
      "pertalite",
      "pertamax",
      "solar",
      "parkir",
      "tol",
      "ojek",
      "ojol",
      "gojek",
      "grab",
      "taxi",
      "taksi",
      "kereta",
      "krl",
      "mrt",
      "lrt",
      "bus",
      "transjakarta",
      "angkot",
      "commute",
      "komuter",
      "servis motor",
      "servis mobil"
    ]
  },
  {
    key: "bills",
    aliases: [
      "tagihan",
      "bill",
      "bills",
      "listrik",
      "air",
      "internet",
      "wifi",
      "telp",
      "telepon",
      "pulsa",
      "token",
      "pdam",
      "gas",
      "iuran",
      "sewa",
      "kontrakan",
      "kos",
      "kost",
      "cicilan",
      "kredit",
      "angsuran",
      "kartu kredit",
      "cc",
      "asuransi",
      "bpjs",
      "dokter",
      "klinik",
      "rumah sakit",
      "hospital",
      "obat",
      "apotek",
      "medical",
      "kesehatan",
      "health",
      "spp",
      "uang sekolah",
      "sekolah",
      "kuliah",
      "kampus",
      "les",
      "kursus",
      "education",
      "pendidikan",
      "tuition"
    ]
  },
  {
    key: "entertainment",
    aliases: [
      "hiburan",
      "nongkrong",
      "entertainment",
      "hangout",
      "streaming",
      "netflix",
      "spotify",
      "youtube premium",
      "bioskop",
      "cinema",
      "film",
      "movie",
      "game",
      "gaming",
      "steam",
      "playstation",
      "ps",
      "xbox",
      "nonton",
      "konser",
      "rekreasi",
      "liburan",
      "traveling",
      "travel",
      "hobi",
      "hobby"
    ]
  },
  {
    key: "others",
    aliases: [
      "lainnya",
      "lain lain",
      "other",
      "others",
      "keluarga",
      "istri",
      "suami",
      "anak",
      "ortu",
      "orang tua",
      "rumah tangga",
      "kebersihan",
      "donasi",
      "zakat",
      "amal",
      "charity",
      "hadiah",
      "gift",
      "fashion",
      "baju",
      "pakaian",
      "skincare",
      "kosmetik",
      "makeup",
      "pet",
      "hewan",
      "kucing",
      "anjing",
      "misc"
    ]
  }
];

export type ManualExpenseBreakdownDetail = {
  label: string;
  amount: number;
  bucket: keyof ExpenseBreakdown;
};

const resolveOnboardingExpenseBucket = (rawLabel: string): keyof ExpenseBreakdown => {
  const normalizedLabel = normalizeLooseText(rawLabel);
  const target = ONBOARDING_EXPENSE_CATEGORY_MAP.find((item) =>
    item.aliases.some((alias) => normalizedLabel.includes(alias))
  );
  return target?.key ?? "others";
};

export const parseManualExpenseBreakdownDetails = (
  raw: string
): ManualExpenseBreakdownDetail[] => {
  return raw
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawLabel, rawAmount] = line.split(":");
      const amount = rawAmount ? extractMoneyFromFreeText(rawAmount) : extractMoneyFromFreeText(line);
      if (amount === null) return null;

      const labelSource = normalizeText(rawLabel ?? line);
      return {
        label: labelSource,
        amount,
        bucket: resolveOnboardingExpenseBucket(labelSource)
      };
    })
    .filter((item): item is ManualExpenseBreakdownDetail => Boolean(item));
};

export const parseManualExpenseBreakdown = (raw: string): ExpenseBreakdown | null => {
  const result: ExpenseBreakdown = {
    food: 0,
    transport: 0,
    bills: 0,
    entertainment: 0,
    others: 0
  };

  const details = parseManualExpenseBreakdownDetails(raw);
  for (const detail of details) {
    result[detail.bucket] += detail.amount;
  }

  const populatedCategories = Object.values(result).filter((value) => value > 0).length;
  if (populatedCategories === 0) {
    return null;
  }

  return result;
};

export const getCurrentGoalType = (sessions: OnboardingSession[]) => {
  const selection = getSessionNormalizedValue<GoalSelectionValue>(
    latestSessionForQuestion(sessions, OnboardingQuestionKey.GOAL_SELECTION)
  );
  if (!selection || selection === GOAL_NONE_VALUE) return null;
  return selection as FinancialGoalType;
};

export const getCurrentAssetType = (sessions: OnboardingSession[]) => {
  const selection = getSessionNormalizedValue<AssetSelectionValue>(
    latestSessionForQuestion(sessions, OnboardingQuestionKey.ASSET_SELECTION)
  );
  if (!selection || selection === ASSET_NONE_VALUE) return null;
  return selection as AssetType;
};

export const getEmploymentTypes = (sessions: OnboardingSession[]) =>
  getSessionNormalizedValue<EmploymentType[]>(
    latestSessionForQuestion(sessions, OnboardingQuestionKey.EMPLOYMENT_TYPES)
  ) ?? [];

export const getGoalExpenseStrategy = (sessions: OnboardingSession[]) =>
  getSessionNormalizedValue<GoalExpenseStrategyValue>(
    latestSessionForQuestion(sessions, OnboardingQuestionKey.GOAL_EXPENSE_STRATEGY)
  );

export const getLatestCustomGoalName = (sessions: OnboardingSession[]) =>
  getSessionNormalizedValue<string>(latestSessionForQuestion(sessions, OnboardingQuestionKey.GOAL_CUSTOM_NAME));

export const getLatestAssetName = (sessions: OnboardingSession[], questionKey: OnboardingQuestionKey) =>
  getSessionNormalizedValue<string>(latestSessionForQuestion(sessions, questionKey));

export const getLatestStockQuantity = (sessions: OnboardingSession[]) =>
  getSessionNormalizedValue<StockQuantityAnswer>(
    latestSessionForQuestion(sessions, OnboardingQuestionKey.ASSET_GOLD_GRAMS)
  );

