import { AssetType, BudgetMode, EmploymentType, FinancialGoalType, PrimaryGoal } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  isReadyCommand,
  parseAssetSelection,
  parseBooleanAnswer,
  parseBudgetMode,
  parseDayOfMonth,
  parseEmploymentTypes,
  parseGoalSelection,
  parseManualExpenseBreakdown,
  parseManualExpenseBreakdownDetails,
  parseMoneyInput,
  parseOptionalAge,
  parsePrimaryGoal,
  parseStockQuantityInput,
  parseStockSymbolInput
} from "@/lib/services/onboarding/onboarding-parser-service";

describe("onboarding parser service", () => {
  it("accepts flexible ready confirmation", () => {
    expect(isReadyCommand("Okey saya siap")).toBe(true);
    expect(isReadyCommand("1. Oke saya siap")).toBe(true);
    expect(isReadyCommand("ayo mulai")).toBe(true);
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
  });

  it("parses guided budget mode from free text", () => {
    expect(parseBudgetMode("belum punya, tolong buatin aja")).toBe(BudgetMode.GUIDED_PLAN);
  });

  it("parses goal and asset selections from context", () => {
    expect(parseGoalSelection("aku mau dana darurat dulu")).toBe(FinancialGoalType.EMERGENCY_FUND);
    expect(parseAssetSelection("sekarang saya punya emas antam")).toBe(AssetType.GOLD);
    expect(parseAssetSelection("aku mau catat properti dulu")).toBe(AssetType.PROPERTY);
  });

  it("normalizes stock code input into uppercase ticker", () => {
    expect(parseStockSymbolInput("bbri")).toBe("BBRI");
    expect(parseStockSymbolInput("kode sahamnya tlkm")).toBe("TLKM");
    expect(parseStockSymbolInput("bbri 123")).toBeNull();
  });

  it("parses stock quantity from lot or lembar text", () => {
    expect(parseStockQuantityInput("2 lot")).toEqual({
      amount: 2,
      unit: "lot",
      shares: 200,
      displayLabel: "2 lot"
    });
    expect(parseStockQuantityInput("150 lembar")).toEqual({
      amount: 150,
      unit: "lembar",
      shares: 150,
      displayLabel: "150 lembar"
    });
    expect(parseStockQuantityInput("dua lot")).toBeNull();
    expect(parseStockQuantityInput("150")).toBeNull();
  });

  it("parses flexible numeric answers", () => {
    expect(parseMoneyInput("sekitar 3 juta sebulan")).toBe(3000000);
    expect(parseDayOfMonth("gajian tiap tanggal 25")).toBe(25);
    expect(parseOptionalAge("targetnya umur 45 tahun")).toBe(45);
  });

  it("prioritizes negative boolean phrases over partial positive matches", () => {
    expect(parseBooleanAnswer("Ga ada")).toBe(false);
    expect(parseBooleanAnswer("gak ada lagi")).toBe(false);
    expect(parseBooleanAnswer("ada lagi")).toBe(true);
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

