import {
  AssetType,
  BudgetMode,
  EmploymentType,
  FinancialGoalType,
  OnboardingQuestionKey,
  OnboardingStep,
  PrimaryGoal
} from "@prisma/client";

export type OnboardingInputType =
  | "single_select"
  | "multi_select"
  | "money"
  | "integer"
  | "decimal"
  | "text";

export type OnboardingOption = {
  value: string;
  label: string;
};

export type GoalSelectionValue = FinancialGoalType | "NONE_YET";
export type GoalExpenseStrategyValue = "HELP_CALCULATE" | "HAVE_DATA" | "SKIP";
export type AssetSelectionValue = AssetType | "NONE";

export type OnboardingPromptContext = {
  needsPhoneVerification: boolean;
  budgetMode: BudgetMode | null;
  employmentTypes: EmploymentType[];
  currentGoalType: FinancialGoalType | null;
  currentAssetType: AssetType | null;
  expenseAvailable: boolean;
  goalExpenseStrategy: GoalExpenseStrategyValue | null;
};

export type OnboardingPrompt = {
  stepKey: OnboardingStep;
  questionKey: OnboardingQuestionKey;
  title: string;
  body: string;
  inputType: OnboardingInputType;
  options?: OnboardingOption[];
  allowSkip?: boolean;
};

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

export const PRIMARY_GOAL_OPTIONS: OnboardingOption[] = [
  { value: PrimaryGoal.MANAGE_EXPENSES, label: "Mengatur pengeluaran" },
  { value: PrimaryGoal.SAVE_DISCIPLINED, label: "Nabung lebih disiplin" },
  { value: PrimaryGoal.TRACK_INVESTMENTS, label: "Tracking investasi" },
  { value: PrimaryGoal.ALL_OF_THE_ABOVE, label: "Semua di atas" }
];

export const EMPLOYMENT_OPTIONS: OnboardingOption[] = [
  { value: EmploymentType.STUDENT, label: "Mahasiswa" },
  { value: EmploymentType.EMPLOYEE, label: "Karyawan" },
  { value: EmploymentType.FREELANCER, label: "Freelance" },
  { value: EmploymentType.ENTREPRENEUR, label: "Pengusaha" },
  { value: EmploymentType.OTHER, label: "Lainnya" }
];

export const YES_NO_OPTIONS: OnboardingOption[] = [
  { value: "YES", label: "Ada" },
  { value: "NO", label: "Ga ada" }
];

export const START_OPTIONS: OnboardingOption[] = [{ value: "START", label: "Oke saya siap" }];

export const BUDGET_MODE_OPTIONS: OnboardingOption[] = [
  { value: BudgetMode.MANUAL_PLAN, label: "Sudah punya perencanaan" },
  { value: BudgetMode.GUIDED_PLAN, label: "Belum punya, tapi mau dibantu membuat" },
  {
    value: BudgetMode.AUTO_FROM_TRANSACTIONS,
    label: "Belum punya dan ingin analisis otomatis dari penggunaan bulan ini"
  }
];

export const GOAL_OPTIONS: OnboardingOption[] = [
  { value: FinancialGoalType.EMERGENCY_FUND, label: "Nabung dana darurat" },
  { value: FinancialGoalType.HOUSE, label: "Beli rumah" },
  { value: FinancialGoalType.VEHICLE, label: "Beli kendaraan" },
  { value: FinancialGoalType.VACATION, label: "Liburan" },
  { value: GOAL_NONE_VALUE, label: "Belum ada target" },
  { value: FinancialGoalType.CUSTOM, label: "Custom target" }
];

export const GOAL_EXPENSE_STRATEGY_OPTIONS: OnboardingOption[] = [
  { value: "HELP_CALCULATE", label: "Bantu saya hitung pengeluaran bulanan" },
  { value: "HAVE_DATA", label: "Saya sudah punya data pengeluaran" },
  { value: "SKIP", label: "Lewati dulu" }
];

export const ADD_MORE_OPTIONS: OnboardingOption[] = [
  { value: "YES", label: "Ada" },
  { value: "NO", label: "Ga ada" }
];

export const ASSET_OPTIONS: OnboardingOption[] = [
  { value: AssetType.SAVINGS, label: "Tabungan" },
  { value: AssetType.GOLD, label: "Emas" },
  { value: AssetType.STOCK, label: "Saham" },
  { value: AssetType.PROPERTY, label: "Properti" },
  { value: ASSET_NONE_VALUE, label: "Belum punya" }
];

const needsSalaryDate = (employmentTypes: EmploymentType[]) =>
  employmentTypes.includes(EmploymentType.EMPLOYEE);

const needsActiveIncomeQuestion = (employmentTypes: EmploymentType[]) => {
  if (employmentTypes.includes(EmploymentType.EMPLOYEE)) return false;
  return employmentTypes.some((item) => item === EmploymentType.STUDENT || item === EmploymentType.OTHER);
};

const usesEstimatedIncome = (employmentTypes: EmploymentType[]) => {
  if (employmentTypes.includes(EmploymentType.EMPLOYEE)) return false;
  if (employmentTypes.some((item) => item === EmploymentType.STUDENT || item === EmploymentType.OTHER)) {
    return false;
  }
  return true;
};

const goalLabel = (goalType: FinancialGoalType | null) => {
  switch (goalType) {
    case FinancialGoalType.EMERGENCY_FUND:
      return "Dana Darurat";
    case FinancialGoalType.HOUSE:
      return "Beli Rumah";
    case FinancialGoalType.VEHICLE:
      return "Beli Kendaraan";
    case FinancialGoalType.VACATION:
      return "Liburan";
    case FinancialGoalType.CUSTOM:
      return "Custom Target";
    default:
      return "Target Keuangan";
  }
};

const assetLabel = (assetType: AssetType | null) => {
  switch (assetType) {
    case AssetType.SAVINGS:
      return "Tabungan";
    case AssetType.GOLD:
      return "Emas";
    case AssetType.STOCK:
      return "Saham";
    case AssetType.CRYPTO:
      return "Crypto";
    case AssetType.MUTUAL_FUND:
      return "Reksa dana";
    case AssetType.PROPERTY:
      return "Properti";
    default:
      return "Aset";
  }
};

const getAssetNamePromptBody = (assetType: AssetType | null) => {
  switch (assetType) {
    case AssetType.SAVINGS:
      return "Di bank mana tabungannya?";
    case AssetType.STOCK:
      return "Apa kode sahamnya? Contoh: `BBRI` atau `TLKM`.";
    case AssetType.PROPERTY:
      return "Properti apa yang kamu punya? Contoh: `rumah`, `tanah`, atau `apartemen`.";
    case AssetType.GOLD:
      return "Emas apa yang kamu punya? Contoh: `Antam`, `perhiasan 24K`, atau `emas digital`.";
    default:
      return "Apa nama asetnya?";
  }
};

const getAssetValuePromptBody = (assetType: AssetType | null) => {
  switch (assetType) {
    case AssetType.SAVINGS:
      return "Berapa saldo tabungannya? (dalam Rupiah)";
    case AssetType.STOCK:
      return "Berapa harga beli per lembar sahamnya? (dalam Rupiah)";
    case AssetType.PROPERTY:
      return "Berapa estimasi nilai propertinya? (dalam Rupiah)";
    case AssetType.GOLD:
      return "Berapa estimasi nilai emasnya? (dalam Rupiah)";
    default:
      return "Berapa nominalnya?";
  }
};

export const getPromptForStep = (
  step: OnboardingStep,
  context: OnboardingPromptContext
): OnboardingPrompt => {
  switch (step) {
    case OnboardingStep.WAIT_REGISTER:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.START_CONFIRMATION,
        title: "Halo Boss",
        body: [
          "Halo Boss",
          "",
          "Saya calon asisten keuangan pribadi anda",
          "",
          "Saya bisa membantu mencatat pemasukan & pengeluaran, memantau tabungan, memberi insight keuangan, dan mempresentasikannya setiap saat",
          "",
          "Boss siap memulai?",
          "Kalau sudah siap, langsung balas saja ya Boss."
        ].join("\n"),
        inputType: "single_select",
        options: START_OPTIONS
      };
    case OnboardingStep.VERIFY_PHONE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.PHONE_VERIFICATION,
        title: "Verifikasi Nomor",
        body:
          "Sebelum lanjut, kirim nomor WhatsApp aktif Anda dulu.\nFormat: `62812xxxxxx`.",
        inputType: "text"
      };
    case OnboardingStep.ASK_PRIMARY_GOAL:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.PRIMARY_GOAL,
        title: "Tujuan Utama",
        body: "Apa tujuan utama kamu pakai AI Finance ini?",
        inputType: "single_select",
        options: PRIMARY_GOAL_OPTIONS
      };
    case OnboardingStep.ASK_EMPLOYMENT_TYPES:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.EMPLOYMENT_TYPES,
        title: "Status Pekerjaan",
        body:
          "Boleh tahu status pekerjaan anda saat ini Boss?\nBisa pilih lebih dari satu kalau perannya campuran, misalnya `Karyawan, Pengusaha`.",
        inputType: "multi_select",
        options: EMPLOYMENT_OPTIONS
      };
    case OnboardingStep.ASK_HAS_ACTIVE_INCOME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.HAS_ACTIVE_INCOME,
        title: "Active Income",
        body: "Ada active income Boss?",
        inputType: "single_select",
        options: YES_NO_OPTIONS
      };
    case OnboardingStep.ASK_ACTIVE_INCOME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ACTIVE_INCOME_MONTHLY,
        title: "Active Income",
        body: "Aktif income berapa Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_SALARY_DATE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.SALARY_DATE,
        title: "Tanggal Gajian",
        body: "Tanggal berapa gajian Boss? Balas angka 1-31 ya.",
        inputType: "integer"
      };
    case OnboardingStep.ASK_HAS_PASSIVE_INCOME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.HAS_PASSIVE_INCOME,
        title: "Passive Income",
        body: "Ada passive income Boss?",
        inputType: "single_select",
        options: YES_NO_OPTIONS
      };
    case OnboardingStep.ASK_PASSIVE_INCOME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.PASSIVE_INCOME_MONTHLY,
        title: "Passive Income",
        body: "Berapa kira-kira pendapatan passive income anda Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ESTIMATED_MONTHLY_INCOME,
        title: "Estimasi Income",
        body: "Berapa kira-kira total pendapatan anda per bulan Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_BUDGET_MODE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.BUDGET_MODE,
        title: "Perencanaan Pengeluaran",
        body: "Apakah saat ini Boss sudah memiliki perencanaan alokasi pengeluaran bulanan?",
        inputType: "single_select",
        options: BUDGET_MODE_OPTIONS
      };
    case OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.MANUAL_EXPENSE_BREAKDOWN,
        title: "Alokasi Bulanan",
        body: [
          "Baik Boss. Agar saya bisa membantu memantau keuangan Boss dengan lebih akurat, kirim aja alokasi pengeluaran bulanan Boss dengan gaya bebas.",
          "Saya akan baca otomatis kategori dan nominalnya. Kalau ada kategori lain seperti keluarga, istri, cicilan, atau kebutuhan lain, nanti saya masukin ke lainnya.",
          "",
          "Contoh kalau mau:",
          "Makan: 1500000",
          "Transport: 500000",
          "Tagihan: 700000",
          "Hiburan: 800000",
          "Lainnya: 300000"
        ].join("\n"),
        inputType: "text"
      };
    case OnboardingStep.ASK_GUIDED_EXPENSE_FOOD:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_FOOD,
        title: "Pengeluaran Makan",
        body: context.goalExpenseStrategy === "HELP_CALCULATE"
          ? "Bantu saya hitung dulu pengeluaran bulanan Boss ya. Biasanya pengeluaran untuk makan dan minum per bulan sekitar berapa?"
          : "Biasanya pengeluaran untuk makan dan minum per bulan sekitar berapa?",
        inputType: "money"
      };
    case OnboardingStep.ASK_GUIDED_EXPENSE_TRANSPORT:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_TRANSPORT,
        title: "Pengeluaran Transport",
        body: "Pengeluaran transport per bulan sekitar berapa?",
        inputType: "money"
      };
    case OnboardingStep.ASK_GUIDED_EXPENSE_BILLS:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_BILLS,
        title: "Pengeluaran Tagihan",
        body: "Tagihan rutin (listrik, internet, dll) sekitar berapa?",
        inputType: "money"
      };
    case OnboardingStep.ASK_GUIDED_EXPENSE_ENTERTAINMENT:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_ENTERTAINMENT,
        title: "Pengeluaran Hiburan",
        body: "Pengeluaran hiburan atau nongkrong sekitar berapa?",
        inputType: "money"
      };
    case OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_OTHERS,
        title: "Pengeluaran Lainnya",
        body: "Pengeluaran lain-lain kira-kira berapa? Kalau tidak ada, balas `0`.",
        inputType: "money"
      };
    case OnboardingStep.ASK_GOAL_SELECTION:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_SELECTION,
        title: "Target Keuangan",
        body: "Apa saja target keuangan yang ingin kamu capai? Pilih satu dulu, nanti bisa tambah lagi.",
        inputType: "single_select",
        options: GOAL_OPTIONS
      };
    case OnboardingStep.ASK_GOAL_CUSTOM_NAME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_CUSTOM_NAME,
        title: "Custom Target",
        body: "Nama custom targetnya apa Boss?",
        inputType: "text"
      };
    case OnboardingStep.ASK_GOAL_TARGET_AMOUNT:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
        title: goalLabel(context.currentGoalType),
        body:
          context.currentGoalType === FinancialGoalType.HOUSE
            ? "Rumahnya harga berapa Boss?"
            : context.currentGoalType === FinancialGoalType.VEHICLE
              ? "Kendaraannya harga berapa Boss?"
              : context.currentGoalType === FinancialGoalType.VACATION
                ? "Liburannya butuh berapa Boss?"
                : context.currentGoalType === FinancialGoalType.CUSTOM
                  ? "Nominal targetnya berapa Boss?"
                  : "Target nominalnya berapa Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_GOAL_EXPENSE_STRATEGY:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_EXPENSE_STRATEGY,
        title: goalLabel(context.currentGoalType),
        body: [
          "Boss saya belum bisa menghitung Dana Darurat kalau belum ada data pengeluaran bulanan.",
          "Pilih salah satu ya:"
        ].join("\n"),
        inputType: "single_select",
        options: GOAL_EXPENSE_STRATEGY_OPTIONS
      };
    case OnboardingStep.ASK_GOAL_EXPENSE_TOTAL:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_EXPENSE_TOTAL,
        title: goalLabel(context.currentGoalType),
        body: "Siap Boss. Berapa total pengeluaran bulanan Boss saat ini?",
        inputType: "money"
      };
    case OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_FINANCIAL_FREEDOM_AGE,
        title: "Target Tidak Tersedia",
        body:
          "Target financial freedom sudah tidak didukung lagi. Balas pesan apa saja untuk lanjut ke target lain ya Boss.",
        inputType: "text",
        allowSkip: true
      };
    case OnboardingStep.ASK_GOAL_ADD_MORE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_ADD_MORE,
        title: "Tambah Target",
        body: "Ada lagi ga Boss?",
        inputType: "single_select",
        options: ADD_MORE_OPTIONS
      };
    case OnboardingStep.ASK_ASSET_SELECTION:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_SELECTION,
        title: "Aset atau Investasi",
        body: "Aset apa yang mau kamu catat dulu? Pilih satu ya.",
        inputType: "single_select",
        options: ASSET_OPTIONS
      };
    case OnboardingStep.ASK_ASSET_GOLD_NAME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_GOLD_NAME,
        title: "Detail Emas",
        body: "Jenis emas apa nih Boss? Contoh: `Antam 24 karat`.",
        inputType: "text"
      };
    case OnboardingStep.ASK_ASSET_GOLD_GRAMS:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_GOLD_GRAMS,
        title: context.currentAssetType === AssetType.STOCK ? "Jumlah Saham" : "Berat Emas",
        body:
          context.currentAssetType === AssetType.STOCK
            ? "Berapa yang kamu punya? (bisa jawab dalam lot atau lembar, contoh: `2 lot` atau `150 lembar`)"
            : "Berapa gram? Contoh: `900 gram` atau `10.5`.",
        inputType: context.currentAssetType === AssetType.STOCK ? "text" : "decimal"
      };
    case OnboardingStep.ASK_ASSET_NAME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_NAME,
        title: assetLabel(context.currentAssetType),
        body: getAssetNamePromptBody(context.currentAssetType),
        inputType: "text"
      };
    case OnboardingStep.ASK_ASSET_ESTIMATED_VALUE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_ESTIMATED_VALUE,
        title: assetLabel(context.currentAssetType),
        body: getAssetValuePromptBody(context.currentAssetType),
        inputType: "money"
      };
    case OnboardingStep.ASK_ASSET_ADD_MORE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_ADD_MORE,
        title: "Tambah Aset",
        body: "Apakah ada aset lain yang ingin kamu tambahkan?",
        inputType: "single_select",
        options: ADD_MORE_OPTIONS
      };
    case OnboardingStep.SHOW_ANALYSIS:
    case OnboardingStep.COMPLETED:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.START_CONFIRMATION,
        title: "Onboarding Selesai",
        body: "Onboarding sudah selesai.",
        inputType: "text"
      };
  }
};

export const getNextOnboardingStep = (
  currentStep: OnboardingStep,
  context: OnboardingPromptContext,
  answer: unknown
): OnboardingStep => {
  switch (currentStep) {
    case OnboardingStep.WAIT_REGISTER:
      return context.needsPhoneVerification ? OnboardingStep.VERIFY_PHONE : OnboardingStep.ASK_PRIMARY_GOAL;
    case OnboardingStep.VERIFY_PHONE:
      return OnboardingStep.ASK_PRIMARY_GOAL;
    case OnboardingStep.ASK_PRIMARY_GOAL:
      return OnboardingStep.ASK_EMPLOYMENT_TYPES;
    case OnboardingStep.ASK_EMPLOYMENT_TYPES:
      if (needsActiveIncomeQuestion(context.employmentTypes)) {
        return OnboardingStep.ASK_HAS_ACTIVE_INCOME;
      }
      if (usesEstimatedIncome(context.employmentTypes)) {
        return OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME;
      }
      return OnboardingStep.ASK_ACTIVE_INCOME;
    case OnboardingStep.ASK_HAS_ACTIVE_INCOME:
      return answer === true ? OnboardingStep.ASK_ACTIVE_INCOME : OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME;
    case OnboardingStep.ASK_ACTIVE_INCOME:
      return needsSalaryDate(context.employmentTypes)
        ? OnboardingStep.ASK_SALARY_DATE
        : OnboardingStep.ASK_HAS_PASSIVE_INCOME;
    case OnboardingStep.ASK_SALARY_DATE:
      return OnboardingStep.ASK_HAS_PASSIVE_INCOME;
    case OnboardingStep.ASK_HAS_PASSIVE_INCOME:
      return answer === true ? OnboardingStep.ASK_PASSIVE_INCOME : OnboardingStep.ASK_BUDGET_MODE;
    case OnboardingStep.ASK_PASSIVE_INCOME:
    case OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME:
      return OnboardingStep.ASK_BUDGET_MODE;
    case OnboardingStep.ASK_BUDGET_MODE:
      if (answer === BudgetMode.MANUAL_PLAN) return OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN;
      if (answer === BudgetMode.GUIDED_PLAN) return OnboardingStep.ASK_GUIDED_EXPENSE_FOOD;
      return OnboardingStep.ASK_GOAL_SELECTION;
    case OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN:
      return OnboardingStep.ASK_GOAL_SELECTION;
    case OnboardingStep.ASK_GUIDED_EXPENSE_FOOD:
      return OnboardingStep.ASK_GUIDED_EXPENSE_TRANSPORT;
    case OnboardingStep.ASK_GUIDED_EXPENSE_TRANSPORT:
      return OnboardingStep.ASK_GUIDED_EXPENSE_BILLS;
    case OnboardingStep.ASK_GUIDED_EXPENSE_BILLS:
      return OnboardingStep.ASK_GUIDED_EXPENSE_ENTERTAINMENT;
    case OnboardingStep.ASK_GUIDED_EXPENSE_ENTERTAINMENT:
      return OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS;
    case OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS:
      if (context.goalExpenseStrategy === "HELP_CALCULATE" && context.currentGoalType) {
        return OnboardingStep.ASK_GOAL_ADD_MORE;
      }
      return OnboardingStep.ASK_GOAL_SELECTION;
    case OnboardingStep.ASK_GOAL_SELECTION:
      if (answer === GOAL_NONE_VALUE) return OnboardingStep.ASK_ASSET_SELECTION;
      if (answer === FinancialGoalType.CUSTOM) return OnboardingStep.ASK_GOAL_CUSTOM_NAME;
      if (answer === FinancialGoalType.EMERGENCY_FUND) {
        return context.expenseAvailable
          ? OnboardingStep.ASK_GOAL_ADD_MORE
          : OnboardingStep.ASK_GOAL_EXPENSE_STRATEGY;
      }
      return OnboardingStep.ASK_GOAL_TARGET_AMOUNT;
    case OnboardingStep.ASK_GOAL_CUSTOM_NAME:
      return OnboardingStep.ASK_GOAL_TARGET_AMOUNT;
    case OnboardingStep.ASK_GOAL_TARGET_AMOUNT:
      return OnboardingStep.ASK_GOAL_ADD_MORE;
    case OnboardingStep.ASK_GOAL_EXPENSE_STRATEGY:
      if (answer === "HELP_CALCULATE") return OnboardingStep.ASK_GUIDED_EXPENSE_FOOD;
      if (answer === "HAVE_DATA") return OnboardingStep.ASK_GOAL_EXPENSE_TOTAL;
      return OnboardingStep.ASK_GOAL_ADD_MORE;
    case OnboardingStep.ASK_GOAL_EXPENSE_TOTAL:
      return OnboardingStep.ASK_GOAL_ADD_MORE;
    case OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE:
      return OnboardingStep.ASK_GOAL_ADD_MORE;
    case OnboardingStep.ASK_GOAL_ADD_MORE:
      return answer === true ? OnboardingStep.ASK_GOAL_SELECTION : OnboardingStep.ASK_ASSET_SELECTION;
    case OnboardingStep.ASK_ASSET_SELECTION:
      if (answer === ASSET_NONE_VALUE) return OnboardingStep.SHOW_ANALYSIS;
      return OnboardingStep.ASK_ASSET_NAME;
    case OnboardingStep.ASK_ASSET_GOLD_NAME:
      return OnboardingStep.ASK_ASSET_GOLD_GRAMS;
    case OnboardingStep.ASK_ASSET_GOLD_GRAMS:
      return context.currentAssetType === AssetType.STOCK
        ? OnboardingStep.ASK_ASSET_ESTIMATED_VALUE
        : OnboardingStep.ASK_ASSET_ADD_MORE;
    case OnboardingStep.ASK_ASSET_NAME:
      return context.currentAssetType === AssetType.STOCK
        ? OnboardingStep.ASK_ASSET_GOLD_GRAMS
        : OnboardingStep.ASK_ASSET_ESTIMATED_VALUE;
    case OnboardingStep.ASK_ASSET_ESTIMATED_VALUE:
      return OnboardingStep.ASK_ASSET_ADD_MORE;
    case OnboardingStep.ASK_ASSET_ADD_MORE:
      return answer === true ? OnboardingStep.ASK_ASSET_SELECTION : OnboardingStep.SHOW_ANALYSIS;
    case OnboardingStep.SHOW_ANALYSIS:
      return OnboardingStep.COMPLETED;
    case OnboardingStep.COMPLETED:
      return OnboardingStep.COMPLETED;
  }
};

const shouldRenderPromptOptions = (prompt: OnboardingPrompt) => {
  if (!prompt.options?.length || prompt.options.length <= 1) return false;
  if (prompt.options === YES_NO_OPTIONS || prompt.options === ADD_MORE_OPTIONS) return false;
  return true;
};

export const formatPromptForChat = (prompt: OnboardingPrompt) => {
  const lines = [prompt.body];
  if (shouldRenderPromptOptions(prompt)) {
    const options = prompt.options ?? [];
    lines.push("");
    lines.push("Pilihan:");
    for (const [index, option] of options.entries()) {
      lines.push(`${index + 1}. ${option.label}`);
    }
  }
  return lines.join("\n").trim();
};


