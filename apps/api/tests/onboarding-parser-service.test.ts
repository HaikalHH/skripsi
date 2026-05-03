import { AssetType, BudgetMode, EmploymentType, FinancialGoalType, PrimaryGoal } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  isReadyCommand,
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
  parseGoalSelectionConflict,
  parseGoalSelection,
  parseGoalSelections,
  parseCryptoSymbolInput,
  getMoneyAnswerLowerBound,
  parseMultiChoiceInput,
  parseGuidedOtherExpenseInput,
  getSelectedGoalTypes,
  parseManualExpenseBreakdown,
  parseManualExpenseBreakdownDetails,
  parseMonthYearInput,
  parseMoneyInput,
  parseMoneyInputPreservingRange,
  parseFinancialFreedomPlanningAnswer,
  parseOptionalFinancialFreedomTarget,
  parseStockSymbolInput,
  parseMutualFundSymbolInput,
  parsePrimaryGoal
} from "@/lib/services/onboarding/onboarding-parser-service";

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

  it("parses conversational primary goal", () => {
    expect(parsePrimaryGoal("aku mau fokus ngatur pengeluaran dulu")).toBe(
      PrimaryGoal.MANAGE_EXPENSES
    );
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
    expect(parseGoalSelection("saya pengen financal freedom")).toBe(
      FinancialGoalType.FINANCIAL_FREEDOM
    );
    expect(parseGoalSelection("saya pengen konsultasi terkait financial freedom")).toBe(
      FinancialGoalType.FINANCIAL_FREEDOM
    );
    expect(parseAssetSelection("sekarang saya punya emas antam")).toBe(AssetType.GOLD);
    expect(
      parseGoalSelections("nabgun dana darurat, financial freedom, sama custom target")
    ).toEqual([
      FinancialGoalType.EMERGENCY_FUND,
      FinancialGoalType.FINANCIAL_FREEDOM,
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
      FinancialGoalType.FINANCIAL_FREEDOM,
      "NONE_YET"
    ]);
    expect(parseGoalSelectionConflict("1-6")).toMatchObject({
      isValid: false,
      nonExclusiveOptions: [
        FinancialGoalType.EMERGENCY_FUND,
        FinancialGoalType.HOUSE,
        FinancialGoalType.VEHICLE,
        FinancialGoalType.VACATION,
        FinancialGoalType.FINANCIAL_FREEDOM
      ]
    });
    expect(parseGoalSelections("1 sampai 5 dan 7")).toEqual([
      FinancialGoalType.EMERGENCY_FUND,
      FinancialGoalType.HOUSE,
      FinancialGoalType.VEHICLE,
      FinancialGoalType.VACATION,
      FinancialGoalType.FINANCIAL_FREEDOM,
      FinancialGoalType.CUSTOM
    ]);
    expect(parseAssetSelections("1-6")).toEqual([
      AssetType.SAVINGS,
      AssetType.GOLD,
      AssetType.STOCK,
      AssetType.CRYPTO,
      AssetType.MUTUAL_FUND,
      AssetType.PROPERTY
    ]);
  });

  it("rejects contradictory asset selections that mix belum punya with real assets", () => {
    expect(parseAssetSelections("1,7")).toBeNull();
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
    expect(parseCryptoSymbolInput("bitcoin")).toBe("BTC");
    expect(parseCryptoSymbolInput("ETH")).toBe("ETH");
    expect(parseMutualFundSymbolInput("Schroder Dana Istimewa")).toBe("Schroder Dana Istimewa");
  });

  it("parses flexible numeric answers", () => {
    const { month: currentMonth, year: currentYear } = getCurrentJakartaMonthYear();
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
    expect(parseOptionalFinancialFreedomTarget("September 2038")).toMatchObject({
      month: 9,
      year: 2038
    });
    expect(parseMonthYearInput("Maret 2027")).toMatchObject({
      month: 3,
      year: 2027
    });
    expect(parseMonthYearInput("Juni 3035")).toBeNull();
    expect(parseOptionalFinancialFreedomTarget("Septmber 2038")).toMatchObject({
      month: 9,
      year: 2038
    });
    expect(parseOptionalFinancialFreedomTarget("15")).toMatchObject({
      month: currentMonth,
      year: currentYear + 15
    });
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

    expect(parseOptionalFinancialFreedomTarget(nextMonthInput)).toMatchObject({
      month: nextMonth,
      year: nextYear,
      monthsFromNow: 1
    });
    expect(parseOptionalFinancialFreedomTarget(currentMonthInput)).toBeUndefined();
    expect(parseOptionalFinancialFreedomTarget(pastMonthInput)).toBeUndefined();
  });

  it("parses financial freedom planner payload from web onboarding", () => {
    expect(
      parseFinancialFreedomPlanningAnswer({
        targetValue: "2038-09",
        expenseMode: "CUSTOM",
        monthlyExpense: 7000000
      })
    ).toMatchObject({
      expenseMode: "CUSTOM",
      monthlyExpense: 7000000,
      target: {
        month: 9,
        year: 2038
      }
    });
  });

  it("parses financial freedom month-year plus monthly target from chat text", () => {
    expect(parseFinancialFreedomPlanningAnswer("Mei 2040, target Rp10 juta/bulan")).toMatchObject({
      expenseMode: "CUSTOM",
      monthlyExpense: 10000000,
      target: {
        month: 5,
        year: 2040
      }
    });
  });

  it("parses slash month-year plus monthly target without reading the date as money", () => {
    expect(parseFinancialFreedomPlanningAnswer("04/2028 target 10jt/bulan")).toMatchObject({
      expenseMode: "CUSTOM",
      monthlyExpense: 10000000,
      target: {
        month: 4,
        year: 2028
      }
    });
  });

  it("removes financial freedom from active target selection when the planning step is skipped", () => {
    expect(
      getSelectedGoalTypes([
        {
          id: "session_goal_selection_ff",
          userId: "user_1",
          stepKey: "ASK_GOAL_SELECTION",
          questionKey: "GOAL_SELECTION",
          rawAnswerJson: ["dana darurat", "financial freedom"],
          normalizedAnswerJson: ["EMERGENCY_FUND", "FINANCIAL_FREEDOM"],
          isCompleted: true,
          createdAt: new Date("2026-03-10T09:00:00.000Z"),
          updatedAt: new Date("2026-03-10T09:00:00.000Z")
        },
        {
          id: "session_ff_skip",
          userId: "user_1",
          stepKey: "ASK_GOAL_FINANCIAL_FREEDOM_AGE",
          questionKey: "GOAL_FINANCIAL_FREEDOM_AGE",
          rawAnswerJson: "skip",
          normalizedAnswerJson: {
            target: null,
            expenseMode: "CURRENT",
            monthlyExpense: null
          },
          isCompleted: true,
          createdAt: new Date("2026-03-10T09:01:00.000Z"),
          updatedAt: new Date("2026-03-10T09:01:00.000Z")
        }
      ] as any)
    ).toEqual([FinancialGoalType.EMERGENCY_FUND]);
  });

  it("prioritizes negative boolean phrases over partial positive matches", () => {
    expect(parseBooleanAnswer("Ga ada")).toBe(false);
    expect(parseBooleanAnswer("gk ada")).toBe(false);
    expect(parseBooleanAnswer("gak ada lagi")).toBe(false);
    expect(parseBooleanAnswer("ya udah semua")).toBe(false);
    expect(parseBooleanAnswer("adaa")).toBe(true);
    expect(parseBooleanAnswer("ada lagi")).toBe(true);
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
