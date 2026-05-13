import {
  AssetType,
  BudgetMode,
  EmploymentType,
  FinancialGoalType,
  GoalExecutionMode
} from "@prisma/client";
import type { OnboardingOption } from "./question-types";

export const READY_COMMANDS = new Set([
  "register",
  "/register",
  "oke saya siap",
  "ok saya siap",
  "siap",
  "mulai",
  "start"
]);

export const GOAL_NONE_VALUE = "NONE_YET";
export const ASSET_NONE_VALUE = "NONE";

export const EMPLOYMENT_OPTIONS: OnboardingOption[] = [
  { value: EmploymentType.STUDENT, label: "🧑‍🎓Mahasiswa" },
  { value: EmploymentType.EMPLOYEE, label: "👔Karyawan" },
  { value: EmploymentType.FREELANCER, label: "💻Freelance" },
  { value: EmploymentType.ENTREPRENEUR, label: "💼Pengusaha" },
  { value: EmploymentType.OTHER, label: "Lainnya" }
];

export const YES_NO_OPTIONS: OnboardingOption[] = [
  { value: "YES", label: "Ada" },
  { value: "NO", label: "Ga ada" }
];

export const START_OPTIONS: OnboardingOption[] = [{ value: "START", label: "Oke saya siap" }];

export const BUDGET_MODE_OPTIONS: OnboardingOption[] = [
  { value: BudgetMode.MANUAL_PLAN, label: "Saya sudah punya gambaran pengeluaran" },
  { value: BudgetMode.GUIDED_PLAN, label: "Saya belum punya, tolong bantu susun" },
  {
    value: BudgetMode.AUTO_FROM_TRANSACTIONS,
    label: "Lihat dari catatan transaksi saya bulan ini"
  }
];

export const GOAL_OPTIONS: OnboardingOption[] = [
  { value: FinancialGoalType.EMERGENCY_FUND, label: "🚨Nabung dana darurat" },
  { value: FinancialGoalType.HOUSE, label: "🏠Beli rumah" },
  { value: FinancialGoalType.VEHICLE, label: "🚗Beli kendaraan" },
  { value: FinancialGoalType.VACATION, label: "🏖️Liburan" },
  { value: GOAL_NONE_VALUE, label: "Belum ada target" },
  { value: FinancialGoalType.CUSTOM, label: "Custom target" }
];

export const GOAL_EXPENSE_STRATEGY_OPTIONS: OnboardingOption[] = [
  { value: "HELP_CALCULATE", label: "Bantu saya perkirakan lewat beberapa pertanyaan" },
  { value: "HAVE_DATA", label: "Saya sudah tahu kira-kira pengeluaran saya" },
  { value: "SKIP", label: "Lewati dulu" }
];

export const GOAL_ALLOCATION_MODE_OPTIONS: OnboardingOption[] = [
  { value: GoalExecutionMode.SEQUENTIAL, label: "Berurutan dulu" },
  { value: GoalExecutionMode.PARALLEL, label: "Barengan" }
];

export const ADD_MORE_OPTIONS: OnboardingOption[] = [
  { value: "YES", label: "Ada" },
  { value: "NO", label: "Ga ada" }
];

export const PERSONALIZATION_OPTIONS: OnboardingOption[] = [
  { value: "YES", label: "Lanjut sekarang" },
  { value: "NO", label: "Nanti dulu" }
];

export const ASSET_OPTIONS: OnboardingOption[] = [
  { value: AssetType.SAVINGS, label: "Tabungan" },
  { value: AssetType.GOLD, label: "Emas" },
  { value: AssetType.STOCK, label: "Saham" },
  { value: AssetType.CRYPTO, label: "Crypto" },
  { value: AssetType.MUTUAL_FUND, label: "Reksa dana" },
  { value: AssetType.PROPERTY, label: "Properti" },
  { value: ASSET_NONE_VALUE, label: "Belum punya" }
];

export const GOLD_TYPE_OPTIONS: OnboardingOption[] = [
  { value: "BULLION", label: "Batangan" },
  { value: "JEWELRY", label: "Perhiasan" },
  { value: "DIGITAL", label: "Emas digital" }
];

export const GOLD_BRAND_OPTIONS: OnboardingOption[] = [
  { value: "ANTAM", label: "Antam" },
  { value: "UBS", label: "UBS" },
  { value: "GALERI24", label: "Galeri24" },
  { value: "OTHER", label: "Lainnya" }
];

export const GOLD_KARAT_OPTIONS: OnboardingOption[] = [
  { value: "24K", label: "24K" },
  { value: "23K", label: "23K" },
  { value: "22K", label: "22K" },
  { value: "18K", label: "18K" },
  { value: "17K", label: "17K" }
];

export const GOLD_PLATFORM_OPTIONS: OnboardingOption[] = [
  { value: "PEGADAIAN", label: "Pegadaian" },
  { value: "OTHER", label: "Lainnya" }
];
