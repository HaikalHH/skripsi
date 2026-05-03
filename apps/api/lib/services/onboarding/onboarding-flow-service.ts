import {
  AssetType,
  BudgetMode,
  EmploymentType,
  FinancialGoalType,
  GoalExecutionMode,
  OnboardingQuestionKey,
  OnboardingStep,
  PrimaryGoal
} from "@prisma/client";
import { formatMoney, formatPercent } from "@/lib/services/shared/money-format";

export type OnboardingInputType =
  | "single_select"
  | "multi_select"
  | "money"
  | "integer"
  | "decimal"
  | "month"
  | "text";

export type OnboardingOption = {
  value: string;
  label: string;
};

export type GoalSelectionValue = FinancialGoalType | "NONE_YET";
export type GoalExpenseStrategyValue = "HELP_CALCULATE" | "HAVE_DATA" | "SKIP";
export type AssetSelectionValue = AssetType | "NONE";
export type GoalExecutionModeValue = GoalExecutionMode;
export type GoldAssetTypeValue = "BULLION" | "JEWELRY" | "DIGITAL";
export type GoldAssetBrandValue = "ANTAM" | "UBS" | "GALERI24" | "OTHER";
export type GoldAssetKaratValue = "24K" | "23K" | "22K" | "18K" | "17K";
export type GoldAssetPlatformValue = "PEGADAIAN" | "OTHER";

export type OnboardingPromptContext = {
  needsPhoneVerification: boolean;
  budgetMode: BudgetMode | null;
  employmentTypes: EmploymentType[];
  activeGoalCount?: number;
  selectedGoalTypes?: FinancialGoalType[];
  latestCustomGoalName?: string | null;
  goalExecutionMode?: GoalExecutionMode | null;
  priorityGoalType?: FinancialGoalType | null;
  hasChosenGoalExecutionMode?: boolean;
  hasChosenPriorityGoal?: boolean;
  hasFinancialFreedomTargetPreference?: boolean;
  hasPersonalizationPending?: boolean;
  pendingGoalStep?: OnboardingStep | null;
  currentGoalType: FinancialGoalType | null;
  pendingAssetStep?: OnboardingStep | null;
  currentAssetType: AssetType | null;
  currentGoldType?: GoldAssetTypeValue | null;
  hasCurrentMutualFundUnits?: boolean;
  expenseAvailable: boolean;
  hasExpenseDependentGoal: boolean;
  hasFinancialFreedomGoal: boolean;
  goalExpenseStrategy: GoalExpenseStrategyValue | null;
  monthlyIncomeTotal: number | null;
  monthlyExpenseTotal: number | null;
  potentialMonthlySaving: number | null;
  guidedOtherExpenseStage?: "presence" | "category_name" | "category_amount" | "add_more";
  guidedOtherExpensePendingLabel?: string | null;
  guidedOtherExpenseItems?: Array<{
    label: string;
    amount: number;
  }>;
  financialFreedomEtaMonths: number | null;
  financialFreedomTargetAmount?: number | null;
  financialFreedomMonthlyAllocation?: number | null;
  financialFreedomProjectionBasis?: string | null;
  financialFreedomPriorityGoalName?: string | null;
  financialFreedomStartLabel?: string | null;
  financialFreedomProjectedMonthlyContribution?: number | null;
  financialFreedomSafeWithdrawalRate?: number | null;
  financialFreedomSafeAnnualWithdrawal?: number | null;
  financialFreedomSafeMonthlyWithdrawal?: number | null;
};

export type OnboardingPrompt = {
  stepKey: OnboardingStep;
  questionKey: OnboardingQuestionKey;
  title: string;
  body: string;
  chatBubbleBodies?: string[];
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
  { value: PrimaryGoal.FINANCIAL_FREEDOM, label: "Menuju financial freedom" },
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
  { value: BudgetMode.MANUAL_PLAN, label: "Saya sudah punya gambaran pengeluaran" },
  { value: BudgetMode.GUIDED_PLAN, label: "Saya belum punya, tolong bantu susun" },
  {
    value: BudgetMode.AUTO_FROM_TRANSACTIONS,
    label: "Lihat dari catatan transaksi saya bulan ini"
  }
];

export const GOAL_OPTIONS: OnboardingOption[] = [
  { value: FinancialGoalType.EMERGENCY_FUND, label: "Nabung dana darurat" },
  { value: FinancialGoalType.HOUSE, label: "Beli rumah" },
  { value: FinancialGoalType.VEHICLE, label: "Beli kendaraan" },
  { value: FinancialGoalType.VACATION, label: "Liburan" },
  { value: FinancialGoalType.FINANCIAL_FREEDOM, label: "Financial freedom" },
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

const normalizeEmploymentTypeList = (
  employmentTypes: EmploymentType[] | EmploymentType | null | undefined
) =>
  Array.isArray(employmentTypes)
    ? employmentTypes
    : employmentTypes
      ? [employmentTypes]
      : [];

const needsSalaryDate = (employmentTypes: EmploymentType[] | EmploymentType | null | undefined) =>
  normalizeEmploymentTypeList(employmentTypes).includes(EmploymentType.EMPLOYEE);

const needsActiveIncomeQuestion = (
  employmentTypes: EmploymentType[] | EmploymentType | null | undefined
) => {
  const normalizedEmploymentTypes = normalizeEmploymentTypeList(employmentTypes);
  if (normalizedEmploymentTypes.includes(EmploymentType.EMPLOYEE)) return false;
  return normalizedEmploymentTypes.some(
    (item) => item === EmploymentType.STUDENT || item === EmploymentType.OTHER
  );
};

const usesEstimatedIncome = (
  employmentTypes: EmploymentType[] | EmploymentType | null | undefined
) => {
  const normalizedEmploymentTypes = normalizeEmploymentTypeList(employmentTypes);
  if (normalizedEmploymentTypes.includes(EmploymentType.EMPLOYEE)) return false;
  if (
    normalizedEmploymentTypes.some(
      (item) => item === EmploymentType.STUDENT || item === EmploymentType.OTHER
    )
  ) {
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
    case FinancialGoalType.FINANCIAL_FREEDOM:
      return "Financial Freedom";
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

const goalSelectionLabel = (
  goalType: FinancialGoalType,
  latestCustomGoalName?: string | null
) => {
  if (goalType === FinancialGoalType.CUSTOM) {
    return latestCustomGoalName?.trim() || "Custom target";
  }

  return GOAL_OPTIONS.find((option) => option.value === goalType)?.label ?? goalLabel(goalType);
};

const goldTypeLabel = (goldType: GoldAssetTypeValue | null | undefined) => {
  switch (goldType) {
    case "BULLION":
      return "emas batangan";
    case "JEWELRY":
      return "perhiasan emas";
    case "DIGITAL":
      return "emas digital";
    default:
      return "emas";
  }
};

const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat("id-ID", {
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

const getTargetMonthYearExamples = () => {
  const { month, year } = getCurrentJakartaMonthYear();
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const numeric = `${String(nextMonth).padStart(2, "0")}/${nextYear}`;
  const long = MONTH_YEAR_FORMATTER.format(new Date(Date.UTC(nextYear, nextMonth - 1, 1, 12)));

  return { numeric, long };
};

const getCompletionStep = (context: OnboardingPromptContext) =>
  context.needsPhoneVerification ? OnboardingStep.VERIFY_PHONE : OnboardingStep.SHOW_ANALYSIS;

const getPostGoalStep = (_context: OnboardingPromptContext) => OnboardingStep.ASK_BUDGET_MODE;

const getNextPersonalizationStep = (context: OnboardingPromptContext) => {
  if (context.pendingGoalStep) {
    return context.pendingGoalStep;
  }

  if (
    context.hasFinancialFreedomGoal &&
    context.expenseAvailable &&
    !context.hasFinancialFreedomTargetPreference
  ) {
    return OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE;
  }

  return getCompletionStep(context);
};

const buildGoalPriorityOptions = (context: OnboardingPromptContext): OnboardingOption[] =>
  (context.selectedGoalTypes ?? []).map((goalType) => ({
    value: goalType,
    label: goalSelectionLabel(goalType, context.latestCustomGoalName)
  }));

const getMonthYearLabelFromNow = (monthsFromNow: number) => {
  const now = new Date();
  const totalMonths = now.getUTCFullYear() * 12 + now.getUTCMonth() + Math.max(1, monthsFromNow);
  const year = Math.floor(totalMonths / 12);
  const monthIndex = totalMonths % 12;
  return MONTH_YEAR_FORMATTER.format(new Date(Date.UTC(year, monthIndex, 1, 12)));
};

const FAR_FINANCIAL_FREEDOM_ETA_MONTHS = 30 * 12;

const getEtaDistanceLabel = (monthsFromNow: number) => {
  const roundedMonths = Math.max(1, Math.ceil(monthsFromNow));
  if (roundedMonths < 24) return `${roundedMonths} bulan lagi`;

  const roundedYears = Math.round(roundedMonths / 12);
  return `${roundedYears} tahun lagi`;
};

const buildFinancialFreedomTimelineLines = (context: OnboardingPromptContext) => {
  const lines: string[] = [];
  const completionLabel =
    context.financialFreedomEtaMonths !== null
      ? getMonthYearLabelFromNow(Math.ceil(context.financialFreedomEtaMonths))
      : null;

  if (context.financialFreedomStartLabel) {
    lines.push(`Mulai alokasi FF realistis: ${context.financialFreedomStartLabel}`);
  }

  if (context.financialFreedomStartLabel && completionLabel) {
    lines.push(`Periode kumpul: ${context.financialFreedomStartLabel} -> ${completionLabel}`);
  } else if (completionLabel) {
    lines.push(`Estimasi selesai: ${completionLabel}`);
  }

  if (context.financialFreedomTargetAmount && context.financialFreedomTargetAmount > 0) {
    lines.push(`Target dana FF: ${formatMoney(context.financialFreedomTargetAmount)}`);
  }

  if (
    context.financialFreedomProjectedMonthlyContribution !== null &&
    context.financialFreedomProjectedMonthlyContribution !== undefined &&
    context.financialFreedomProjectedMonthlyContribution > 0
  ) {
    lines.push(
      `Porsi nabung FF yang dipakai: ${formatMoney(context.financialFreedomProjectedMonthlyContribution)}/bulan`
    );
  }

  return lines;
};

const buildFinancialFreedomWithdrawalLines = (context: OnboardingPromptContext) => {
  if (
    !context.financialFreedomSafeWithdrawalRate ||
    context.financialFreedomSafeWithdrawalRate <= 0 ||
    !context.financialFreedomSafeAnnualWithdrawal ||
    context.financialFreedomSafeAnnualWithdrawal <= 0 ||
    !context.financialFreedomSafeMonthlyWithdrawal ||
    context.financialFreedomSafeMonthlyWithdrawal <= 0
  ) {
    return [];
  }

  return [
    `Patokan tarik aman: ${formatPercent(context.financialFreedomSafeWithdrawalRate * 100, 1)}/tahun`,
    `Sekitar ${formatMoney(context.financialFreedomSafeAnnualWithdrawal)}/tahun atau ${formatMoney(
      context.financialFreedomSafeMonthlyWithdrawal
    )}/bulan`
  ];
};

const buildFinancialFreedomAllocationNote = (context: OnboardingPromptContext) => {
  const blockingGoalName =
    context.financialFreedomPriorityGoalName ??
    (context.priorityGoalType &&
    context.priorityGoalType !== FinancialGoalType.FINANCIAL_FREEDOM
      ? context.priorityGoalType === FinancialGoalType.CUSTOM
        ? context.latestCustomGoalName?.trim() || "Custom target"
        : goalLabel(context.priorityGoalType)
      : null);

  if (
    context.potentialMonthlySaving === null ||
    context.potentialMonthlySaving <= 0 ||
    (context.selectedGoalTypes?.length ?? 0) <= 1 ||
    !blockingGoalName
  ) {
    return null;
  }

  const allocation = context.financialFreedomMonthlyAllocation;

  if (allocation !== undefined && allocation !== null) {
    if (allocation <= 0) {
      return context.goalExecutionMode === GoalExecutionMode.PARALLEL
        ? `Catatan: ${formatMoney(context.potentialMonthlySaving)}/bulan itu masih ruang tabung total. Setelah target ${blockingGoalName} tetap jalan, porsi financial freedom belum kebentuk jelas.`
        : `Catatan: ${formatMoney(context.potentialMonthlySaving)}/bulan itu masih ruang tabung total. Karena target di depan masih ${blockingGoalName}, saya belum anggap angka ini bisa dipakai buat financial freedom dulu.`;
    }

    if (allocation < context.potentialMonthlySaving) {
      return context.goalExecutionMode === GoalExecutionMode.PARALLEL
        ? `Catatan: ${formatMoney(context.potentialMonthlySaving)}/bulan itu masih ruang tabung total. Setelah target ${blockingGoalName} tetap jalan, porsi realistis buat financial freedom sementara sekitar ${formatMoney(allocation)}/bulan.`
        : `Catatan: ${formatMoney(context.potentialMonthlySaving)}/bulan itu masih ruang tabung total. Proyeksi financial freedom saya taruh setelah target ${blockingGoalName}, bukan dari seluruh sisa uang sejak bulan pertama.`;
    }
  }

  return context.goalExecutionMode === GoalExecutionMode.PARALLEL
    ? `Catatan: angka ini masih ruang tabung total. Karena target ${blockingGoalName} juga tetap jalan bareng, porsi realistis buat financial freedom kemungkinan lebih kecil dari angka ini.`
    : `Catatan: angka ini masih ruang tabung total. Karena target di depan masih ${blockingGoalName}, porsi buat financial freedom belum tentu bisa pakai angka ini penuh.`;
};

const buildFinancialFreedomParallelSuggestion = (context: OnboardingPromptContext) => {
  const surplus = Math.max(0, context.potentialMonthlySaving ?? 0);
  const blockingGoalName = context.financialFreedomPriorityGoalName;

  if (
    surplus <= 0 ||
    !blockingGoalName ||
    (context.financialFreedomProjectionBasis !== "AFTER_PRIORITY_GOAL" &&
      context.financialFreedomProjectionBasis !== "BLOCKED_BY_PRIORITY")
  ) {
    return null;
  }

  const suggestedLow = Math.max(100000, Math.round((surplus * 0.05) / 100000) * 100000);
  const suggestedHigh = Math.max(suggestedLow, Math.round((surplus * 0.1) / 100000) * 100000);

  return [
    `Kalau semua target diselesaikan satu per satu, financial freedom jadi mundur jauh karena ${blockingGoalName} masih ambil ruang dulu.`,
    `Biar tetap jalan, saya saranin sisihkan kecil dulu dari sekarang, misalnya ${formatMoney(suggestedLow)} sampai ${formatMoney(suggestedHigh)}/bulan.`
  ].join("\n");
};

const buildFinancialFreedomProjectionBody = (context: OnboardingPromptContext) => {
  const incomeLine =
    context.monthlyIncomeTotal !== null
      ? `Dari data yang sudah masuk, pemasukan bulanan kamu sekitar ${formatMoney(context.monthlyIncomeTotal)}`
      : "Saya sudah punya gambaran pemasukan bulanan kamu";
  const expenseLine =
    context.monthlyExpenseTotal !== null
      ? `pengeluaran bulanan sekitar ${formatMoney(context.monthlyExpenseTotal)}`
      : "dan gambaran pengeluaran bulanan kamu juga sudah ada";

  const etaText =
    context.financialFreedomEtaMonths !== null
      ? context.financialFreedomEtaMonths >= FAR_FINANCIAL_FREEDOM_ETA_MONTHS
        ? `target financial freedom ini masih sangat jauh. Estimasi kasarnya sekitar ${getMonthYearLabelFromNow(Math.ceil(context.financialFreedomEtaMonths))}, atau kurang lebih ${getEtaDistanceLabel(context.financialFreedomEtaMonths)} dari sekarang.`
        : `estimasi kasarnya sekitar ${getMonthYearLabelFromNow(Math.ceil(context.financialFreedomEtaMonths))}.`
      : null;
  const priorityGoalName = context.financialFreedomPriorityGoalName;
  const allocation = context.financialFreedomMonthlyAllocation;
  const projectionBasis = context.financialFreedomProjectionBasis;

  const paceLine =
    context.potentialMonthlySaving !== null && context.potentialMonthlySaving <= 0
      ? "Saat ini sisa uang bulanannya masih sangat tipis, jadi target financial freedom belum kebentuk dengan jelas dari kondisi sekarang."
      : projectionBasis === "RESIDUAL_AFTER_PRIORITY" && priorityGoalName
        ? etaText
          ? `Karena target ${priorityGoalName} tetap jalan bareng, proyeksi ini pakai sisa alokasi financial freedom, bukan seluruh surplus. Dengan basis itu, ${etaText}`
          : `Karena target ${priorityGoalName} tetap jalan bareng, proyeksi financial freedom belum bisa saya finalkan dari data sekarang.`
        : projectionBasis === "AFTER_PRIORITY_GOAL" && priorityGoalName
          ? etaText
            ? `Karena target di depan masih ${priorityGoalName}, proyeksi ini saya hitung setelah target-target itu diberi ruang dulu. Dengan urutan itu, ${etaText}`
            : `Karena target di depan masih ${priorityGoalName}, target financial freedom belum saya hitung seolah-olah seluruh surplus langsung masuk ke sana.`
          : projectionBasis === "BLOCKED_BY_PRIORITY" && priorityGoalName
            ? `Kalau target ${priorityGoalName} tetap jalan bareng, sisa alokasi financial freedom belum kebentuk jelas dari surplus sekarang.`
            : etaText
              ? `Kalau pola uangnya tetap seperti sekarang dan belum ada target lain yang mengambil porsi, ${etaText}`
              : "Arah ke target financial freedom ini sudah mulai kelihatan, dan nanti saya bantu rapihin langkahnya.";

  const reserveLine =
    context.potentialMonthlySaving !== null
      ? context.potentialMonthlySaving > 0
        ? `Ruang tabung total yang kebaca sekarang sekitar ${formatMoney(context.potentialMonthlySaving)}/bulan.`
        : "Nggak apa-apa kalau sekarang masih sempit, nanti kita benahi pelan-pelan."
      : null;
  const freedomAllocationLine =
    allocation !== undefined && allocation !== null && allocation > 0
      ? context.potentialMonthlySaving !== null && allocation < context.potentialMonthlySaving
        ? `Porsi sementara untuk financial freedom saya pakai sekitar ${formatMoney(allocation)}/bulan.`
        : `Kalau tidak ada target lain yang lebih prioritas, batas atas alokasi financial freedom sekitar ${formatMoney(allocation)}/bulan.`
      : projectionBasis === "BLOCKED_BY_PRIORITY" && priorityGoalName
        ? `Untuk financial freedom, porsinya belum saya kunci karena ${priorityGoalName} masih perlu mengambil ruang dulu.`
        : null;
  const allocationNote = buildFinancialFreedomAllocationNote(context);
  const parallelSuggestion = buildFinancialFreedomParallelSuggestion(context);

  const timelineLines = buildFinancialFreedomTimelineLines(context);
  const withdrawalLines = buildFinancialFreedomWithdrawalLines(context);

  const sections = [
    [
      "📌 Gambaran sekarang",
      context.potentialMonthlySaving !== null
        ? `${incomeLine} dengan ${expenseLine}, jadi surplus sekitar ${formatMoney(context.potentialMonthlySaving)} per bulan.`
        : `${incomeLine} dan ${expenseLine}.`,
      context.financialFreedomTargetAmount && context.financialFreedomTargetAmount > 0
        ? `Patokan dana financial freedom yang sedang saya pakai sekitar ${formatMoney(context.financialFreedomTargetAmount)}.`
        : null
    ]
      .filter(Boolean)
      .join("\n"),
    [
      "📈 Proyeksi realistis",
      paceLine,
      reserveLine,
      freedomAllocationLine,
      allocationNote,
      parallelSuggestion
    ]
      .filter(Boolean)
      .join("\n"),
    timelineLines.length ? ["🗓️ Timeline realistis", ...timelineLines].join("\n") : null,
    withdrawalLines.length ? ["🧾 Skema setelah tercapai", ...withdrawalLines].join("\n") : null,
    [
      "🎯 Target versi kamu",
      "Kalau menurut Boss, idealnya target ini ingin tercapai di bulan dan tahun berapa?",
      "Kalau ada target hasil pasif per bulan yang mau dikejar, boleh sekalian kirim juga.",
      "Contoh: `Mei 2040, target Rp10 juta/bulan`.",
      "Kalau mau hapus target Financial Freedom dari daftar target sekarang, balas `skip`."
    ].join("\n")
  ];

  return sections.filter(Boolean).join("\n\n");
};

const buildFinancialFreedomProjectionBubbles = (context: OnboardingPromptContext) => {
  const sectionBodies = buildFinancialFreedomProjectionBody(context).split("\n\n");
  const timelineLines = buildFinancialFreedomTimelineLines(context);
  const withdrawalLines = buildFinancialFreedomWithdrawalLines(context);

  return [
    [sectionBodies[0], sectionBodies[1]]
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .join("\n\n"),
    timelineLines.length ? ["🗓️ Timeline realistis", ...timelineLines].join("\n") : null,
    withdrawalLines.length ? ["🧾 Skema setelah tercapai", ...withdrawalLines].join("\n") : null,
    [
      "🎯 Target versi kamu",
      "Kalau menurut Boss, idealnya target ini ingin tercapai di bulan dan tahun berapa?",
      "Kalau ada target hasil pasif per bulan yang mau dikejar, boleh sekalian kirim juga.",
      "Contoh: `Mei 2040, target Rp10 juta/bulan`.",
      "Kalau mau hapus target Financial Freedom dari daftar target sekarang, balas `skip`."
    ].join("\n")
  ].filter((item): item is string => typeof item === "string" && item.trim().length > 0);
};

const getPostExpenseStep = (_context: OnboardingPromptContext) =>
  OnboardingStep.ASK_ASSET_SELECTION;

const getPostAssetStep = (context: OnboardingPromptContext) =>
  context.hasPersonalizationPending
    ? getNextPersonalizationStep(context)
    : getCompletionStep(context);

const getPostIncomeStep = (context: OnboardingPromptContext) => {
  if (context.budgetMode === BudgetMode.MANUAL_PLAN) return OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN;
  if (context.budgetMode === BudgetMode.GUIDED_PLAN) return OnboardingStep.ASK_GUIDED_EXPENSE_FOOD;
  if (context.hasExpenseDependentGoal && !context.expenseAvailable) {
    return OnboardingStep.ASK_GOAL_EXPENSE_STRATEGY;
  }
  return getPostExpenseStep(context);
};

export const getPromptForStep = (
  step: OnboardingStep,
  context: OnboardingPromptContext
): OnboardingPrompt => {
  const targetMonthYearExamples = getTargetMonthYearExamples();

  switch (step) {
    case OnboardingStep.WAIT_REGISTER:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.START_CONFIRMATION,
        title: "Finance Copilot",
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
        title: "Aktifkan Jalur Notifikasi",
        body:
          "Satu langkah terakhir biar reminder, insight, dan follow-up bisa dikirim ke channel yang benar.\nKirim nomor WhatsApp aktif dengan format `62812xxxxxx`.",
        inputType: "text"
      };
    case OnboardingStep.ASK_PRIMARY_GOAL:
    case OnboardingStep.ASK_GOAL_SELECTION:
      return {
        stepKey: OnboardingStep.ASK_GOAL_SELECTION,
        questionKey: OnboardingQuestionKey.GOAL_SELECTION,
        title: "Target",
        body: [
          "Pilih dulu tujuan keuangan yang lagi pengen kamu capai.",
          "Kalau ada beberapa, boleh pilih lebih dari satu sekaligus ya Boss.",
          "Nanti saya bantu lanjutkan satu per satu sesuai kondisi kamu."
        ].join("\n"),
        inputType: "multi_select",
        options: GOAL_OPTIONS
      };
    case OnboardingStep.ASK_EMPLOYMENT_TYPES:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.EMPLOYMENT_TYPES,
        title: "Pola Income",
        body:
          "Biar saya lebih ngerti kondisi kamu sekarang, peran atau aktivitas kamu saat ini apa aja?\nKalau campuran, boleh pilih lebih dari satu ya Boss.",
        inputType: "multi_select",
        options: EMPLOYMENT_OPTIONS
      };
    case OnboardingStep.ASK_HAS_ACTIVE_INCOME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.HAS_ACTIVE_INCOME,
        title: "Income Aktif",
        body: "Sekarang ada income aktif yang rutin masuk Boss?",
        inputType: "single_select",
        options: YES_NO_OPTIONS
      };
    case OnboardingStep.ASK_ACTIVE_INCOME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ACTIVE_INCOME_MONTHLY,
        title: "Income Aktif",
        body: "Biasanya pemasukan utama kamu per bulan kira-kira berapa Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_SALARY_DATE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.SALARY_DATE,
        title: "Tanggal Gajian",
        body: "Biasanya gajian jatuh di tanggal berapa? Balas angka 1-31 ya Boss.",
        inputType: "integer"
      };
    case OnboardingStep.ASK_HAS_PASSIVE_INCOME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.HAS_PASSIVE_INCOME,
        title: "Income Pasif",
        body: "Selain itu ada income pasif juga Boss?",
        inputType: "single_select",
        options: YES_NO_OPTIONS
      };
    case OnboardingStep.ASK_PASSIVE_INCOME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.PASSIVE_INCOME_MONTHLY,
        title: "Income Pasif",
        body:
          "Kalau ada pemasukan sampingan yang rutin, kira-kira per bulan berapa Boss? Kalau belum pasti, boleh jawab kisaran seperti `sekitar 7jtan` atau `1-5jt`.",
        inputType: "money"
      };
    case OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ESTIMATED_MONTHLY_INCOME,
        title: "Estimasi Income",
        body: "Kalau dirata-ratakan, total pemasukan per bulan kira-kira berapa Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_BUDGET_MODE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.BUDGET_MODE,
        title: "Mulai Dari Mana",
        body: "Biar saya bisa bantu lebih pas, enaknya kita mulai lihat pengeluaran kamu lewat cara yang mana Boss?",
        inputType: "single_select",
        options: BUDGET_MODE_OPTIONS
      };
    case OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.MANUAL_EXPENSE_BREAKDOWN,
        title: "Cerita Pengeluaran",
        body: [
          "Ceritain aja pengeluaran bulanan kamu dengan gaya santai Boss.",
          "Saya bantu rapihin. Kalau ada kebutuhan lain seperti keluarga, cicilan, atau urusan rumah, tinggal tulis aja juga.",
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
        title: "Mulai Dari Yang Paling Rutin",
        body: context.goalExpenseStrategy === "HELP_CALCULATE"
          ? "Oke Boss, kita urutin pelan-pelan ya. Biasanya buat makan dan minum per bulan sekitar berapa?"
          : "Biasanya pengeluaran makan dan minum per bulan sekitar berapa Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_GUIDED_EXPENSE_TRANSPORT:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_TRANSPORT,
        title: "Pengeluaran Transport",
        body: "Kalau buat transport dan perjalanan rutin, biasanya habis berapa per bulan Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_GUIDED_EXPENSE_BILLS:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_BILLS,
        title: "Pengeluaran Tagihan",
        body: "Kalau untuk tagihan rutin seperti listrik, internet, cicilan, atau kewajiban lain, biasanya berapa per bulan Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_GUIDED_EXPENSE_ENTERTAINMENT:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_ENTERTAINMENT,
        title: "Pengeluaran Hiburan",
        body: "Kalau buat hiburan, nongkrong, streaming, atau lifestyle, biasanya habis berapa per bulan Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS:
      if (context.guidedOtherExpenseStage === "category_name") {
        return {
          stepKey: step,
          questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_OTHERS,
          title: "Kategori Pengeluaran Lain",
          body: [
            "Siap Boss. Kategori pengeluaran lainnya apa?",
            "Contoh: `parkir`, `jajan kantor`, atau `bantuan keluarga`."
          ].join("\n\n"),
          inputType: "text"
        };
      }

      if (context.guidedOtherExpenseStage === "category_amount") {
        return {
          stepKey: step,
          questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_OTHERS,
          title: "Nominal Pengeluaran Lain",
          body: `Untuk ${context.guidedOtherExpensePendingLabel ?? "kategori ini"}, biasanya habis berapa per bulan Boss?`,
          inputType: "money"
        };
      }

      if (context.guidedOtherExpenseStage === "add_more") {
        return {
          stepKey: step,
          questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_OTHERS,
          title: "Tambah Pengeluaran Lain?",
          body: "Masih ada pengeluaran lain lagi nggak Boss? Balas `ada` atau `ga ada` ya.",
          inputType: "single_select",
          options: YES_NO_OPTIONS
        };
      }

      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_OTHERS,
        title: "Pengeluaran Lainnya",
        body: "Di luar makan, transport, tagihan, dan hiburan tadi, masih ada pengeluaran lain nggak Boss? Balas `ada` atau `ga ada` ya.",
        inputType: "single_select",
        options: YES_NO_OPTIONS
      };
    case OnboardingStep.ASK_GOAL_CUSTOM_NAME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_CUSTOM_NAME,
        title: "Custom Target",
        body: "Nama target custom ini mau kamu sebut apa Boss?",
        inputType: "text"
      };
    case OnboardingStep.ASK_GOAL_TARGET_AMOUNT:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
        title: goalLabel(context.currentGoalType),
        body:
          context.currentGoalType === FinancialGoalType.HOUSE
            ? "Untuk target rumah, kira-kira dana yang mau disiapkan berapa Boss?"
            : context.currentGoalType === FinancialGoalType.VEHICLE
              ? "Untuk target kendaraan, kira-kira dana yang mau disiapkan berapa Boss?"
              : context.currentGoalType === FinancialGoalType.VACATION
                ? "Untuk target liburan, kira-kira dana yang mau disiapkan berapa Boss?"
                : context.currentGoalType === FinancialGoalType.CUSTOM
                  ? "Untuk target ini, butuh dana berapa Boss?"
                  : "Kira-kira dana yang dibutuhin berapa Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_GOAL_TARGET_DATE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
        title: "Waktu Target",
        body:
          context.currentGoalType === FinancialGoalType.CUSTOM
            ? `${context.latestCustomGoalName?.trim() || "Target ini"} maunya tercapai kapan Boss? Balas bulan dan tahun ya. Contohnya \`${targetMonthYearExamples.numeric}\` atau \`${targetMonthYearExamples.long}\`.`
            : `Kalau target ${goalLabel(context.currentGoalType).toLowerCase()} ini, maunya tercapai kapan Boss? Balas bulan dan tahun ya. Contohnya \`${targetMonthYearExamples.numeric}\` atau \`${targetMonthYearExamples.long}\`.`,
        inputType: "month"
      };
    case OnboardingStep.ASK_GOAL_EXPENSE_STRATEGY:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_EXPENSE_STRATEGY,
        title: "Biar Rencananya Pas",
        body: [
          "Supaya saya bisa bantu dengan lebih pas, saya perlu gambaran pengeluaran bulanan kamu dulu.",
          "Paling nyaman lanjut lewat cara yang mana Boss?"
        ].join("\n"),
        inputType: "single_select",
        options: GOAL_EXPENSE_STRATEGY_OPTIONS
      };
    case OnboardingStep.ASK_GOAL_EXPENSE_TOTAL:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_EXPENSE_TOTAL,
        title: "Total Pengeluaran Bulanan",
        body: "Kalau kamu sudah punya gambaran total pengeluaran bulanan, kirim angkanya aja ya Boss.",
        inputType: "money"
      };
    case OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_FINANCIAL_FREEDOM_AGE,
        title: "Rencana Financial Freedom",
        body: buildFinancialFreedomProjectionBody(context),
        chatBubbleBodies: buildFinancialFreedomProjectionBubbles(context),
        inputType: "month",
        allowSkip: true
      };
    case OnboardingStep.ASK_GOAL_ALLOCATION_MODE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_ALLOCATION_MODE,
        title: "Cara Jalanin Target",
        body: "Kalau targetnya lebih dari satu, kamu lebih nyaman fokus satu-satu dulu atau jalan bareng Boss?",
        inputType: "single_select",
        options: GOAL_ALLOCATION_MODE_OPTIONS
      };
    case OnboardingStep.ASK_GOAL_PRIORITY_FOCUS:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_PRIORITY_FOCUS,
        title: "Target Prioritas",
        body: "Dari semua target itu, mana yang mau kamu utamakan dulu Boss?",
        inputType: "single_select",
        options: buildGoalPriorityOptions(context)
      };
    case OnboardingStep.ASK_GOAL_ADD_MORE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.GOAL_ADD_MORE,
        title: "Tambah Target",
        body: "Masih ada target lain yang mau dimasukin juga Boss?",
        inputType: "single_select",
        options: ADD_MORE_OPTIONS
      };
    case OnboardingStep.ASK_ASSET_SELECTION:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_SELECTION,
        title: "Aset Yang Sudah Jalan",
        body: [
          "Sekarang aset yang sudah Boss punya apa aja?",
          "Kalau ada beberapa, boleh pilih sekaligus. Kalau belum ada, pilih `Belum punya` ya."
        ].join("\n\n"),
        inputType: "multi_select",
        options: ASSET_OPTIONS
      };
    case OnboardingStep.ASK_ASSET_SAVINGS_NAME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_SAVINGS_NAME,
        title: "Detail Tabungan",
        body: "Tabungan ini kamu taruh di mana Boss? Bisa di bank, cash, atau e-wallet. Contohnya `BCA`, `Jago`, `SeaBank`, `cash`, atau `DANA`.",
        inputType: "text"
      };
    case OnboardingStep.ASK_ASSET_SAVINGS_BALANCE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_SAVINGS_BALANCE,
        title: "Jumlah Tabungan",
        body: "Jumlah tabungannya sekarang berapa Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_ASSET_GOLD_TYPE:
    case OnboardingStep.ASK_ASSET_GOLD_NAME:
      return {
        stepKey: OnboardingStep.ASK_ASSET_GOLD_TYPE,
        questionKey: OnboardingQuestionKey.ASSET_GOLD_TYPE,
        title: "Detail Emas",
        body: "Emas yang kamu punya bentuknya apa Boss?",
        inputType: "single_select",
        options: GOLD_TYPE_OPTIONS
      };
    case OnboardingStep.ASK_ASSET_GOLD_BRAND:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_GOLD_BRAND,
        title: "Brand Emas",
        body: "Kalau emas batangan, mereknya apa Boss?",
        inputType: "single_select",
        options: GOLD_BRAND_OPTIONS
      };
    case OnboardingStep.ASK_ASSET_GOLD_GRAMS:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_GOLD_GRAMS,
        title: "Berat Emas",
        body:
          context.currentGoldType === "BULLION"
            ? "Berapa gram emas batangannya Boss? Balas angka saja ya."
            : context.currentGoldType === "JEWELRY"
              ? "Berat perhiasannya berapa gram Boss? Balas angka saja ya."
              : context.currentGoldType === "DIGITAL"
                ? "Kamu punya berapa gram emas digital Boss? Balas angka saja ya."
                : `Total berat ${goldTypeLabel(context.currentGoldType)} itu berapa gram Boss? Contoh: \`10.5\`.`,
        inputType: "decimal"
      };
    case OnboardingStep.ASK_ASSET_GOLD_KARAT:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_GOLD_KARAT,
        title: "Karat Emas",
        body: "Karat perhiasannya berapa Boss?",
        inputType: "single_select",
        options: GOLD_KARAT_OPTIONS
      };
    case OnboardingStep.ASK_ASSET_GOLD_PLATFORM:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_GOLD_PLATFORM,
        title: "Platform Emas Digital",
        body: "Platform emas digitalnya apa Boss?",
        inputType: "single_select",
        options: GOLD_PLATFORM_OPTIONS
      };
    case OnboardingStep.ASK_ASSET_STOCK_SYMBOL:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_STOCK_SYMBOL,
        title: "Detail Saham",
        body: "Saham apa yang kamu punya Boss? Boleh kirim kode seperti `BBRI` atau `BBCA`.",
        inputType: "text"
      };
    case OnboardingStep.ASK_ASSET_STOCK_LOTS:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_STOCK_LOTS,
        title: "Jumlah Lot",
        body: "Kamu pegang berapa lot saham ini Boss?",
        inputType: "decimal"
      };
    case OnboardingStep.ASK_ASSET_CRYPTO_SYMBOL:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_CRYPTO_SYMBOL,
        title: "Detail Crypto",
        body: "Aset crypto apa yang kamu punya Boss? Contohnya `BTC`, `ETH`, atau `SOL`.",
        inputType: "text"
      };
    case OnboardingStep.ASK_ASSET_CRYPTO_QUANTITY:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_CRYPTO_QUANTITY,
        title: "Jumlah Crypto",
        body: "Kamu punya berapa coin atau token Boss?",
        inputType: "decimal"
      };
    case OnboardingStep.ASK_ASSET_MUTUAL_FUND_SYMBOL:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_MUTUAL_FUND_SYMBOL,
        title: "Detail Reksa Dana",
        body:
          "Nama atau kode produk reksa dananya apa Boss? Kalau produknya ketemu, nanti saya bantu pakai NAB terakhir yang tersedia.",
        inputType: "text"
      };
    case OnboardingStep.ASK_ASSET_MUTUAL_FUND_UNITS:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_MUTUAL_FUND_UNITS,
        title: "Unit Reksa Dana",
        body:
          "Kamu punya berapa unit reksa dana ini Boss? Kalau produknya saya kenali, nanti nilainya saya bantu hitung dari NAB terakhir.",
        inputType: "decimal"
      };
    case OnboardingStep.ASK_ASSET_PROPERTY_NAME:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_PROPERTY_NAME,
        title: "Detail Properti",
        body: "Propertinya apa Boss? Contoh: `Rumah`, `Apartemen`, atau `Tanah`.",
        inputType: "text"
      };
    case OnboardingStep.ASK_ASSET_PROPERTY_ESTIMATED_VALUE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_PROPERTY_ESTIMATED_VALUE,
        title: "Nilai Properti",
        body: "Kira-kira nilai propertinya sekarang berapa Boss? Ini saya pakai sebagai patokan awal dulu ya.",
        inputType: "money"
      };
    case OnboardingStep.ASK_ASSET_NAME:
      if (context.currentAssetType === AssetType.SAVINGS) {
        return getPromptForStep(OnboardingStep.ASK_ASSET_SAVINGS_NAME, context);
      }
      if (context.currentAssetType === AssetType.STOCK) {
        return getPromptForStep(OnboardingStep.ASK_ASSET_STOCK_SYMBOL, context);
      }
      if (context.currentAssetType === AssetType.CRYPTO) {
        return getPromptForStep(OnboardingStep.ASK_ASSET_CRYPTO_SYMBOL, context);
      }
      if (context.currentAssetType === AssetType.MUTUAL_FUND) {
        return getPromptForStep(OnboardingStep.ASK_ASSET_MUTUAL_FUND_SYMBOL, context);
      }
      if (context.currentAssetType === AssetType.PROPERTY) {
        return getPromptForStep(OnboardingStep.ASK_ASSET_PROPERTY_NAME, context);
      }
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_NAME,
        title: assetLabel(context.currentAssetType),
        body: "Aset ini mau kamu sebut apa Boss?",
        inputType: "text"
      };
    case OnboardingStep.ASK_ASSET_ESTIMATED_VALUE:
      if (context.currentAssetType === AssetType.SAVINGS) {
        return getPromptForStep(OnboardingStep.ASK_ASSET_SAVINGS_BALANCE, context);
      }
      if (context.currentAssetType === AssetType.STOCK) {
        return getPromptForStep(OnboardingStep.ASK_ASSET_STOCK_LOTS, context);
      }
      if (context.currentAssetType === AssetType.CRYPTO) {
        return getPromptForStep(OnboardingStep.ASK_ASSET_CRYPTO_QUANTITY, context);
      }
      if (context.currentAssetType === AssetType.MUTUAL_FUND) {
        if (context.hasCurrentMutualFundUnits) {
          return {
            stepKey: step,
            questionKey: OnboardingQuestionKey.ASSET_ESTIMATED_VALUE,
            title: "Nilai Reksa Dana",
            body: "Produk reksa dana ini belum ketemu data NAB terbarunya. Kira-kira total nilainya sekarang berapa Boss?",
            inputType: "money"
          };
        }
        return getPromptForStep(OnboardingStep.ASK_ASSET_MUTUAL_FUND_UNITS, context);
      }
      if (context.currentAssetType === AssetType.PROPERTY) {
        return getPromptForStep(OnboardingStep.ASK_ASSET_PROPERTY_ESTIMATED_VALUE, context);
      }
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_ESTIMATED_VALUE,
        title: assetLabel(context.currentAssetType),
        body: "Kira-kira nilainya sekarang berapa Boss?",
        inputType: "money"
      };
    case OnboardingStep.ASK_ASSET_ADD_MORE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.ASSET_ADD_MORE,
        title: "Tambah Aset",
        body: "Masih ada aset lain yang mau dipantau juga Boss?",
        inputType: "single_select",
        options: ADD_MORE_OPTIONS
      };
    case OnboardingStep.ASK_PERSONALIZATION_CHOICE:
      return {
        stepKey: step,
        questionKey: OnboardingQuestionKey.PERSONALIZATION_CHOICE,
        title: "Lanjut Biar Makin Akurat",
        body: [
          "Analisa awalnya sudah kebentuk.",
          "Kalau mau, saya bisa lanjut rapihin detail target, strategi tabung, dan proyeksi yang lebih tajam sekarang.",
          "Kalau belum, saya tutup dulu dengan rangkuman yang ada."
        ].join("\n"),
        inputType: "single_select",
        options: PERSONALIZATION_OPTIONS
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

  throw new Error(`Unsupported onboarding step: ${step}`);
};

export const getNextOnboardingStep = (
  currentStep: OnboardingStep,
  context: OnboardingPromptContext,
  answer: unknown
): OnboardingStep => {
  const goalSelections = Array.isArray(answer) ? answer : [answer];
  const assetSelections = Array.isArray(answer) ? answer : [answer];
  const hasGoalSelection = goalSelections.some((item) => item !== GOAL_NONE_VALUE && item !== null);
  const hasAssetSelection = assetSelections.some((item) => item !== ASSET_NONE_VALUE && item !== null);

  switch (currentStep) {
    case OnboardingStep.WAIT_REGISTER:
      return OnboardingStep.ASK_GOAL_SELECTION;
    case OnboardingStep.VERIFY_PHONE:
      return OnboardingStep.SHOW_ANALYSIS;
    case OnboardingStep.ASK_PRIMARY_GOAL:
    case OnboardingStep.ASK_GOAL_SELECTION:
      return !hasGoalSelection || goalSelections.every((item) => item === GOAL_NONE_VALUE)
        ? OnboardingStep.ASK_BUDGET_MODE
        : OnboardingStep.ASK_BUDGET_MODE;
    case OnboardingStep.ASK_GOAL_CUSTOM_NAME:
      return getNextPersonalizationStep(context);
    case OnboardingStep.ASK_GOAL_TARGET_AMOUNT:
      return getNextPersonalizationStep(context);
    case OnboardingStep.ASK_GOAL_TARGET_DATE:
      return getNextPersonalizationStep(context);
    case OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE:
      return getCompletionStep(context);
    case OnboardingStep.ASK_GOAL_ADD_MORE:
      return answer === true ? OnboardingStep.ASK_GOAL_SELECTION : getPostGoalStep(context);
    case OnboardingStep.ASK_GOAL_ALLOCATION_MODE:
      return getNextPersonalizationStep(context);
    case OnboardingStep.ASK_GOAL_PRIORITY_FOCUS:
      return getNextPersonalizationStep(context);
    case OnboardingStep.ASK_ASSET_SELECTION:
      if (!hasAssetSelection || assetSelections.every((item) => item === ASSET_NONE_VALUE)) {
        return getPostAssetStep(context);
      }
      return context.pendingAssetStep ?? OnboardingStep.ASK_ASSET_ADD_MORE;
    case OnboardingStep.ASK_ASSET_SAVINGS_NAME:
    case OnboardingStep.ASK_ASSET_SAVINGS_BALANCE:
    case OnboardingStep.ASK_ASSET_GOLD_TYPE:
    case OnboardingStep.ASK_ASSET_GOLD_BRAND:
    case OnboardingStep.ASK_ASSET_GOLD_NAME:
    case OnboardingStep.ASK_ASSET_GOLD_GRAMS:
    case OnboardingStep.ASK_ASSET_GOLD_KARAT:
    case OnboardingStep.ASK_ASSET_GOLD_PLATFORM:
    case OnboardingStep.ASK_ASSET_STOCK_SYMBOL:
    case OnboardingStep.ASK_ASSET_STOCK_LOTS:
    case OnboardingStep.ASK_ASSET_CRYPTO_SYMBOL:
    case OnboardingStep.ASK_ASSET_CRYPTO_QUANTITY:
    case OnboardingStep.ASK_ASSET_MUTUAL_FUND_SYMBOL:
    case OnboardingStep.ASK_ASSET_MUTUAL_FUND_UNITS:
    case OnboardingStep.ASK_ASSET_PROPERTY_NAME:
    case OnboardingStep.ASK_ASSET_PROPERTY_ESTIMATED_VALUE:
    case OnboardingStep.ASK_ASSET_NAME:
    case OnboardingStep.ASK_ASSET_ESTIMATED_VALUE:
      return context.pendingAssetStep ?? OnboardingStep.ASK_ASSET_ADD_MORE;
    case OnboardingStep.ASK_ASSET_ADD_MORE:
      return answer === true ? OnboardingStep.ASK_ASSET_SELECTION : getPostAssetStep(context);
    case OnboardingStep.ASK_PERSONALIZATION_CHOICE:
      return getNextPersonalizationStep(context);
    case OnboardingStep.ASK_BUDGET_MODE:
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
      return answer === true ? OnboardingStep.ASK_PASSIVE_INCOME : getPostIncomeStep(context);
    case OnboardingStep.ASK_PASSIVE_INCOME:
    case OnboardingStep.ASK_ESTIMATED_MONTHLY_INCOME:
      return getPostIncomeStep(context);
    case OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN:
      return getPostExpenseStep(context);
    case OnboardingStep.ASK_GUIDED_EXPENSE_FOOD:
      return OnboardingStep.ASK_GUIDED_EXPENSE_TRANSPORT;
    case OnboardingStep.ASK_GUIDED_EXPENSE_TRANSPORT:
      return OnboardingStep.ASK_GUIDED_EXPENSE_BILLS;
    case OnboardingStep.ASK_GUIDED_EXPENSE_BILLS:
      return OnboardingStep.ASK_GUIDED_EXPENSE_ENTERTAINMENT;
    case OnboardingStep.ASK_GUIDED_EXPENSE_ENTERTAINMENT:
      return OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS;
    case OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS:
      if (answer && typeof answer === "object" && "kind" in answer) {
        const guidedAnswer = answer as Record<string, unknown>;
        if (guidedAnswer.kind === "presence") {
          return guidedAnswer.hasOtherExpense === true
            ? OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS
            : getPostExpenseStep(context);
        }

        if (guidedAnswer.kind === "category_name") {
          return OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS;
        }

        if (guidedAnswer.kind === "category_amount") {
          return OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS;
        }

        if (guidedAnswer.kind === "add_more") {
          return guidedAnswer.addMore === true
            ? OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS
            : getPostExpenseStep(context);
        }
      }

      return getPostExpenseStep(context);
    case OnboardingStep.ASK_GOAL_EXPENSE_STRATEGY:
      if (answer === "HELP_CALCULATE") return OnboardingStep.ASK_GUIDED_EXPENSE_FOOD;
      if (answer === "HAVE_DATA") return OnboardingStep.ASK_GOAL_EXPENSE_TOTAL;
      return getPostExpenseStep(context);
    case OnboardingStep.ASK_GOAL_EXPENSE_TOTAL:
      return getPostExpenseStep(context);
    case OnboardingStep.SHOW_ANALYSIS:
      return OnboardingStep.COMPLETED;
    case OnboardingStep.COMPLETED:
      return OnboardingStep.COMPLETED;
  }

  throw new Error(`Unsupported onboarding step: ${currentStep}`);
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

export const formatPromptForChatBubbles = (prompt: OnboardingPrompt) => {
  const baseBodies =
    prompt.chatBubbleBodies?.map((item) => item.trim()).filter(Boolean) ?? [prompt.body];

  if (!shouldRenderPromptOptions(prompt)) {
    return baseBodies;
  }

  const options = prompt.options ?? [];
  const optionLines = ["", "Pilihan:"];
  for (const [index, option] of options.entries()) {
    optionLines.push(`${index + 1}. ${option.label}`);
  }

  if (!baseBodies.length) {
    return [optionLines.join("\n").trim()];
  }

  const bubbles = [...baseBodies];
  bubbles[bubbles.length - 1] = `${bubbles.at(-1)}\n${optionLines.join("\n")}`.trim();
  return bubbles;
};
