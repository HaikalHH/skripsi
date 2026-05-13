import {
  AssetType,
  BudgetMode,
  EmploymentType,
  FinancialGoalType,
  GoalExecutionMode
} from "@prisma/client";
import {
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
  READY_COMMANDS,
  START_OPTIONS
} from "./answer-options";
import type { FlexibleChoiceOption } from "@/lib/services/onboarding/flow/shared/intent/onboarding-intent-service";

export const HELP_CALCULATE_STRATEGY = "HELP_CALCULATE";
export const HAVE_EXPENSE_DATA_STRATEGY = "HAVE_DATA";

export const START_INTENT_OPTIONS: FlexibleChoiceOption[] = START_OPTIONS.map((option) => ({
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

export const EMPLOYMENT_INTENT_OPTIONS: FlexibleChoiceOption[] = EMPLOYMENT_OPTIONS.map((option) => ({
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

export const BUDGET_MODE_INTENT_OPTIONS: FlexibleChoiceOption[] = BUDGET_MODE_OPTIONS.map((option) => ({
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

export const GOAL_INTENT_OPTIONS: FlexibleChoiceOption[] = GOAL_OPTIONS.map((option) => ({
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

export const GOAL_EXPENSE_STRATEGY_INTENT_OPTIONS: FlexibleChoiceOption[] = GOAL_EXPENSE_STRATEGY_OPTIONS.map((option) => ({
  ...option,
  aliases:
    option.value === HELP_CALCULATE_STRATEGY
      ? ["bantu hitung", "hitung pengeluaran", "tolong hitung", "dibantu hitung", "bantu saya hitung"]
      : option.value === HAVE_EXPENSE_DATA_STRATEGY
        ? ["sudah punya data", "udah punya data", "punya data pengeluaran", "sudah tahu pengeluaran", "udah tau pengeluaran"]
        : ["skip", "lewati", "lewati dulu", "nanti aja", "skip dulu"]
}));

export const GOAL_ALLOCATION_MODE_INTENT_OPTIONS: FlexibleChoiceOption[] =
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

export const PERSONALIZATION_INTENT_OPTIONS: FlexibleChoiceOption[] =
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

export const ASSET_INTENT_OPTIONS: FlexibleChoiceOption[] = ASSET_OPTIONS.map((option) => ({
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

export const GOLD_TYPE_INTENT_OPTIONS: FlexibleChoiceOption[] = GOLD_TYPE_OPTIONS.map((option) => ({
  ...option,
  aliases:
    option.value === "BULLION"
      ? ["batangan", "logam mulia", "antam", "ubs", "galeri24", "emas batangan"]
      : option.value === "JEWELRY"
        ? ["perhiasan", "kalung", "cincin", "gelang", "emas perhiasan"]
        : ["digital", "emas digital", "tabungan emas", "pegadaian digital"]
}));

export const GOLD_BRAND_INTENT_OPTIONS: FlexibleChoiceOption[] = GOLD_BRAND_OPTIONS.map((option) => ({
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

export const GOLD_KARAT_INTENT_OPTIONS: FlexibleChoiceOption[] = GOLD_KARAT_OPTIONS.map((option) => ({
  ...option,
  aliases: [option.value.toLowerCase(), option.label.toLowerCase(), option.value.replace("K", "").toLowerCase()]
}));

export const GOLD_PLATFORM_INTENT_OPTIONS: FlexibleChoiceOption[] = GOLD_PLATFORM_OPTIONS.map((option) => ({
  ...option,
  aliases:
    option.value === "PEGADAIAN"
      ? ["pegadaian", "tabungan emas pegadaian"]
      : ["lainnya", "lain", "other", "platform lain"]
}));

