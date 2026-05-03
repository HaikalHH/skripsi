import {
  AssetType,
  BudgetMode,
  EmploymentType,
  FinancialGoalType,
  GoalExecutionMode,
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
  GOLD_BRAND_OPTIONS,
  GOLD_KARAT_OPTIONS,
  GOLD_PLATFORM_OPTIONS,
  GOLD_TYPE_OPTIONS,
  GOAL_ALLOCATION_MODE_OPTIONS,
  GOAL_EXPENSE_STRATEGY_OPTIONS,
  GOAL_NONE_VALUE,
  GOAL_OPTIONS,
  PERSONALIZATION_OPTIONS,
  PRIMARY_GOAL_OPTIONS,
  READY_COMMANDS,
  START_OPTIONS,
  type AssetSelectionValue,
  type GoldAssetBrandValue,
  type GoldAssetKaratValue,
  type GoldAssetPlatformValue,
  type GoldAssetTypeValue,
  type GoalExecutionModeValue,
  type GoalExpenseStrategyValue,
  type GoalSelectionValue
} from "@/lib/services/onboarding/onboarding-flow-service";
import type { ExpenseBreakdown } from "@/lib/services/onboarding/onboarding-calculation-service";
import { normalizeSupportedCryptoSymbol } from "@/lib/services/market/market-price-service";
import {
  extractDecimalFromFreeText,
  extractDecimalRangeFromFreeText,
  extractIntegerFromFreeText,
  extractMoneyFromFreeText,
  extractMoneyRangeFromFreeText,
  matchMultiSelectIntent,
  matchSingleSelectIntent,
  normalizeLooseText,
  parseMultiChoiceInput as parseIndexedMultiChoiceInput,
  parseFlexibleBoolean,
  type FlexibleChoiceOption
} from "@/lib/services/onboarding/onboarding-intent-service";
import { normalizeWaNumber } from "@/lib/services/user/user-service";

export type MoneyRangeAnswer = {
  kind: "money_range";
  low: number;
  high: number;
};

export type NumericRangeAnswer = {
  kind: "number_range";
  low: number;
  high: number;
};

export type GuidedOtherExpenseStage = "presence" | "category_name" | "category_amount" | "add_more";

export type GuidedOtherExpenseItem = {
  label: string;
  amount: number;
};

export type GuidedOtherExpenseAnswer =
  | {
      kind: "presence";
      hasOtherExpense: boolean;
    }
  | {
      kind: "category_name";
      label: string;
    }
  | {
      kind: "category_amount";
      label: string;
      amount: number;
    }
  | {
      kind: "add_more";
      addMore: boolean;
    };

export type SessionAnswerValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | ExpenseBreakdown
  | MoneyRangeAnswer
  | NumericRangeAnswer
  | GuidedOtherExpenseAnswer
  | Record<string, unknown>;

export const PHONE_PROMPT =
  "Sebelum lanjut, kirim nomor WhatsApp aktif Anda dulu.\nFormat: `62812xxxxxx`.";
export const HELP_CALCULATE_STRATEGY = "HELP_CALCULATE";
export const HAVE_EXPENSE_DATA_STRATEGY = "HAVE_DATA";
export const SKIP_STRATEGY = "SKIP";

export const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");
export const normalizeToken = (value: string) => normalizeText(value).toLowerCase();
export const isCanonicalWaPhone = (value: string | null | undefined) => !!value && /^62\d{7,15}$/.test(value);
const hasWholePhrase = (text: string, phrase: string) =>
  text === phrase ||
  text.startsWith(`${phrase} `) ||
  text.endsWith(` ${phrase}`) ||
  text.includes(` ${phrase} `);
const START_INTENT_OPTIONS: FlexibleChoiceOption[] = START_OPTIONS.map((option) => ({
  ...option,
  aliases: [
    ...READY_COMMANDS,
    "okey saya siap",
    "oke",
    "ok",
    "sap",
    "sapp",
    "siapp",
    "siappp",
    "syaap",
    "syiap",
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
          : option.value === PrimaryGoal.FINANCIAL_FREEDOM
            ? ["financial freedom", "bebas finansial", "menuju bebas finansial", "ff", "pensiun dini"]
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
        ? [
            "bantu buat",
            "dibantu buat",
            "tolong buatin",
            "bikinin budget",
            "buatkan alokasi",
            "belum punya tapi mau dibantu",
            "bantu susun",
            "bantu susunin",
            "tolong susunin",
            "susunin aja",
            "belum ada bantu susunin",
            "belum ada bantu susunin aja"
          ]
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
            : option.value === FinancialGoalType.FINANCIAL_FREEDOM
              ? ["financial freedom", "bebas finansial", "pensiun dini", "ff"]
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

const GOAL_ALLOCATION_MODE_INTENT_OPTIONS: FlexibleChoiceOption[] =
  GOAL_ALLOCATION_MODE_OPTIONS.map((option) => ({
    ...option,
    aliases:
      option.value === GoalExecutionMode.SEQUENTIAL
        ? [
            "berurutan",
            "berurutan dulu",
            "satu satu",
            "satu-satu",
            "fokus satu dulu",
            "prioritas satu dulu"
          ]
        : ["barengan", "paralel", "parallel", "sekaligus", "jalan bareng"]
  }));

const PERSONALIZATION_INTENT_OPTIONS: FlexibleChoiceOption[] =
  PERSONALIZATION_OPTIONS.map((option) => ({
    ...option,
    aliases:
      option.value === "YES"
        ? [
            "lanjut",
            "lanjut sekarang",
            "gas",
            "ayo lanjut",
            "boleh",
            "mau",
            "lanjut aja",
            "oke lanjut",
            "detailin sekarang",
            "personalisasi sekarang"
          ]
        : [
            "nanti",
            "nanti dulu",
            "skip",
            "skip dulu",
            "cukup",
            "itu dulu",
            "rangkuman aja",
            "analisa aja",
            "nanti aja"
          ]
  }));

const ASSET_INTENT_OPTIONS: FlexibleChoiceOption[] = ASSET_OPTIONS.map((option) => ({
  ...option,
  aliases:
    option.value === AssetType.SAVINGS
      ? [
          "tabungan",
          "cash",
          "saldo",
          "rekening",
          "uang tunai",
          "e-wallet",
          "ewallet",
          "dompet digital",
          "dana",
          "gopay",
          "ovo",
          "shopeepay",
          "spay"
        ]
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

const GOLD_TYPE_INTENT_OPTIONS: FlexibleChoiceOption[] = GOLD_TYPE_OPTIONS.map((option) => ({
  ...option,
  aliases:
    option.value === "BULLION"
      ? ["batangan", "logam mulia", "antam", "ubs", "galeri24", "emas batangan"]
      : option.value === "JEWELRY"
        ? ["perhiasan", "kalung", "cincin", "gelang", "emas perhiasan"]
        : ["digital", "emas digital", "tabungan emas", "pegadaian digital"]
}));

const GOLD_BRAND_INTENT_OPTIONS: FlexibleChoiceOption[] = GOLD_BRAND_OPTIONS.map((option) => ({
  ...option,
  aliases:
    option.value === "ANTAM"
      ? ["antam"]
      : option.value === "UBS"
        ? ["ubs"]
        : option.value === "GALERI24"
          ? ["galeri24", "galeri 24"]
          : ["lainnya", "lain", "other", "umum"]
}));

const GOLD_KARAT_INTENT_OPTIONS: FlexibleChoiceOption[] = GOLD_KARAT_OPTIONS.map((option) => ({
  ...option,
  aliases: [option.value.toLowerCase(), option.label.toLowerCase(), option.value.replace("K", "").toLowerCase()]
}));

const GOLD_PLATFORM_INTENT_OPTIONS: FlexibleChoiceOption[] = GOLD_PLATFORM_OPTIONS.map((option) => ({
  ...option,
  aliases:
    option.value === "PEGADAIAN"
      ? ["pegadaian", "tabungan emas pegadaian"]
      : ["lainnya", "lain", "other", "platform lain"]
}));

export const isReadyCommand = (value: string) => Boolean(matchSingleSelectIntent(value, START_INTENT_OPTIONS));
export const isSkipChoice = (value: string) =>
  ["skip", "lewati", "lewati dulu", "nanti"].includes(normalizeToken(value));

export const parsePhoneInput = (raw: string): string | null => {
  const normalized = normalizeWaNumber(raw);
  return isCanonicalWaPhone(normalized) ? normalized : null;
};

export const parseDecimalInput = (raw: string): number | null => {
  const normalized = raw.trim().toLowerCase();
  const parsedRange = extractDecimalRangeFromFreeText(normalized);
  if (parsedRange) return parsedRange.midpoint;

  const parsed = extractDecimalFromFreeText(normalized.replace(/\s*gram$/i, ""));
  if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

export const parseDecimalInputPreservingRange = (raw: unknown): number | NumericRangeAnswer | null => {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw !== "string") return null;

  const normalized = raw.trim().toLowerCase();
  const parsedRange = extractDecimalRangeFromFreeText(normalized);
  if (parsedRange) {
    return {
      kind: "number_range",
      low: parsedRange.low,
      high: parsedRange.high
    };
  }

  const parsed = extractDecimalFromFreeText(normalized.replace(/\s*gram$/i, ""));
  if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
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

export const parseAddMoreAnswer = (raw: unknown) => {
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return null;

  const normalized = normalizeToken(raw);
  if (!normalized) return null;

  const continuePhrases = [
    "lanjut",
    "lanjut aja",
    "langsung lanjut",
    "next",
    "terusin",
    "teruskan",
    "skip",
    "skip dulu",
    "cukup",
    "itu aja",
    "udah itu aja",
    "udah segitu aja",
    "segitu aja"
  ];
  const addMorePhrases = [
    "ada lagi",
    "masih ada",
    "masih mau nambah",
    "mau nambah",
    "tambah",
    "tambah lagi",
    "mau tambah"
  ];

  if (continuePhrases.some((phrase) => hasWholePhrase(normalized, phrase))) {
    return false;
  }

  const flexibleBoolean = parseFlexibleBoolean(raw);
  if (flexibleBoolean === false) {
    return false;
  }

  if (addMorePhrases.some((phrase) => hasWholePhrase(normalized, phrase))) {
    return true;
  }

  return flexibleBoolean;
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

export type ExclusiveOptionValidation<T extends string> = {
  isValid: boolean;
  selectedOptions: T[];
  exclusiveOption: T;
  nonExclusiveOptions: T[];
};

export const validateExclusiveOption = <T extends string>(
  selectedOptions: T[],
  exclusiveOption: T
): ExclusiveOptionValidation<T> => {
  const uniqueValues = Array.from(new Set(selectedOptions));
  const nonExclusiveOptions = uniqueValues.filter((item) => item !== exclusiveOption);

  return {
    isValid: !uniqueValues.includes(exclusiveOption) || uniqueValues.length <= 1,
    selectedOptions: uniqueValues,
    exclusiveOption,
    nonExclusiveOptions
  };
};

export const parseMultiChoiceInput = (input: string, maxOption: number) =>
  parseIndexedMultiChoiceInput(input, maxOption);

const mapIndexedSelectionsToOptionValues = <T extends string>(
  raw: unknown,
  options: Array<{ value: T }>
): T[] => {
  if (typeof raw !== "string") return [];

  const indexedSelections = parseIndexedMultiChoiceInput(raw, options.length);
  if (!indexedSelections?.length) return [];

  return indexedSelections
    .map((selection) => options[selection - 1]?.value ?? null)
    .filter((value): value is T => Boolean(value));
};

const collectGoalSelections = (raw: unknown): GoalSelectionValue[] => {
  if (Array.isArray(raw)) {
    return raw
      .map((item) =>
        typeof item === "string"
          ? (matchSingleSelectIntent(item, GOAL_INTENT_OPTIONS) as GoalSelectionValue | null)
          : null
      )
      .filter((item): item is GoalSelectionValue => Boolean(item));
  }

  if (typeof raw !== "string") return [];
  const indexedSelections = mapIndexedSelectionsToOptionValues<GoalSelectionValue>(
    raw,
    GOAL_OPTIONS as Array<{ value: GoalSelectionValue }>
  );
  if (indexedSelections.length) return indexedSelections;
  return matchMultiSelectIntent(raw, GOAL_INTENT_OPTIONS).filter(
    (item): item is GoalSelectionValue => Boolean(item)
  );
};

export const validateGoalSelections = (raw: unknown) =>
  validateExclusiveOption(collectGoalSelections(raw), GOAL_NONE_VALUE);

export const parseGoalSelectionConflict = (raw: unknown) => {
  const validation = validateGoalSelections(raw);
  return validation.isValid ? null : validation;
};

export const parseGoalSelections = (raw: unknown): GoalSelectionValue[] | null => {
  const validation = validateGoalSelections(raw);
  if (!validation.selectedOptions.length) return null;
  return validation.selectedOptions;
};

export const parseGoalExpenseStrategy = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(raw, GOAL_EXPENSE_STRATEGY_INTENT_OPTIONS) as GoalExpenseStrategyValue | null)
    : null;

export const parseGoalAllocationMode = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(raw, GOAL_ALLOCATION_MODE_INTENT_OPTIONS) as GoalExecutionModeValue | null)
    : null;

export const parsePersonalizationChoice = (raw: unknown) =>
  typeof raw === "string"
    ? ((matchSingleSelectIntent(raw, PERSONALIZATION_INTENT_OPTIONS) as "YES" | "NO" | null) === "YES"
        ? true
        : (matchSingleSelectIntent(raw, PERSONALIZATION_INTENT_OPTIONS) as "YES" | "NO" | null) === "NO"
          ? false
          : null)
    : null;

export const parseAssetSelection = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(raw, ASSET_INTENT_OPTIONS) as AssetSelectionValue | null)
    : null;

const OPTIONAL_ASSET_SKIP_PHRASES = [
  "skip",
  "skip dulu",
  "lewati",
  "lewati dulu",
  "nanti",
  "nanti aja",
  "ga dulu",
  "gak dulu",
  "nggak dulu",
  "belum dulu",
  "nanti di dashboard",
  "dashboard aja"
] as const;

const isOptionalAssetSkip = (raw: unknown) =>
  typeof raw === "string" &&
  OPTIONAL_ASSET_SKIP_PHRASES.some((phrase) => hasWholePhrase(normalizeToken(raw), phrase));

const collectAssetSelections = (raw: unknown): AssetSelectionValue[] => {
  if (isOptionalAssetSkip(raw)) {
    return [ASSET_NONE_VALUE];
  }

  if (Array.isArray(raw)) {
    return raw
      .map((item) =>
        typeof item === "string"
          ? (matchSingleSelectIntent(item, ASSET_INTENT_OPTIONS) as AssetSelectionValue | null)
          : null
      )
      .filter((item): item is AssetSelectionValue => Boolean(item));
  }

  if (typeof raw !== "string") return [];
  const indexedSelections = mapIndexedSelectionsToOptionValues<AssetSelectionValue>(
    raw,
    ASSET_OPTIONS as Array<{ value: AssetSelectionValue }>
  );
  if (indexedSelections.length) return indexedSelections;
  return matchMultiSelectIntent(raw, ASSET_INTENT_OPTIONS).filter(
    (item): item is AssetSelectionValue => Boolean(item)
  );
};

export const validateAssetSelections = (raw: unknown) =>
  validateExclusiveOption(collectAssetSelections(raw), ASSET_NONE_VALUE);

export const parseAssetSelectionConflict = (raw: unknown) => {
  const validation = validateAssetSelections(raw);
  return validation.isValid ? null : validation;
};

export const hasMixedNoneAssetSelection = (raw: unknown): boolean => {
  return !validateAssetSelections(raw).isValid;
};

export const parseAssetSelections = (raw: unknown): AssetSelectionValue[] | null => {
  const validation = validateAssetSelections(raw);
  if (!validation.isValid || !validation.selectedOptions.length) return null;
  return validation.selectedOptions;
};

export const parseGoldAssetType = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(raw, GOLD_TYPE_INTENT_OPTIONS) as GoldAssetTypeValue | null)
    : null;

export const parseGoldAssetBrand = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(raw, GOLD_BRAND_INTENT_OPTIONS) as GoldAssetBrandValue | null)
    : null;

export const parseGoldAssetKarat = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(raw, GOLD_KARAT_INTENT_OPTIONS) as GoldAssetKaratValue | null)
    : null;

export const parseGoldAssetPlatform = (raw: unknown) =>
  typeof raw === "string"
    ? (matchSingleSelectIntent(raw, GOLD_PLATFORM_INTENT_OPTIONS) as GoldAssetPlatformValue | null)
    : null;

const normalizeMarketText = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "");

export const parseAssetFreeText = (raw: unknown) => {
  if (typeof raw !== "string") return null;
  const normalized = normalizeText(raw);
  return normalized.length >= 2 ? normalized : null;
};

export const parseStockSymbolInput = (raw: unknown) => {
  if (typeof raw !== "string") return null;
  const candidates =
    raw.match(/\b[A-Za-z]{4,6}\b/g)?.filter(
      (token) => !["SAHAM", "STOCK", "KODE"].includes(token.toUpperCase())
    ) ?? [];
  const normalized = normalizeMarketText(candidates.at(-1) ?? raw);
  if (!/^[A-Z]{4,6}$/.test(normalized)) return null;
  return normalized;
};

export const parseCryptoSymbolInput = (raw: unknown) => {
  if (typeof raw !== "string") return null;
  return normalizeSupportedCryptoSymbol(raw);
};

export const parseMutualFundSymbolInput = (raw: unknown) => {
  if (typeof raw !== "string") return null;
  const normalized = normalizeText(raw);
  return normalized.length >= 2 ? normalized : null;
};

export const parseMoneyInput = (raw: unknown) => {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return Math.round(raw);
  if (typeof raw !== "string") return null;
  if (/^0+$/.test(raw.trim())) return 0;
  const parsedRange = extractMoneyRangeFromFreeText(raw);
  if (parsedRange) return parsedRange.midpoint;
  return extractMoneyFromFreeText(raw);
};

export const parseGuidedOtherExpenseInput = (raw: unknown) => {
  const amount = parseMoneyInput(raw);
  if (amount !== null) return amount;
  if (typeof raw !== "string") return null;

  const addMore = parseAddMoreAnswer(raw);
  if (addMore === false) return 0;

  const normalized = normalizeToken(raw);
  const noOtherExpensePhrases = [
    "udah",
    "sudah",
    "udah ya",
    "sudah ya",
    "ya udah",
    "ya sudah",
    "itu doang",
    "segitu",
    "udah itu",
    "sudah itu"
  ];

  return noOtherExpensePhrases.some((phrase) => hasWholePhrase(normalized, phrase)) ? 0 : null;
};

export const parseGuidedOtherExpenseCategoryName = (raw: unknown) => {
  if (typeof raw !== "string") return null;
  const normalized = normalizeText(raw);
  if (!normalized) return null;
  if (parseMoneyInput(raw) !== null) return null;
  if (parseBooleanAnswer(raw) !== null) return null;
  return /[A-Za-z]/.test(normalized) ? normalized : null;
};

export const parseMoneyInputPreservingRange = (raw: unknown): number | MoneyRangeAnswer | null => {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return Math.round(raw);
  if (typeof raw !== "string") return null;
  if (/^0+$/.test(raw.trim())) return 0;
  const parsedRange = extractMoneyRangeFromFreeText(raw);
  if (parsedRange) {
    return {
      kind: "money_range",
      low: parsedRange.low,
      high: parsedRange.high
    };
  }
  return extractMoneyFromFreeText(raw);
};

export const isMoneyRangeAnswer = (value: unknown): value is MoneyRangeAnswer =>
  !!value &&
  typeof value === "object" &&
  (value as MoneyRangeAnswer).kind === "money_range" &&
  typeof (value as MoneyRangeAnswer).low === "number" &&
  Number.isFinite((value as MoneyRangeAnswer).low) &&
  typeof (value as MoneyRangeAnswer).high === "number" &&
  Number.isFinite((value as MoneyRangeAnswer).high);

export const getMoneyAnswerLowerBound = (value: number | MoneyRangeAnswer) =>
  isMoneyRangeAnswer(value) ? value.low : value;

export const isNumericRangeAnswer = (value: unknown): value is NumericRangeAnswer =>
  !!value &&
  typeof value === "object" &&
  (value as NumericRangeAnswer).kind === "number_range" &&
  typeof (value as NumericRangeAnswer).low === "number" &&
  Number.isFinite((value as NumericRangeAnswer).low) &&
  typeof (value as NumericRangeAnswer).high === "number" &&
  Number.isFinite((value as NumericRangeAnswer).high);

export const getNumericAnswerMidpoint = (value: number | NumericRangeAnswer) =>
  isNumericRangeAnswer(value) ? (value.low + value.high) / 2 : value;

export const parseDayOfMonth = (raw: unknown) => {
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? extractIntegerFromFreeText(raw, { min: 1, max: 31 }) : NaN;
  if (value === null || !Number.isInteger(value) || value < 1 || value > 31) return null;
  return value;
};

export type FinancialFreedomTargetAnswer = {
  month: number;
  year: number;
  monthsFromNow: number;
  label: string;
};

export type FinancialFreedomPlanningAnswer = {
  target: FinancialFreedomTargetAnswer | null;
  expenseMode: "CURRENT" | "CUSTOM";
  monthlyExpense: number | null;
};

const hasExplicitFinancialFreedomMonthlyTarget = (raw: string) => {
  const normalized = normalizeLooseText(raw);
  return (
    /(rp|idr|\d+(?:[.,]\d+)?\s*(?:jt|juta|rb|ribu))/i.test(normalized) &&
    /(per\s*bulan|\/bulan|sebulan|tiap\s*bulan|per month|monthly|target)/i.test(normalized)
  );
};

const extractFinancialFreedomMonthlyTargetAmount = (raw: string) => {
  const normalized = normalizeLooseText(raw)
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized || !hasExplicitFinancialFreedomMonthlyTarget(normalized)) {
    return null;
  }

  const withoutMonthYear = MONTH_YEAR_TOKEN_PATTERNS.reduce(
    (value, pattern) => value.replace(pattern, " "),
    normalized
  )
    .replace(/\s+/g, " ")
    .trim();

  const targetAnchors = [
    /(?:target hasil pasif|hasil pasif per bulan|hasil pasif|income pasif|passive income|target bulanan|target)\s*:?\s*(.+)$/i,
    /(?:mau dapet|pengen dapet|ingin dapet|mau punya)\s*:?\s*(.+)$/i
  ];

  for (const anchor of targetAnchors) {
    const anchoredText = withoutMonthYear.match(anchor)?.[1]?.trim();
    if (!anchoredText) continue;
    const parsed = parseMoneyInput(anchoredText);
    if (parsed !== null && parsed > 0) return parsed;
  }

  const parsed = parseMoneyInput(withoutMonthYear);
  return parsed !== null && parsed > 0 ? parsed : null;
};

export type GoalTargetEvaluationStatus =
  | "feasible"
  | "aggressive"
  | "impossible_sequential"
  | "needs_parallel";

export type GoalTargetUserDecision =
  | "original"
  | "realistic"
  | "skipped"
  | "pending";

export type StoredGoalTargetAnswer = {
  goalType: FinancialGoalType | null;
  name: string | null;
  amount: number | null;
  target: FinancialFreedomTargetAnswer;
  desiredDate: FinancialFreedomTargetAnswer;
  realisticDate: FinancialFreedomTargetAnswer | null;
  realisticStartDate: FinancialFreedomTargetAnswer | null;
  realisticEndDate: FinancialFreedomTargetAnswer | null;
  requiredMonthlyForDesiredDate: number | null;
  allocatedMonthly: number | null;
  gapMonthly: number | null;
  status: GoalTargetEvaluationStatus;
  userDecision: GoalTargetUserDecision;
};

const isFinancialFreedomTargetAnswer = (
  value: unknown
): value is FinancialFreedomTargetAnswer => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.month === "number" &&
    typeof candidate.year === "number" &&
    typeof candidate.monthsFromNow === "number" &&
    typeof candidate.label === "string"
  );
};

export const isStoredGoalTargetAnswer = (value: unknown): value is StoredGoalTargetAnswer => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.goalType === null || typeof candidate.goalType === "string") &&
    (candidate.name === null || typeof candidate.name === "string") &&
    (candidate.amount === null || typeof candidate.amount === "number") &&
    isFinancialFreedomTargetAnswer(candidate.target) &&
    isFinancialFreedomTargetAnswer(candidate.desiredDate) &&
    (candidate.realisticDate === null || isFinancialFreedomTargetAnswer(candidate.realisticDate)) &&
    (candidate.realisticStartDate === null ||
      isFinancialFreedomTargetAnswer(candidate.realisticStartDate)) &&
    (candidate.realisticEndDate === null || isFinancialFreedomTargetAnswer(candidate.realisticEndDate)) &&
    typeof candidate.status === "string" &&
    typeof candidate.userDecision === "string"
  );
};

export const getGoalTargetAnswerFromStoredValue = (
  value: unknown
): FinancialFreedomTargetAnswer | null => {
  if (isFinancialFreedomTargetAnswer(value)) return value;
  if (isStoredGoalTargetAnswer(value)) return value.target;
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  return isFinancialFreedomTargetAnswer(candidate.target) ? candidate.target : null;
};

const MONTH_TOKEN_MAP: Record<string, number> = {
  jan: 1,
  januari: 1,
  january: 1,
  feb: 2,
  februari: 2,
  february: 2,
  mar: 3,
  maret: 3,
  march: 3,
  apr: 4,
  april: 4,
  mei: 5,
  may: 5,
  jun: 6,
  juni: 6,
  june: 6,
  jul: 7,
  juli: 7,
  july: 7,
  agu: 8,
  ags: 8,
  agustus: 8,
  august: 8,
  aug: 8,
  sep: 9,
  sept: 9,
  septmber: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  october: 10,
  oct: 10,
  nov: 11,
  november: 11,
  dec: 12,
  desember: 12,
  december: 12,
  des: 12
};

const FINANCIAL_FREEDOM_MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta"
});

const getCurrentJakartaMonthYear = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jakarta"
  }).formatToParts(new Date());

  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "1970");

  return { month, year };
};

const MAX_TARGET_YEARS_AHEAD = 70;

const buildFinancialFreedomTargetAnswer = (month: number, year: number): FinancialFreedomTargetAnswer | undefined => {
  const { year: currentYear, month: currentMonth } = getCurrentJakartaMonthYear();
  const monthsFromNow = (year - currentYear) * 12 + (month - currentMonth);

  if (
    month < 1 ||
    month > 12 ||
    monthsFromNow <= 0 ||
    monthsFromNow > MAX_TARGET_YEARS_AHEAD * 12
  ) {
    return undefined;
  }

  return {
    month,
    year,
    monthsFromNow,
    label: FINANCIAL_FREEDOM_MONTH_YEAR_FORMATTER.format(
      new Date(Date.UTC(year, month - 1, 1, 12))
    )
  };
};

const parseMonthYearToken = (value: string) => {
  const normalized = normalizeLooseText(value)
    .replace(/\s+/g, " ")
    .trim();

  const monthYearMatch = normalized.match(/^(\d{1,2})\s*[\/.-]\s*(\d{4})$/);
  if (monthYearMatch) {
    return buildFinancialFreedomTargetAnswer(Number(monthYearMatch[1]), Number(monthYearMatch[2]));
  }

  const yearMonthMatch = normalized.match(/^(\d{4})\s*[\/.-]\s*(\d{1,2})$/);
  if (yearMonthMatch) {
    return buildFinancialFreedomTargetAnswer(Number(yearMonthMatch[2]), Number(yearMonthMatch[1]));
  }

  const monthNameFirstMatch = normalized.match(/^([a-z]+)\s+(\d{4})$/i);
  if (monthNameFirstMatch) {
    const month = MONTH_TOKEN_MAP[monthNameFirstMatch[1]];
    return month
      ? buildFinancialFreedomTargetAnswer(month, Number(monthNameFirstMatch[2]))
      : undefined;
  }

  const yearFirstMonthNameMatch = normalized.match(/^(\d{4})\s+([a-z]+)$/i);
  if (yearFirstMonthNameMatch) {
    const month = MONTH_TOKEN_MAP[yearFirstMonthNameMatch[2]];
    return month
      ? buildFinancialFreedomTargetAnswer(month, Number(yearFirstMonthNameMatch[1]))
      : undefined;
  }

  const spokenFormatMatch = normalized.match(/bulan\s*(\d{1,2}).*tahun\s*(\d{4})/i);
  if (spokenFormatMatch) {
    return buildFinancialFreedomTargetAnswer(
      Number(spokenFormatMatch[1]),
      Number(spokenFormatMatch[2])
    );
  }

  return undefined;
};

const MONTH_YEAR_TOKEN_PATTERNS = [
  /(\d{1,2}\s*[\/.-]\s*\d{4})/i,
  /(\d{4}\s*[\/.-]\s*\d{1,2})/i,
  /([a-z]+\s+\d{4})/i,
  /(\d{4}\s+[a-z]+)/i,
  /(bulan\s*\d{1,2}.*?tahun\s*\d{4})/i
] as const;

const extractMonthYearFromSentence = (value: string) => {
  const normalized = normalizeLooseText(value)
    .replace(/\s+/g, " ")
    .trim();

  for (const pattern of MONTH_YEAR_TOKEN_PATTERNS) {
    const match = normalized.match(pattern);
    const candidate = match?.[1]?.trim();
    if (!candidate) continue;
    const parsed = parseMonthYearToken(candidate);
    if (parsed) return parsed;
  }

  return undefined;
};

const looksLikeMonthYearToken = (value: string) => {
  const normalized = normalizeLooseText(value)
    .replace(/\s+/g, " ")
    .trim();

  return (
    /^(\d{1,2})\s*[\/.-]\s*(\d{4})$/.test(normalized) ||
    /^(\d{4})\s*[\/.-]\s*(\d{1,2})$/.test(normalized) ||
    /^([a-z]+)\s+(\d{4})$/i.test(normalized) ||
    /^(\d{4})\s+([a-z]+)$/i.test(normalized) ||
    /bulan\s*\d{1,2}.*tahun\s*\d{4}/i.test(normalized)
  );
};

export const parseMonthYearInput = (raw: unknown) => {
  if (typeof raw !== "string") return null;
  return parseMonthYearToken(raw) ?? null;
};

export const parseOptionalFinancialFreedomTarget = (raw: unknown) => {
  if (typeof raw === "string" && isSkipChoice(raw)) return null;

  if (typeof raw === "string") {
    const parsedMonthYear = parseMonthYearInput(raw);
    if (parsedMonthYear) return parsedMonthYear;
    if (looksLikeMonthYearToken(raw)) return undefined;
  }

  const yearOffset =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? extractIntegerFromFreeText(raw, { min: 1, max: 70 })
        : NaN;

  if (yearOffset === null || !Number.isInteger(yearOffset) || yearOffset < 1 || yearOffset > 70) {
    return undefined;
  }

  const { month: currentMonth, year: currentYear } = getCurrentJakartaMonthYear();
  return buildFinancialFreedomTargetAnswer(currentMonth, currentYear + yearOffset);
};

export const parseFinancialFreedomPlanningAnswer = (
  raw: unknown
): FinancialFreedomPlanningAnswer | undefined => {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const candidate = raw as Record<string, unknown>;
    const parsedTarget = parseOptionalFinancialFreedomTarget(
      candidate.targetValue ?? candidate.target ?? "skip"
    );
    if (parsedTarget === undefined) return undefined;

    const expenseMode = candidate.expenseMode === "CUSTOM" ? "CUSTOM" : "CURRENT";
    const monthlyExpense =
      expenseMode === "CUSTOM"
        ? parseMoneyInput(
            candidate.monthlyExpense ??
              candidate.monthlyFreedomTarget ??
              candidate.desiredMonthlyPassive ??
              candidate.targetMonthlyIncome
          )
        : null;
    if (expenseMode === "CUSTOM" && (monthlyExpense === null || monthlyExpense <= 0)) {
      return undefined;
    }

    return {
      target: parsedTarget,
      expenseMode,
      monthlyExpense
    };
  }

  const parsedTarget =
    typeof raw === "string"
      ? extractMonthYearFromSentence(raw) ?? parseOptionalFinancialFreedomTarget(raw)
      : parseOptionalFinancialFreedomTarget(raw);
  if (parsedTarget === undefined) return undefined;

  const parsedMonthlyExpense =
    typeof raw === "string" && hasExplicitFinancialFreedomMonthlyTarget(raw)
      ? extractFinancialFreedomMonthlyTargetAmount(raw)
      : null;

  return {
    target: parsedTarget,
    expenseMode: parsedMonthlyExpense && parsedMonthlyExpense > 0 ? "CUSTOM" : "CURRENT",
    monthlyExpense: parsedMonthlyExpense && parsedMonthlyExpense > 0 ? parsedMonthlyExpense : null
  };
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

export type GuidedExpenseState = {
  items: GuidedOtherExpenseItem[];
  total: number;
  stage: GuidedOtherExpenseStage;
  pendingLabel: string | null;
};

export type PendingGoalDetail = {
  step: OnboardingStep;
  goalType: FinancialGoalType;
};

export type PendingAssetDetail = {
  step: OnboardingStep;
  assetType: AssetType;
  goldType?: GoldAssetTypeValue | null;
};

export type GoalPrioritySelection = {
  goalType: FinancialGoalType;
  goalName: string;
};

export type GoalRecommendationSelection = GoalPrioritySelection & {
  targetMonth: number | null;
  targetYear: number | null;
  monthsFromNow: number | null;
};

export type StoredGoalPriorityOrderAnswer = {
  priorityOrder: GoalRecommendationSelection[];
  executionMode: GoalExecutionMode | null;
  priorityGoalType: FinancialGoalType | null;
};

export const isStoredGoalPriorityOrderAnswer = (
  value: unknown
): value is StoredGoalPriorityOrderAnswer => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.priorityOrder) &&
    candidate.priorityOrder.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).goalType === "string" &&
        typeof (item as Record<string, unknown>).goalName === "string"
    ) &&
    (candidate.executionMode === null || typeof candidate.executionMode === "string") &&
    (candidate.priorityGoalType === null || typeof candidate.priorityGoalType === "string")
  );
};

export type GoalPlanRecommendation = {
  executionMode: GoalExecutionMode | null;
  priorityGoalType: FinancialGoalType | null;
  orderedGoals: GoalPrioritySelection[];
  orderedGoalDetails: GoalRecommendationSelection[];
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

export const isGuidedOtherExpenseAnswer = (value: unknown): value is GuidedOtherExpenseAnswer => {
  if (!value || typeof value !== "object" || !("kind" in value)) return false;
  const candidate = value as Record<string, unknown>;

  switch (candidate.kind) {
    case "presence":
      return typeof candidate.hasOtherExpense === "boolean";
    case "category_name":
      return typeof candidate.label === "string" && normalizeText(candidate.label).length > 0;
    case "category_amount":
      return (
        typeof candidate.label === "string" &&
        normalizeText(candidate.label).length > 0 &&
        typeof candidate.amount === "number" &&
        Number.isFinite(candidate.amount) &&
        candidate.amount >= 0
      );
    case "add_more":
      return typeof candidate.addMore === "boolean";
    default:
      return false;
  }
};

export const getGuidedOtherExpenseState = (
  sessions: OnboardingSession[]
): GuidedExpenseState => {
  const items: GuidedOtherExpenseItem[] = [];
  let stage: GuidedOtherExpenseStage = "presence";
  let pendingLabel: string | null = null;

  for (const session of getConfirmedSessions(sessions).filter(
    (item) => item.questionKey === OnboardingQuestionKey.GUIDED_EXPENSE_OTHERS
  )) {
    const normalized = getSessionNormalizedValue<SessionAnswerValue>(session);

    if (typeof normalized === "number") {
      if (normalized > 0) {
        items.push({ label: "lainnya", amount: normalized });
      }
      stage = "presence";
      pendingLabel = null;
      continue;
    }

    if (!isGuidedOtherExpenseAnswer(normalized)) {
      continue;
    }

    switch (normalized.kind) {
      case "presence":
        stage = normalized.hasOtherExpense ? "category_name" : "presence";
        pendingLabel = null;
        break;
      case "category_name":
        stage = "category_amount";
        pendingLabel = normalized.label;
        break;
      case "category_amount":
        items.push({
          label: normalized.label,
          amount: normalized.amount
        });
        stage = "add_more";
        pendingLabel = null;
        break;
      case "add_more":
        stage = normalized.addMore ? "category_name" : "presence";
        pendingLabel = null;
        break;
    }
  }

  return {
    items,
    total: items.reduce((sum, item) => sum + item.amount, 0),
    stage,
    pendingLabel
  };
};

const getConfirmedSessions = (sessions: OnboardingSession[]) =>
  sessions.filter((item) => item.isCompleted === true);

const normalizeStoredValues = <T>(value: T | T[] | null | undefined): T[] => {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value.filter((item): item is T => item !== null && item !== undefined) : [value];
};

const goalNameFromType = (goalType: FinancialGoalType) => {
  switch (goalType) {
    case FinancialGoalType.EMERGENCY_FUND:
      return "Dana Darurat";
    case FinancialGoalType.HOUSE:
      return "Beli Rumah";
    case FinancialGoalType.VEHICLE:
      return "Beli Kendaraan";
    case FinancialGoalType.VACATION:
      return "Liburan";
    case FinancialGoalType.FINANCIAL_FREEDOM:
      return "Financial Freedom";
    case FinancialGoalType.CUSTOM:
      return "Custom Target";
  }
};

const goalNeedsTargetAmount = (goalType: FinancialGoalType) =>
  goalType === FinancialGoalType.HOUSE ||
  goalType === FinancialGoalType.VEHICLE ||
  goalType === FinancialGoalType.VACATION ||
  goalType === FinancialGoalType.CUSTOM;

const goalNeedsTargetDate = goalNeedsTargetAmount;

export const parseGoalPriorityFocus = (
  raw: unknown,
  sessions: OnboardingSession[]
): FinancialGoalType | null => {
  const parsedSelection = parseGoalSelection(raw);
  if (parsedSelection && parsedSelection !== GOAL_NONE_VALUE) {
    return parsedSelection;
  }

  if (typeof raw !== "string") return null;

  const normalized = normalizeLooseText(raw).replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const selectedGoals = getSelectedGoalTypes(sessions);
  if (selectedGoals.includes(FinancialGoalType.CUSTOM)) {
    const customName = getLatestCustomGoalName(sessions);
    if (customName) {
      const normalizedCustomName = normalizeLooseText(customName).replace(/\s+/g, " ").trim();
      if (
        normalized === normalizedCustomName ||
        normalized.includes(normalizedCustomName) ||
        normalizedCustomName.includes(normalized)
      ) {
        return FinancialGoalType.CUSTOM;
      }
    }
  }

  return null;
};

export const getPendingGoalDetail = (sessions: OnboardingSession[]): PendingGoalDetail | null => {
  const confirmedSessions = getConfirmedSessions(sessions);
  const selectedGoals = getSelectedGoalTypes(confirmedSessions);

  let remainingCustomNames = confirmedSessions.filter(
    (item) => item.questionKey === OnboardingQuestionKey.GOAL_CUSTOM_NAME
  ).length;
  let remainingTargetAmounts = confirmedSessions.filter(
    (item) => item.questionKey === OnboardingQuestionKey.GOAL_TARGET_AMOUNT
  ).length;
  let remainingTargetDates = confirmedSessions.filter(
    (item) => item.questionKey === OnboardingQuestionKey.GOAL_TARGET_DATE
  ).length;

  for (const goalType of selectedGoals) {
    if (goalType === FinancialGoalType.CUSTOM) {
      if (remainingCustomNames <= 0) {
        return { step: OnboardingStep.ASK_GOAL_CUSTOM_NAME, goalType };
      }
      remainingCustomNames -= 1;
    }

    if (goalNeedsTargetAmount(goalType)) {
      if (remainingTargetAmounts <= 0) {
        return { step: OnboardingStep.ASK_GOAL_TARGET_AMOUNT, goalType };
      }
      remainingTargetAmounts -= 1;
    }

    if (goalNeedsTargetDate(goalType)) {
      if (remainingTargetDates <= 0) {
        return { step: OnboardingStep.ASK_GOAL_TARGET_DATE, goalType };
      }
      remainingTargetDates -= 1;
    }
  }

  return null;
};

export const getSelectedAssetTypes = (sessions: OnboardingSession[]) =>
  getConfirmedSessions(sessions)
    .filter((item) => item.questionKey === OnboardingQuestionKey.ASSET_SELECTION)
    .flatMap((item) =>
      normalizeStoredValues(
        getSessionNormalizedValue<AssetSelectionValue | AssetSelectionValue[]>(item)
      )
    )
    .filter(
      (value): value is AssetType =>
        Boolean(value) && value !== ASSET_NONE_VALUE
    );

const getLatestAssetSelectionSession = (sessions: OnboardingSession[]) =>
  [...getConfirmedSessions(sessions)]
    .reverse()
    .find((item) => item.questionKey === OnboardingQuestionKey.ASSET_SELECTION) ?? null;

const getCurrentAssetBatchSessions = (sessions: OnboardingSession[]) => {
  const confirmedSessions = getConfirmedSessions(sessions);
  const latestSelection = getLatestAssetSelectionSession(confirmedSessions);
  if (!latestSelection) return confirmedSessions;

  const latestSelectionIndex = confirmedSessions.findIndex((item) => item.id === latestSelection.id);
  return latestSelectionIndex >= 0
    ? confirmedSessions.slice(latestSelectionIndex)
    : confirmedSessions;
};

const getCurrentBatchSelectedAssetTypes = (sessions: OnboardingSession[]) => {
  const latestSelection = getLatestAssetSelectionSession(sessions);
  if (!latestSelection) return [] as AssetType[];

  return normalizeStoredValues(
    getSessionNormalizedValue<AssetSelectionValue | AssetSelectionValue[]>(latestSelection)
  ).filter(
    (value): value is AssetType =>
      Boolean(value) && value !== ASSET_NONE_VALUE
  );
};

const getQuestionValueCount = (
  sessions: OnboardingSession[],
  questionKeys: OnboardingQuestionKey[]
) =>
  sessions.filter((item) => questionKeys.includes(item.questionKey)).length;

const getGoldTypeAnswers = (sessions: OnboardingSession[]) =>
  sessions
    .flatMap((item) => {
      if (item.questionKey === OnboardingQuestionKey.ASSET_GOLD_TYPE) {
        return normalizeStoredValues(
          getSessionNormalizedValue<GoldAssetTypeValue | GoldAssetTypeValue[]>(item)
        );
      }

      if (item.questionKey === OnboardingQuestionKey.ASSET_GOLD_NAME) {
        const rawValue =
          getSessionNormalizedValue<string>(item) ??
          (typeof item.rawAnswerJson === "string" ? item.rawAnswerJson : null);
        const parsed = rawValue ? parseGoldAssetType(rawValue) : null;
        return parsed ? [parsed] : [];
      }

      return [];
    })
    .filter((value): value is GoldAssetTypeValue => Boolean(value));

const getAssetDetailStepMap = (assetType: AssetType) => {
  switch (assetType) {
    case AssetType.SAVINGS:
      return {
        nameStep: OnboardingStep.ASK_ASSET_SAVINGS_NAME,
        nameKeys: [OnboardingQuestionKey.ASSET_SAVINGS_NAME],
        valueStep: OnboardingStep.ASK_ASSET_SAVINGS_BALANCE,
        valueKeys: [OnboardingQuestionKey.ASSET_SAVINGS_BALANCE]
      };
    case AssetType.STOCK:
      return {
        nameStep: OnboardingStep.ASK_ASSET_STOCK_SYMBOL,
        nameKeys: [OnboardingQuestionKey.ASSET_STOCK_SYMBOL],
        valueStep: OnboardingStep.ASK_ASSET_STOCK_LOTS,
        valueKeys: [OnboardingQuestionKey.ASSET_STOCK_LOTS]
      };
    case AssetType.CRYPTO:
      return {
        nameStep: OnboardingStep.ASK_ASSET_CRYPTO_SYMBOL,
        nameKeys: [OnboardingQuestionKey.ASSET_CRYPTO_SYMBOL],
        valueStep: OnboardingStep.ASK_ASSET_CRYPTO_QUANTITY,
        valueKeys: [OnboardingQuestionKey.ASSET_CRYPTO_QUANTITY]
      };
    case AssetType.MUTUAL_FUND:
      return {
        nameStep: OnboardingStep.ASK_ASSET_MUTUAL_FUND_SYMBOL,
        nameKeys: [OnboardingQuestionKey.ASSET_MUTUAL_FUND_SYMBOL],
        valueStep: OnboardingStep.ASK_ASSET_MUTUAL_FUND_UNITS,
        valueKeys: [OnboardingQuestionKey.ASSET_MUTUAL_FUND_UNITS]
      };
    case AssetType.PROPERTY:
      return {
        nameStep: OnboardingStep.ASK_ASSET_PROPERTY_NAME,
        nameKeys: [OnboardingQuestionKey.ASSET_PROPERTY_NAME],
        valueStep: OnboardingStep.ASK_ASSET_PROPERTY_ESTIMATED_VALUE,
        valueKeys: [OnboardingQuestionKey.ASSET_PROPERTY_ESTIMATED_VALUE]
      };
    default:
      return {
        nameStep: OnboardingStep.ASK_ASSET_NAME,
        nameKeys: [OnboardingQuestionKey.ASSET_NAME],
        valueStep: OnboardingStep.ASK_ASSET_ESTIMATED_VALUE,
        valueKeys: [OnboardingQuestionKey.ASSET_ESTIMATED_VALUE]
      };
  }
};

const getAssetTypeFromQuestionKey = (questionKey: OnboardingQuestionKey): AssetType | null => {
  switch (questionKey) {
    case OnboardingQuestionKey.ASSET_SAVINGS_NAME:
    case OnboardingQuestionKey.ASSET_SAVINGS_BALANCE:
      return AssetType.SAVINGS;
    case OnboardingQuestionKey.ASSET_GOLD_TYPE:
    case OnboardingQuestionKey.ASSET_GOLD_NAME:
    case OnboardingQuestionKey.ASSET_GOLD_BRAND:
    case OnboardingQuestionKey.ASSET_GOLD_GRAMS:
    case OnboardingQuestionKey.ASSET_GOLD_KARAT:
    case OnboardingQuestionKey.ASSET_GOLD_PLATFORM:
      return AssetType.GOLD;
    case OnboardingQuestionKey.ASSET_STOCK_SYMBOL:
    case OnboardingQuestionKey.ASSET_STOCK_LOTS:
      return AssetType.STOCK;
    case OnboardingQuestionKey.ASSET_CRYPTO_SYMBOL:
    case OnboardingQuestionKey.ASSET_CRYPTO_QUANTITY:
      return AssetType.CRYPTO;
    case OnboardingQuestionKey.ASSET_MUTUAL_FUND_SYMBOL:
    case OnboardingQuestionKey.ASSET_MUTUAL_FUND_UNITS:
      return AssetType.MUTUAL_FUND;
    case OnboardingQuestionKey.ASSET_PROPERTY_NAME:
    case OnboardingQuestionKey.ASSET_PROPERTY_ESTIMATED_VALUE:
      return AssetType.PROPERTY;
    default:
      return null;
  }
};

export const getPendingAssetDetail = (sessions: OnboardingSession[]): PendingAssetDetail | null => {
  const currentBatchSessions = getCurrentAssetBatchSessions(sessions);
  const selectedAssets = getCurrentBatchSelectedAssetTypes(currentBatchSessions);
  const goldTypeAnswers = getGoldTypeAnswers(currentBatchSessions);
  const genericAssetNameCount = {
    value: getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_NAME])
  };
  const genericAssetValueCount = {
    value: getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_ESTIMATED_VALUE])
  };

  let remainingGoldTypes = goldTypeAnswers.length;
  let remainingGoldBrands = getQuestionValueCount(currentBatchSessions, [
    OnboardingQuestionKey.ASSET_GOLD_BRAND
  ]);
  let remainingGoldGrams = getQuestionValueCount(currentBatchSessions, [
    OnboardingQuestionKey.ASSET_GOLD_GRAMS
  ]);
  let remainingGoldKarats = getQuestionValueCount(currentBatchSessions, [
    OnboardingQuestionKey.ASSET_GOLD_KARAT
  ]);
  let remainingGoldPlatforms = getQuestionValueCount(currentBatchSessions, [
    OnboardingQuestionKey.ASSET_GOLD_PLATFORM
  ]);
  const remainingSpecificNameCounts = new Map<AssetType, number>([
    [AssetType.SAVINGS, getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_SAVINGS_NAME])],
    [AssetType.STOCK, getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_STOCK_SYMBOL])],
    [AssetType.CRYPTO, getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_CRYPTO_SYMBOL])],
    [AssetType.MUTUAL_FUND, getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_MUTUAL_FUND_SYMBOL])],
    [AssetType.PROPERTY, getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_PROPERTY_NAME])]
  ]);
  const remainingSpecificValueCounts = new Map<AssetType, number>([
    [AssetType.SAVINGS, getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_SAVINGS_BALANCE])],
    [AssetType.STOCK, getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_STOCK_LOTS])],
    [AssetType.CRYPTO, getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_CRYPTO_QUANTITY])],
    [AssetType.MUTUAL_FUND, getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_MUTUAL_FUND_UNITS])],
    [AssetType.PROPERTY, getQuestionValueCount(currentBatchSessions, [OnboardingQuestionKey.ASSET_PROPERTY_ESTIMATED_VALUE])]
  ]);

  const consumeDetailAnswer = (params: {
    assetType: AssetType;
    countMap: Map<AssetType, number>;
    genericCount: { value: number };
  }) => {
    const specificCount = params.countMap.get(params.assetType) ?? 0;
    if (specificCount > 0) {
      params.countMap.set(params.assetType, specificCount - 1);
      return "specific";
    }

    if (params.genericCount.value > 0) {
      params.genericCount.value -= 1;
      return "generic";
    }

    return null;
  };

  for (const assetType of selectedAssets) {
    if (assetType === AssetType.GOLD) {
      if (remainingGoldTypes <= 0) {
        return { step: OnboardingStep.ASK_ASSET_GOLD_TYPE, assetType, goldType: null };
      }
      const goldType = goldTypeAnswers[goldTypeAnswers.length - remainingGoldTypes] ?? null;
      remainingGoldTypes -= 1;

      if (goldType === "BULLION") {
        if (remainingGoldBrands <= 0) {
          return { step: OnboardingStep.ASK_ASSET_GOLD_BRAND, assetType, goldType };
        }
        remainingGoldBrands -= 1;

        if (remainingGoldGrams <= 0) {
          return { step: OnboardingStep.ASK_ASSET_GOLD_GRAMS, assetType, goldType };
        }
        remainingGoldGrams -= 1;
        continue;
      }

      if (goldType === "JEWELRY") {
        if (remainingGoldGrams <= 0) {
          return { step: OnboardingStep.ASK_ASSET_GOLD_GRAMS, assetType, goldType };
        }
        remainingGoldGrams -= 1;

        if (remainingGoldKarats <= 0) {
          return { step: OnboardingStep.ASK_ASSET_GOLD_KARAT, assetType, goldType };
        }
        remainingGoldKarats -= 1;
        continue;
      }

      if (goldType === "DIGITAL") {
        if (remainingGoldGrams <= 0) {
          return { step: OnboardingStep.ASK_ASSET_GOLD_GRAMS, assetType, goldType };
        }
        remainingGoldGrams -= 1;

        if (remainingGoldPlatforms <= 0) {
          return { step: OnboardingStep.ASK_ASSET_GOLD_PLATFORM, assetType, goldType };
        }
        remainingGoldPlatforms -= 1;
        continue;
      }

      return { step: OnboardingStep.ASK_ASSET_GOLD_TYPE, assetType, goldType: null };
    }

    const detailMap = getAssetDetailStepMap(assetType);
    if (
      !consumeDetailAnswer({
        assetType,
        countMap: remainingSpecificNameCounts,
        genericCount: genericAssetNameCount
      })
    ) {
      return { step: detailMap.nameStep, assetType };
    }

    const valueAnswerSource = consumeDetailAnswer({
      assetType,
      countMap: remainingSpecificValueCounts,
      genericCount: genericAssetValueCount
    });
    if (!valueAnswerSource) {
      return { step: detailMap.valueStep, assetType };
    }
    if (
      assetType === AssetType.MUTUAL_FUND &&
      valueAnswerSource === "specific" &&
      genericAssetValueCount.value > 0
    ) {
      genericAssetValueCount.value -= 1;
    }
  }

  return null;
};

export const getCurrentGoalType = (sessions: OnboardingSession[]) => {
  const pendingDetail = getPendingGoalDetail(sessions);
  if (pendingDetail) return pendingDetail.goalType;

  const latestSelection = latestSessionForQuestion(
    getConfirmedSessions(sessions),
    OnboardingQuestionKey.GOAL_SELECTION
  );
  const values = normalizeStoredValues(
    getSessionNormalizedValue<GoalSelectionValue | GoalSelectionValue[]>(latestSelection)
  ).filter((item): item is FinancialGoalType => Boolean(item) && item !== GOAL_NONE_VALUE);
  return values.at(-1) ?? null;
};

export const getCurrentAssetType = (
  sessions: OnboardingSession[],
  currentStep?: OnboardingStep | null
) => {
  if (currentStep === OnboardingStep.ASK_ASSET_ESTIMATED_VALUE) {
    const latestAssetDetailSession = [...getConfirmedSessions(sessions)]
      .reverse()
      .find((session) => getAssetTypeFromQuestionKey(session.questionKey));
    const assetTypeFromLatestStep = latestAssetDetailSession
      ? getAssetTypeFromQuestionKey(latestAssetDetailSession.questionKey)
      : null;
    if (assetTypeFromLatestStep) return assetTypeFromLatestStep;
  }

  const pendingDetail = getPendingAssetDetail(sessions);
  if (pendingDetail) return pendingDetail.assetType;

  const latestSelection = latestSessionForQuestion(
    getConfirmedSessions(sessions),
    OnboardingQuestionKey.ASSET_SELECTION
  );
  const values = normalizeStoredValues(
    getSessionNormalizedValue<AssetSelectionValue | AssetSelectionValue[]>(latestSelection)
  ).filter((item): item is AssetType => Boolean(item) && item !== ASSET_NONE_VALUE);
  return values.at(-1) ?? null;
};

export const getCurrentGoldType = (sessions: OnboardingSession[]) => {
  const pendingDetail = getPendingAssetDetail(sessions);
  if (pendingDetail?.assetType === AssetType.GOLD) {
    return pendingDetail.goldType ?? null;
  }

  return getGoldTypeAnswers(getConfirmedSessions(sessions)).at(-1) ?? null;
};

export const getEmploymentTypes = (sessions: OnboardingSession[]) =>
  getSessionNormalizedValue<EmploymentType[]>(
    latestSessionForQuestion(getConfirmedSessions(sessions), OnboardingQuestionKey.EMPLOYMENT_TYPES)
  ) ?? [];

export const getGoalExpenseStrategy = (sessions: OnboardingSession[]) =>
  getSessionNormalizedValue<GoalExpenseStrategyValue>(
    latestSessionForQuestion(
      getConfirmedSessions(sessions),
      OnboardingQuestionKey.GOAL_EXPENSE_STRATEGY
    )
  );

export const getSelectedGoalTypes = (sessions: OnboardingSession[]) =>
  {
    const confirmedSessions = getConfirmedSessions(sessions);
    const latestFinancialFreedomPlanning = latestSessionForQuestion(
      confirmedSessions,
      OnboardingQuestionKey.GOAL_FINANCIAL_FREEDOM_AGE
    );
    const financialFreedomWasRemoved =
      getSessionNormalizedValue<FinancialFreedomPlanningAnswer>(latestFinancialFreedomPlanning)
        ?.target === null;

    return confirmedSessions
      .filter((item) => item.questionKey === OnboardingQuestionKey.GOAL_SELECTION)
      .flatMap((item) =>
        normalizeStoredValues(
          getSessionNormalizedValue<GoalSelectionValue | GoalSelectionValue[]>(item)
        )
      )
      .filter(
        (value): value is FinancialGoalType =>
          Boolean(value) &&
          value !== GOAL_NONE_VALUE &&
          (!financialFreedomWasRemoved || value !== FinancialGoalType.FINANCIAL_FREEDOM)
      );
  };

const buildGoalRecommendationSelections = (
  sessions: OnboardingSession[]
): GoalRecommendationSelection[] => {
  const confirmedSessions = getConfirmedSessions(sessions);
  const selectedGoalTypes = getSelectedGoalTypes(confirmedSessions);
  const customNames = confirmedSessions
    .filter((item) => item.questionKey === OnboardingQuestionKey.GOAL_CUSTOM_NAME)
    .map((item) => getSessionNormalizedValue<string>(item))
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  const targetDates = confirmedSessions
    .filter((item) => item.questionKey === OnboardingQuestionKey.GOAL_TARGET_DATE)
    .map((item) => getGoalTargetAnswerFromStoredValue(getSessionNormalizedValue<SessionAnswerValue>(item)))
    .filter(
      (item): item is FinancialFreedomTargetAnswer => {
        if (!item) return false;
        return (
        typeof item.month === "number" &&
        typeof item.year === "number" &&
        typeof item.monthsFromNow === "number"
        );
      }
    );

  let customIndex = 0;
  let targetDateIndex = 0;

  return selectedGoalTypes
    .filter(
      (value): value is FinancialGoalType =>
        Boolean(value)
    )
    .map((goalType) => {
      const targetDate = goalNeedsTargetDate(goalType) ? targetDates[targetDateIndex] ?? null : null;
      if (goalNeedsTargetDate(goalType)) {
        targetDateIndex += 1;
      }

      if (goalType === FinancialGoalType.CUSTOM) {
        const goalName = customNames[customIndex] ?? goalNameFromType(goalType);
        customIndex += 1;
        return {
          goalType,
          goalName,
          targetMonth: targetDate?.month ?? null,
          targetYear: targetDate?.year ?? null,
          monthsFromNow: targetDate?.monthsFromNow ?? null
        };
      }

      return {
        goalType,
        goalName: goalNameFromType(goalType),
        targetMonth: targetDate?.month ?? null,
        targetYear: targetDate?.year ?? null,
        monthsFromNow: targetDate?.monthsFromNow ?? null
      };
    });
};

const shouldRecommendParallelGoalExecution = (goals: GoalRecommendationSelection[]) => {
  if (goals.length <= 1) return false;
  if (goals.some((goal) => goal.goalType === FinancialGoalType.EMERGENCY_FUND)) return false;

  const leadingDatedGoals = goals
    .filter(
      (goal) =>
        goal.goalType !== FinancialGoalType.FINANCIAL_FREEDOM &&
        goal.monthsFromNow !== null
    )
    .slice(0, 2);

  if (leadingDatedGoals.length < 2) return false;

  return (
    Math.abs(
      (leadingDatedGoals[0]?.monthsFromNow ?? 0) -
        (leadingDatedGoals[1]?.monthsFromNow ?? 0)
    ) <= 6
  );
};

export const getGoalPlanRecommendation = (
  sessions: OnboardingSession[]
): GoalPlanRecommendation => {
  const confirmedSessions = getConfirmedSessions(sessions);
  const explicitExecutionMode = getSessionNormalizedValue<GoalExecutionMode>(
    latestSessionForQuestion(confirmedSessions, OnboardingQuestionKey.GOAL_ALLOCATION_MODE)
  );
  const recommendedGoals = buildGoalRecommendationSelections(sessions);

  if (!recommendedGoals.length) {
    return {
      executionMode: null,
      priorityGoalType: null,
      orderedGoals: [],
      orderedGoalDetails: []
    };
  }

  const orderedGoalDetails = [...recommendedGoals];

  return {
    executionMode:
      orderedGoalDetails.length > 1
        ? explicitExecutionMode ??
          GoalExecutionMode.SEQUENTIAL
        : null,
    priorityGoalType: orderedGoalDetails[0]?.goalType ?? null,
    orderedGoals: orderedGoalDetails.map(({ goalType, goalName }) => ({
      goalType,
      goalName
    })),
    orderedGoalDetails
  };
};

export const getGoalPrioritySelections = (sessions: OnboardingSession[]): GoalPrioritySelection[] => {
  const recommendation = getGoalPlanRecommendation(sessions);
  return recommendation.orderedGoals;
};

export const hasExpenseDependentGoalSelection = (sessions: OnboardingSession[]) =>
  getSelectedGoalTypes(sessions).some(
    (goalType) =>
      goalType === FinancialGoalType.EMERGENCY_FUND ||
      goalType === FinancialGoalType.FINANCIAL_FREEDOM
  );

export const getLatestCustomGoalName = (sessions: OnboardingSession[]) =>
  getSessionNormalizedValue<string>(
    latestSessionForQuestion(getConfirmedSessions(sessions), OnboardingQuestionKey.GOAL_CUSTOM_NAME)
  );

export const getLatestAssetName = (sessions: OnboardingSession[], questionKey: OnboardingQuestionKey) =>
  getSessionNormalizedValue<string>(latestSessionForQuestion(getConfirmedSessions(sessions), questionKey));
