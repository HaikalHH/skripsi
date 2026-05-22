import { AssetType, BudgetMode, EmploymentType, FinancialGoalType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  isReadyCommand,
  parseActiveIncomeAddMoreAnswer,
  parseActiveIncomeCycleSelection,
  parseActiveIncomeFrequency,
  parseAssetQuantityInput,
  parseAssetSelection,
  parseAssetSelections,
  parseAddMoreAnswer,
  parseBooleanAnswer,
  parseBudgetMode,
  parseDecimalInput,
  parseDecimalInputPreservingRange,
  parseDayOfMonth,
  parseEmploymentTypes,
  parseGoldAssetBrand,
  parseGoldAssetKarat,
  parseGoldAssetPlatform,
  parseGoldAssetType,
  getGoalPlanRecommendation,
  parseGoalSelectionConflict,
  parseGoalSelection,
  parseGoalSelections,
  getMoneyAnswerLowerBound,
  parseMultiChoiceInput,
  parseGuidedOtherExpenseInput,
  parseManualExpenseBreakdown,
  parseManualExpenseBreakdownDetails,
  parseMonthYearInput,
  parseMoneyInput,
  parseMoneyInputPreservingRange,
  looksLikeGoalTargetDateInput,
  parseStockSymbolInput
} from "@/lib/services/onboarding/flow/shared/parser/onboarding-parser-service";

const getCurrentJakartaMonthYear = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jakarta"
  }).formatToParts(new Date());

  return {
    month: Number(parts.find((part) => part.type === "month")?.value ?? "1"),
    year: Number(parts.find((part) => part.type === "year")?.value ?? "1970")
  };
};

describe("onboarding parser service", () => {
  it("accepts flexible ready confirmation", () => {
    expect(isReadyCommand("Okey saya siap")).toBe(true);
    expect(isReadyCommand("1. Oke saya siap")).toBe(true);
    expect(isReadyCommand("ayo mulai")).toBe(true);
    expect(isReadyCommand("sap")).toBe(true);
    expect(isReadyCommand("sapp")).toBe(true);
    expect(isReadyCommand("siapp")).toBe(true);
    expect(isReadyCommand("siappp")).toBe(true);
    expect(isReadyCommand("syaap")).toBe(true);
  });

  it("parses mixed employment roles from natural language", () => {
    expect(parseEmploymentTypes("saya karyawan sambil usaha kecil")).toEqual([
      EmploymentType.EMPLOYEE,
      EmploymentType.ENTREPRENEUR
    ]);
    expect(parseEmploymentTypes("karywan dan freelance")).toEqual([
      EmploymentType.EMPLOYEE,
      EmploymentType.FREELANCER
    ]);
  });

  it("parses guided budget mode from free text", () => {
    expect(parseBudgetMode("belum punya, tolong buatin aja")).toBe(BudgetMode.GUIDED_PLAN);
    expect(parseBudgetMode("belom puny, tolong buatin aja")).toBe(BudgetMode.GUIDED_PLAN);
  });

  it("parses goal and asset selections from context", () => {
    expect(parseGoalSelection("aku mau dana darurat dulu")).toBe(FinancialGoalType.EMERGENCY_FUND);
    expect(parseAssetSelection("sekarang saya punya emas antam")).toBe(AssetType.GOLD);
    expect(parseGoalSelections("nabgun dana darurat, sama custom target")).toEqual([
      FinancialGoalType.EMERGENCY_FUND,
      FinancialGoalType.CUSTOM
    ]);
    expect(parseAssetSelections("emas sama tabungan")).toEqual([
      AssetType.GOLD,
      AssetType.SAVINGS
    ]);
    expect(parseAssetSelections("emas sama tabungna")).toEqual([
      AssetType.GOLD,
      AssetType.SAVINGS
    ]);
    expect(parseAssetSelection("saya simpan di e-wallet dana")).toBe(AssetType.SAVINGS);
  });

  it("parses numeric multi-select ranges for goals and assets", () => {
    expect(parseGoalSelection("1-6")).toBeNull();
    expect(parseMultiChoiceInput("1-4 dan 6", 7)).toEqual([1, 2, 3, 4, 6]);
    expect(parseMultiChoiceInput("semua kecuali 6", 7)).toEqual([1, 2, 3, 4, 5, 7]);
    expect(parseGoalSelections("1-6")).toEqual([
      FinancialGoalType.EMERGENCY_FUND,
      FinancialGoalType.HOUSE,
      FinancialGoalType.VEHICLE,
      FinancialGoalType.VACATION,
      "NONE_YET",
      FinancialGoalType.CUSTOM
    ]);
    expect(parseGoalSelectionConflict("1-6")).toMatchObject({
      isValid: false,
      nonExclusiveOptions: [
        FinancialGoalType.EMERGENCY_FUND,
        FinancialGoalType.HOUSE,
        FinancialGoalType.VEHICLE,
        FinancialGoalType.VACATION,
        FinancialGoalType.CUSTOM
      ]
    });
    expect(parseGoalSelections("1 sampai 4 dan 6")).toEqual([
      FinancialGoalType.EMERGENCY_FUND,
      FinancialGoalType.HOUSE,
      FinancialGoalType.VEHICLE,
      FinancialGoalType.VACATION,
      FinancialGoalType.CUSTOM
    ]);
    expect(parseAssetSelections("1-4")).toEqual([
      AssetType.SAVINGS,
      AssetType.GOLD,
      AssetType.STOCK,
      AssetType.PROPERTY
    ]);
  });

  it("rejects contradictory asset selections that mix belum punya with real assets", () => {
    expect(parseAssetSelections("1,5")).toBeNull();
    expect(parseAssetSelections("tabungan dan belum punya")).toBeNull();
    expect(parseAssetSelections(["tabungan", "belum punya"])).toBeNull();
  });

  it("parses branched asset detail answers for onboarding", () => {
    expect(parseGoldAssetType("antam batangan")).toBe("BULLION");
    expect(parseGoldAssetType("perhiasan")).toBe("JEWELRY");
    expect(parseGoldAssetType("tabungan emas digital")).toBe("DIGITAL");
    expect(parseGoldAssetBrand("galeri 24")).toBe("GALERI24");
    expect(parseGoldAssetKarat("22")).toBe("22K");
    expect(parseGoldAssetPlatform("pegadaian")).toBe("PEGADAIAN");
    expect(parseStockSymbolInput("saham bbri")).toBe("BBRI");
  });

  it("parses flexible numeric answers", () => {
    expect(parseMoneyInput("sekitar 3 juta sebulan")).toBe(3000000);
    expect(parseMoneyInput("4 jta")).toBe(4000000);
    expect(parseMoneyInput("sekitar 7jtan")).toBe(7000000);
    expect(parseMoneyInput("2 sampe 3jt")).toBe(2500000);
    expect(parseMoneyInput("250 rbu")).toBe(250000);
    expect(parseDecimalInput("10-15 gram")).toBe(12.5);
    expect(parseDecimalInputPreservingRange("10-15 gram")).toEqual({
      kind: "number_range",
      low: 10,
      high: 15
    });
    expect(parseMoneyInputPreservingRange("1-5jt")).toEqual({
      kind: "money_range",
      low: 1000000,
      high: 5000000
    });
    expect(parseMoneyInputPreservingRange("sekitar 7jtan")).toBe(7000000);
    expect(parseGuidedOtherExpenseInput("ga ada")).toBe(0);
    expect(parseGuidedOtherExpenseInput("udah itu aja")).toBe(0);
    expect(
      getMoneyAnswerLowerBound(
        parseMoneyInputPreservingRange("1-5jt") as { kind: "money_range"; low: number; high: number }
      )
    ).toBe(1000000);
    expect(parseDayOfMonth("gajian tiap tanggal 25")).toBe(25);
    expect(parseMonthYearInput("Maret 2027")).toMatchObject({
      month: 3,
      year: 2027
    });
    expect(parseMonthYearInput("16 juni 2036")).toMatchObject({
      month: 6,
      year: 2036
    });
    expect(parseMonthYearInput("16/06/2036")).toMatchObject({
      month: 6,
      year: 2036
    });
    expect(looksLikeGoalTargetDateInput("tanggal 16 juni 2036")).toBe(true);
    expect(parseMonthYearInput("Juni 3035")).toBeNull();
  });

  it("rejects asset quantity units that do not match the current asset question", () => {
    expect(parseAssetQuantityInput("10 gram", "gold_grams")).toBe(10);
    expect(parseAssetQuantityInput("10 lot", "gold_grams")).toBeNull();
    expect(parseAssetQuantityInput("Isi gram/lot abc", "gold_grams")).toBeNull();
    expect(parseAssetQuantityInput("2 lot", "stock_lots")).toBe(2);
    expect(parseAssetQuantityInput("2 gram", "stock_lots")).toBeNull();
  });

  it("allows next month but rejects current and past month-year targets", () => {
    const { month: currentMonth, year: currentYear } = getCurrentJakartaMonthYear();
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    const pastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const pastYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const nextMonthInput = `${String(nextMonth).padStart(2, "0")}/${nextYear}`;
    const currentMonthInput = `${String(currentMonth).padStart(2, "0")}/${currentYear}`;
    const pastMonthInput = `${String(pastMonth).padStart(2, "0")}/${pastYear}`;

    expect(parseMonthYearInput(nextMonthInput)).toMatchObject({
      month: nextMonth,
      year: nextYear,
      monthsFromNow: 1
    });
    expect(parseMonthYearInput(currentMonthInput)).toBeNull();
    expect(parseMonthYearInput(pastMonthInput)).toBeNull();
  });

  it("reorders goal recommendations to prioritize near deadlines", () => {
    const recommendation = getGoalPlanRecommendation([
      {
        id: "session_goal_selection",
        userId: "user_1",
        stepKey: "ASK_GOAL_SELECTION",
        questionKey: "GOAL_SELECTION",
        rawAnswerJson: ["dana darurat", "rumah", "liburan", "dana keluarga"],
        normalizedAnswerJson: [
          FinancialGoalType.EMERGENCY_FUND,
          FinancialGoalType.HOUSE,
          FinancialGoalType.VACATION,
          FinancialGoalType.CUSTOM
        ],
        isCompleted: true,
        createdAt: new Date("2026-03-10T09:00:00.000Z"),
        updatedAt: new Date("2026-03-10T09:00:00.000Z")
      },
      {
        id: "session_custom_name",
        userId: "user_1",
        stepKey: "ASK_GOAL_CUSTOM_NAME",
        questionKey: "GOAL_CUSTOM_NAME",
        rawAnswerJson: "Dana Keluarga",
        normalizedAnswerJson: "Dana Keluarga",
        isCompleted: true,
        createdAt: new Date("2026-03-10T09:01:00.000Z"),
        updatedAt: new Date("2026-03-10T09:01:00.000Z")
      },
      {
        id: "session_house_date",
        userId: "user_1",
        stepKey: "ASK_GOAL_TARGET_DATE",
        questionKey: "GOAL_TARGET_DATE",
        rawAnswerJson: "06/2035",
        normalizedAnswerJson: {
          target: {
            label: "Juni 2035",
            month: 6,
            year: 2035,
            monthsFromNow: 109
          }
        },
        isCompleted: true,
        createdAt: new Date("2026-03-10T09:02:00.000Z"),
        updatedAt: new Date("2026-03-10T09:02:00.000Z")
      },
      {
        id: "session_vacation_date",
        userId: "user_1",
        stepKey: "ASK_GOAL_TARGET_DATE",
        questionKey: "GOAL_TARGET_DATE",
        rawAnswerJson: "11/2026",
        normalizedAnswerJson: {
          target: {
            label: "November 2026",
            month: 11,
            year: 2026,
            monthsFromNow: 8
          }
        },
        isCompleted: true,
        createdAt: new Date("2026-03-10T09:03:00.000Z"),
        updatedAt: new Date("2026-03-10T09:03:00.000Z")
      },
      {
        id: "session_custom_date",
        userId: "user_1",
        stepKey: "ASK_GOAL_TARGET_DATE",
        questionKey: "GOAL_TARGET_DATE",
        rawAnswerJson: "03/2027",
        normalizedAnswerJson: {
          target: {
            label: "Maret 2027",
            month: 3,
            year: 2027,
            monthsFromNow: 12
          }
        },
        isCompleted: true,
        createdAt: new Date("2026-03-10T09:04:00.000Z"),
        updatedAt: new Date("2026-03-10T09:04:00.000Z")
      }
    ] as any);

    expect(recommendation.orderedGoals.map((goal) => goal.goalName)).toEqual([
      "Dana Darurat",
      "Liburan",
      "Dana Keluarga",
      "Beli Rumah"
    ]);
    expect(recommendation.priorityGoalType).toBe(FinancialGoalType.EMERGENCY_FUND);
  });

  it("prioritizes negative boolean phrases over partial positive matches", () => {
    expect(parseBooleanAnswer("Ga ada")).toBe(false);
    expect(parseBooleanAnswer("bukan yang ini")).toBe(false);
    expect(parseBooleanAnswer("engga")).toBe(false);
    expect(parseBooleanAnswer("gk ada")).toBe(false);
    expect(parseBooleanAnswer("gak ada lagi")).toBe(false);
    expect(parseBooleanAnswer("ya udah semua")).toBe(false);
    expect(parseBooleanAnswer("adaa")).toBe(true);
    expect(parseBooleanAnswer("ada lagi")).toBe(true);
  });

  it("parses active income onboarding answers from natural wording", () => {
    expect(parseActiveIncomeFrequency("cuma satu kali gajian utama")).toBe("SINGLE");
    expect(parseActiveIncomeFrequency("gaji utama sama freelance")).toBe("MULTIPLE");
    expect(parseActiveIncomeFrequency("2")).toBe("MULTIPLE");
    expect(parseActiveIncomeAddMoreAnswer("masih")).toBe(true);
    expect(parseActiveIncomeAddMoreAnswer("ada")).toBe(true);
    expect(parseActiveIncomeAddMoreAnswer("belum, masih ada satu lagi")).toBe(true);
    expect(parseActiveIncomeAddMoreAnswer("udah itu aja")).toBe(false);
    expect(parseActiveIncomeAddMoreAnswer("gak")).toBe(false);
    expect(parseActiveIncomeCycleSelection("income kedua aja", [25, 10, 15])).toBe(10);
    expect(parseActiveIncomeCycleSelection("yang ke dua", [28, 25])).toBe(25);
    expect(parseActiveIncomeCycleSelection("yang tanggal 25", [25, 10, 15])).toBe(25);
  });

  it("treats add-more continuation phrases as continue instead of yes", () => {
    expect(parseAddMoreAnswer("lanjut")).toBe(false);
    expect(parseAddMoreAnswer("langsung lanjut")).toBe(false);
    expect(parseAddMoreAnswer("ga ada lagi")).toBe(false);
    expect(parseAddMoreAnswer("nggak ada lagi")).toBe(false);
    expect(parseAddMoreAnswer("udah itu aja")).toBe(false);
    expect(parseAddMoreAnswer("segitu aja")).toBe(false);
    expect(parseAddMoreAnswer("masih ada")).toBe(true);
    expect(parseAddMoreAnswer("tambah lagi")).toBe(true);
  });

  it("parses manual expense breakdown without colon format", () => {
    expect(
      parseManualExpenseBreakdown(
        "makan 1.5jt, transport 500rb, tagihan 700rb, hiburan 300rb, lainnya 100rb"
      )
    ).toEqual({
      food: 1500000,
      transport: 500000,
      bills: 700000,
      entertainment: 300000,
      others: 100000
    });
  });

  it("maps unknown manual expense labels into others and does not require entertainment", () => {
    expect(
      parseManualExpenseBreakdown(
        "makan: 1000000\ntransport: 200000\ntagihan: 350000\nistri: 1000000"
      )
    ).toEqual({
      food: 1000000,
      transport: 200000,
      bills: 350000,
      entertainment: 0,
      others: 1000000
    });
  });

  it("maps many common household labels into the nearest onboarding buckets", () => {
    expect(
      parseManualExpenseBreakdown(
        "sembako 800rb, bensin 300rb, bpjs 200rb, netflix 150rb, sekolah anak 500rb"
      )
    ).toEqual({
      food: 800000,
      transport: 300000,
      bills: 700000,
      entertainment: 150000,
      others: 0
    });
  });

  it("keeps raw onboarding expense detail labels for downstream AI context", () => {
    expect(
      parseManualExpenseBreakdownDetails("spotify: 50000\nbpjs: 200000\nsembako: 900000")
    ).toEqual([
      { label: "spotify", amount: 50000, bucket: "entertainment" },
      { label: "bpjs", amount: 200000, bucket: "bills" },
      { label: "sembako", amount: 900000, bucket: "food" }
    ]);
  });
});
