import { AssetType, BudgetMode, FinancialGoalType, OnboardingStep } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  formatPromptForChatBubbles,
  formatPromptForChat,
  getNextOnboardingStep,
  getPromptForStep,
  type OnboardingPromptContext
} from "@/lib/services/onboarding/onboarding-flow-service";

const baseContext: OnboardingPromptContext = {
  needsPhoneVerification: false,
  budgetMode: null,
  employmentTypes: [],
  currentGoalType: null,
  currentAssetType: null,
  expenseAvailable: false,
  hasExpenseDependentGoal: false,
  hasFinancialFreedomGoal: false,
  goalExpenseStrategy: null,
  monthlyIncomeTotal: null,
  monthlyExpenseTotal: null,
  potentialMonthlySaving: null,
  financialFreedomEtaMonths: null
};

const getCurrentJakartaTargetExamples = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jakarta"
  }).formatToParts(new Date());
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "1970");
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return {
    numeric: `${String(nextMonth).padStart(2, "0")}/${nextYear}`,
    long: new Intl.DateTimeFormat("id-ID", {
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jakarta"
    }).format(new Date(Date.UTC(nextYear, nextMonth - 1, 1, 12)))
  };
};

describe("onboarding flow service", () => {
  it("does not render numbered options for boolean prompts", () => {
    const prompt = getPromptForStep(OnboardingStep.ASK_HAS_PASSIVE_INCOME, baseContext);
    const text = formatPromptForChat(prompt);

    expect(text).not.toContain("Pilihan:");
    expect(text).toBe("Selain itu ada income pasif juga Boss?");
  });

  it("still renders numbered options for multi-choice prompts", () => {
    const prompt = getPromptForStep(OnboardingStep.ASK_GOAL_SELECTION, baseContext);
    const text = formatPromptForChat(prompt);

    expect(text).toContain("Pilihan:");
    expect(text).toContain("1. Nabung dana darurat");
  });

  it("uses branched gold prompts instead of the old generic asset copy", () => {
    const typePrompt = getPromptForStep(OnboardingStep.ASK_ASSET_GOLD_TYPE, baseContext);
    const gramsPrompt = getPromptForStep(OnboardingStep.ASK_ASSET_GOLD_GRAMS, {
      ...baseContext,
      currentAssetType: null,
      currentGoldType: "BULLION"
    });

    expect(formatPromptForChat(typePrompt)).toContain("Emas yang kamu punya bentuknya apa Boss?");
    expect(formatPromptForChat(typePrompt)).toContain("1. Batangan");
    expect(formatPromptForChat(gramsPrompt)).toContain("Berapa gram emas batangannya Boss?");
  });

  it("frames savings prompts with tabungan wording", () => {
    const namePrompt = getPromptForStep(OnboardingStep.ASK_ASSET_SAVINGS_NAME, baseContext);
    const balancePrompt = getPromptForStep(OnboardingStep.ASK_ASSET_SAVINGS_BALANCE, baseContext);

    expect(namePrompt.title).toBe("Detail Tabungan");
    expect(formatPromptForChat(namePrompt)).toContain("Tabungan ini kamu taruh di mana Boss?");
    expect(formatPromptForChat(namePrompt)).toContain("bank, cash, atau e-wallet");
    expect(formatPromptForChat(namePrompt)).toContain("`DANA`");
    expect(balancePrompt.title).toBe("Jumlah Tabungan");
    expect(formatPromptForChat(balancePrompt)).toContain("Jumlah tabungannya sekarang berapa Boss?");
  });

  it("asks asset selection directly without the old onboarding bridge copy", () => {
    const prompt = getPromptForStep(OnboardingStep.ASK_ASSET_SELECTION, baseContext);
    const text = formatPromptForChat(prompt);

    expect(text).toContain("Sekarang aset yang sudah Boss punya apa aja?");
    expect(text).toContain("Kalau ada beberapa, boleh pilih sekaligus.");
    expect(text).toContain("Belum punya");
    expect(text).not.toContain("Quick setup-nya sudah beres.");
    expect(text).not.toContain("ditambah di dashboard");
  });

  it("asks guided other expenses by stage instead of jumping straight to nominal", () => {
    const prompt = getPromptForStep(OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS, baseContext);
    const categoryPrompt = getPromptForStep(OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS, {
      ...baseContext,
      guidedOtherExpenseStage: "category_name",
      guidedOtherExpenseItems: [
        { label: "Makan & kebutuhan harian", amount: 1000000 },
        { label: "Parkir", amount: 150000 }
      ]
    });
    const amountPrompt = getPromptForStep(OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS, {
      ...baseContext,
      guidedOtherExpenseStage: "category_amount",
      guidedOtherExpensePendingLabel: "Parkir"
    });
    const addMorePrompt = getPromptForStep(OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS, {
      ...baseContext,
      guidedOtherExpenseStage: "add_more",
      guidedOtherExpenseItems: [
        { label: "Makan & kebutuhan harian", amount: 1000000 },
        { label: "Parkir", amount: 150000 }
      ]
    });

    expect(prompt.title).toBe("Pengeluaran Lainnya");
    expect(prompt.inputType).toBe("single_select");
    expect(formatPromptForChat(prompt)).toContain("masih ada pengeluaran lain");
    expect(formatPromptForChat(prompt)).not.toContain("kira-kira berapa");

    expect(categoryPrompt.title).toBe("Kategori Pengeluaran Lain");
    expect(formatPromptForChat(categoryPrompt).toLowerCase()).toContain("kategori pengeluaran lainnya apa");
    expect(formatPromptForChat(categoryPrompt)).not.toContain("Berikut kategori pengeluarannya:");
    expect(formatPromptForChat(categoryPrompt)).not.toContain("Makan & kebutuhan harian");
    expect(formatPromptForChat(categoryPrompt)).not.toContain("Parkir");

    expect(amountPrompt.title).toBe("Nominal Pengeluaran Lain");
    expect(formatPromptForChat(amountPrompt)).toContain("Untuk Parkir");

    expect(addMorePrompt.title).toBe("Tambah Pengeluaran Lain?");
    expect(formatPromptForChat(addMorePrompt)).not.toContain("Berikut kategori pengeluarannya:");
    expect(formatPromptForChat(addMorePrompt)).not.toContain("Makan & kebutuhan harian");
    expect(formatPromptForChat(addMorePrompt)).toContain("Masih ada pengeluaran lain lagi");
  });

  it("switches mutual fund fallback copy to manual value when nab data is unavailable", () => {
    const symbolPrompt = getPromptForStep(OnboardingStep.ASK_ASSET_MUTUAL_FUND_SYMBOL, baseContext);
    const manualValuePrompt = getPromptForStep(OnboardingStep.ASK_ASSET_ESTIMATED_VALUE, {
      ...baseContext,
      currentAssetType: AssetType.MUTUAL_FUND,
      hasCurrentMutualFundUnits: true
    });
    const propertyPrompt = getPromptForStep(OnboardingStep.ASK_ASSET_PROPERTY_ESTIMATED_VALUE, baseContext);

    expect(symbolPrompt.body).toContain("NAB terakhir");
    expect(manualValuePrompt.inputType).toBe("money");
    expect(manualValuePrompt.body).toContain("belum ketemu data NAB");
    expect(propertyPrompt.body.toLowerCase()).toContain("patokan awal");
  });

  it("uses the saved custom goal name and next month examples in target date prompt", () => {
    const examples = getCurrentJakartaTargetExamples();
    const prompt = getPromptForStep(OnboardingStep.ASK_GOAL_TARGET_DATE, {
      ...baseContext,
      currentGoalType: FinancialGoalType.CUSTOM,
      latestCustomGoalName: "Dana Nikah"
    });

    expect(prompt.body).toContain("Dana Nikah maunya tercapai kapan Boss?");
    expect(prompt.body).toContain(examples.numeric);
    expect(prompt.body).toContain(examples.long);
    expect(prompt.body.toLowerCase()).not.toContain("mulai dari bulan ini");
  });

  it("keeps the welcome prompt natural without explicit answer examples", () => {
    const prompt = getPromptForStep(OnboardingStep.WAIT_REGISTER, baseContext);
    const text = formatPromptForChat(prompt);

    expect(text).not.toContain("Pilihan:");
    expect(text.toLowerCase()).not.toContain("oke saya siap");
    expect(text).toContain("Halo Boss");
    expect(text.toLowerCase()).toContain("calon asisten keuangan pribadi anda");
    expect(text.toLowerCase()).toContain("langsung balas saja");
  });

  it("frames manual expense prompt as flexible input instead of rigid format", () => {
    const prompt = getPromptForStep(OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN, baseContext);
    const text = formatPromptForChat(prompt);

    expect(text.toLowerCase()).toContain("gaya santai");
    expect(text.toLowerCase()).toContain("saya bantu rapihin");
    expect(text.toLowerCase()).toContain("contoh kalau mau");
  });

  it("moves from positioning to goals before asking income details", () => {
    expect(
      getNextOnboardingStep(OnboardingStep.WAIT_REGISTER, baseContext, "START")
    ).toBe(OnboardingStep.ASK_GOAL_SELECTION);
    expect(
      getNextOnboardingStep(OnboardingStep.ASK_PRIMARY_GOAL, baseContext, "HOUSE")
    ).toBe(OnboardingStep.ASK_BUDGET_MODE);
  });

  it("keeps financial freedom target timing until after expense is known", () => {
    expect(
      getNextOnboardingStep(
        OnboardingStep.ASK_GOAL_SELECTION,
        baseContext,
        "FINANCIAL_FREEDOM"
      )
    ).toBe(OnboardingStep.ASK_BUDGET_MODE);

    const calculatedFreedomContext: OnboardingPromptContext = {
      ...baseContext,
      expenseAvailable: true,
      hasFinancialFreedomGoal: true,
      monthlyIncomeTotal: 12000000,
      monthlyExpenseTotal: 7000000,
      potentialMonthlySaving: 5000000,
      financialFreedomEtaMonths: 180
    };

    expect(
      getNextOnboardingStep(
        OnboardingStep.ASK_GOAL_EXPENSE_TOTAL,
        calculatedFreedomContext,
        7000000
      )
    ).toBe(OnboardingStep.ASK_ASSET_SELECTION);
  });

  it("holds expense-dependent questions until after goals, assets, and income", () => {
    const autoContext: OnboardingPromptContext = {
      ...baseContext,
      budgetMode: BudgetMode.AUTO_FROM_TRANSACTIONS,
      hasExpenseDependentGoal: true
    };

    expect(
      getNextOnboardingStep(OnboardingStep.ASK_ASSET_ADD_MORE, autoContext, false)
    ).toBe(OnboardingStep.SHOW_ANALYSIS);
    expect(
      getNextOnboardingStep(OnboardingStep.ASK_HAS_PASSIVE_INCOME, autoContext, false)
    ).toBe(OnboardingStep.ASK_GOAL_EXPENSE_STRATEGY);
  });

  it("keeps guided other expenses on the same step until the loop is finished", () => {
    expect(
      getNextOnboardingStep(OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS, baseContext, {
        kind: "presence",
        hasOtherExpense: true
      })
    ).toBe(OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS);

    expect(
      getNextOnboardingStep(OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS, baseContext, {
        kind: "category_name",
        label: "Parkir"
      })
    ).toBe(OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS);

    expect(
      getNextOnboardingStep(OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS, baseContext, {
        kind: "category_amount",
        label: "Parkir",
        amount: 150000
      })
    ).toBe(OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS);

    expect(
      getNextOnboardingStep(OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS, baseContext, {
        kind: "add_more",
        addMore: false
      })
    ).toBe(OnboardingStep.ASK_ASSET_SELECTION);
  });

  it("moves from multi-goal setup into quick-setup budgeting before optional assets", () => {
    const multiGoalContext: OnboardingPromptContext = {
      ...baseContext,
      activeGoalCount: 3,
      selectedGoalTypes: [
        FinancialGoalType.EMERGENCY_FUND,
        FinancialGoalType.CUSTOM,
        FinancialGoalType.FINANCIAL_FREEDOM
      ]
    };

    expect(
      getNextOnboardingStep(OnboardingStep.ASK_GOAL_ADD_MORE, multiGoalContext, false)
    ).toBe(OnboardingStep.ASK_BUDGET_MODE);
  });

  it("asks optional assets before the last phone verification gate", () => {
    const phoneContext: OnboardingPromptContext = {
      ...baseContext,
      needsPhoneVerification: true
    };

    expect(
      getNextOnboardingStep(OnboardingStep.ASK_GOAL_EXPENSE_TOTAL, phoneContext, 4500000)
    ).toBe(OnboardingStep.ASK_ASSET_SELECTION);
    expect(
      getNextOnboardingStep(OnboardingStep.ASK_ASSET_SELECTION, phoneContext, "NONE")
    ).toBe(OnboardingStep.VERIFY_PHONE);
    expect(
      getNextOnboardingStep(OnboardingStep.VERIFY_PHONE, phoneContext, "6281234567890")
    ).toBe(OnboardingStep.SHOW_ANALYSIS);
  });

  it("shows projection copy instead of asking years directly", () => {
    const prompt = getPromptForStep(OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE, {
      ...baseContext,
      expenseAvailable: true,
      hasFinancialFreedomGoal: true,
      monthlyIncomeTotal: 15000000,
      monthlyExpenseTotal: 9000000,
      potentialMonthlySaving: 6000000,
      financialFreedomEtaMonths: 150,
      financialFreedomTargetAmount: 2700000000,
      financialFreedomStartLabel: "Mei 2026",
      financialFreedomProjectedMonthlyContribution: 6000000,
      financialFreedomSafeWithdrawalRate: 0.04,
      financialFreedomSafeAnnualWithdrawal: 108000000,
      financialFreedomSafeMonthlyWithdrawal: 9000000
    });

    expect(prompt.title).toContain("Financial Freedom");
    expect(prompt.inputType).toBe("month");
    expect(prompt.body).toContain("📌 Gambaran sekarang");
    expect(prompt.body).toContain("\n\n📈 Proyeksi realistis");
    expect(prompt.body).toContain("\n\n🗓️ Timeline realistis");
    expect(prompt.body).toContain("\n\n🧾 Skema setelah tercapai");
    expect(prompt.body).toContain("\n\n🎯 Target versi kamu");
    expect(prompt.body).toContain("📈 Proyeksi realistis");
    expect(prompt.body).toContain("🗓️ Timeline realistis");
    expect(prompt.body).toContain("🧾 Skema setelah tercapai");
    expect(prompt.body).toContain("🎯 Target versi kamu");
    expect(prompt.body).not.toContain("💸");
    expect(prompt.body).not.toContain("🤔");
    expect(prompt.body.toLowerCase()).toContain("pemasukan");
    expect(prompt.body.toLowerCase()).toContain("target dana ff");
    expect(prompt.body.toLowerCase()).toContain("patokan tarik aman");
    expect(prompt.body).toMatch(/20\d{2}/);
    expect(prompt.body.toLowerCase()).toContain("bulan dan tahun");
    expect(prompt.body.toLowerCase()).not.toContain("berapa tahun lagi");
    expect(prompt.body.toLowerCase()).toContain("hasil pasif per bulan");
    expect(prompt.body).toContain("Rp10 juta/bulan");
    expect(prompt.body.toLowerCase()).toContain("hapus target financial freedom");
  });

  it("calls out when financial freedom eta is still extremely far away", () => {
    const prompt = getPromptForStep(OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE, {
      ...baseContext,
      expenseAvailable: true,
      hasFinancialFreedomGoal: true,
      monthlyIncomeTotal: 6700000,
      monthlyExpenseTotal: 5500000,
      potentialMonthlySaving: 1200000,
      financialFreedomEtaMonths: 1370
    });

    expect(prompt.body.toLowerCase()).toContain("masih sangat jauh");
    expect(prompt.body.toLowerCase()).toContain("tahun lagi");
  });

  it("clarifies that free cashflow is still total room before the main goal takes its share", () => {
    const prompt = getPromptForStep(OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE, {
      ...baseContext,
      expenseAvailable: true,
      hasFinancialFreedomGoal: true,
      selectedGoalTypes: [FinancialGoalType.EMERGENCY_FUND, FinancialGoalType.FINANCIAL_FREEDOM],
      goalExecutionMode: "SEQUENTIAL" as any,
      priorityGoalType: FinancialGoalType.EMERGENCY_FUND,
      monthlyIncomeTotal: 6700000,
      monthlyExpenseTotal: 5500000,
      potentialMonthlySaving: 1200000,
      financialFreedomEtaMonths: 1370
    });

    expect(prompt.body).toContain("ruang tabung total");
    expect(prompt.body).toContain("Dana Darurat");
  });

  it("mentions the full blocker queue for financial freedom when several earlier goals still take the timeline", () => {
    const prompt = getPromptForStep(OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE, {
      ...baseContext,
      expenseAvailable: true,
      hasFinancialFreedomGoal: true,
      selectedGoalTypes: [
        FinancialGoalType.EMERGENCY_FUND,
        FinancialGoalType.HOUSE,
        FinancialGoalType.VEHICLE,
        FinancialGoalType.FINANCIAL_FREEDOM
      ],
      goalExecutionMode: "SEQUENTIAL" as any,
      priorityGoalType: FinancialGoalType.EMERGENCY_FUND,
      monthlyIncomeTotal: 9200000,
      monthlyExpenseTotal: 2500000,
      potentialMonthlySaving: 6700000,
      financialFreedomMonthlyAllocation: 0,
      financialFreedomProjectionBasis: "AFTER_PRIORITY_GOAL",
      financialFreedomPriorityGoalName: "Dana Darurat, Beli Rumah, dan Beli Kendaraan",
      financialFreedomEtaMonths: 260
    });

    expect(prompt.body).toContain("Dana Darurat, Beli Rumah, dan Beli Kendaraan");
    expect(prompt.body).toContain("ruang tabung total");
  });

  it("suggests a small parallel contribution for financial freedom when sequential mode pushes it too far away", () => {
    const prompt = getPromptForStep(OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE, {
      ...baseContext,
      expenseAvailable: true,
      hasFinancialFreedomGoal: true,
      selectedGoalTypes: [
        FinancialGoalType.EMERGENCY_FUND,
        FinancialGoalType.HOUSE,
        FinancialGoalType.FINANCIAL_FREEDOM
      ],
      goalExecutionMode: "SEQUENTIAL" as any,
      priorityGoalType: FinancialGoalType.EMERGENCY_FUND,
      monthlyIncomeTotal: 9200000,
      monthlyExpenseTotal: 2500000,
      potentialMonthlySaving: 6700000,
      financialFreedomMonthlyAllocation: 0,
      financialFreedomProjectionBasis: "AFTER_PRIORITY_GOAL",
      financialFreedomPriorityGoalName: "Dana Darurat dan Beli Rumah",
      financialFreedomEtaMonths: 320
    });

    expect(prompt.body).toContain("sisihkan kecil dulu");
    expect(prompt.body).toContain("Rp300.000");
    expect(prompt.body).toContain("Rp700.000");
  });

  it("splits the financial freedom prompt into separate chat bubbles for timeline, skema, and target ask", () => {
    const prompt = getPromptForStep(OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE, {
      ...baseContext,
      expenseAvailable: true,
      hasFinancialFreedomGoal: true,
      selectedGoalTypes: [
        FinancialGoalType.EMERGENCY_FUND,
        FinancialGoalType.HOUSE,
        FinancialGoalType.FINANCIAL_FREEDOM
      ],
      goalExecutionMode: "SEQUENTIAL" as any,
      priorityGoalType: FinancialGoalType.EMERGENCY_FUND,
      monthlyIncomeTotal: 9200000,
      monthlyExpenseTotal: 2500000,
      potentialMonthlySaving: 6700000,
      financialFreedomEtaMonths: 120,
      financialFreedomTargetAmount: 750000000,
      financialFreedomMonthlyAllocation: 6700000,
      financialFreedomProjectionBasis: "AFTER_PRIORITY_GOAL",
      financialFreedomPriorityGoalName: "Dana Darurat dan Beli Rumah",
      financialFreedomStartLabel: "Agustus 2035",
      financialFreedomProjectedMonthlyContribution: 6700000,
      financialFreedomSafeWithdrawalRate: 0.04,
      financialFreedomSafeAnnualWithdrawal: 30000000,
      financialFreedomSafeMonthlyWithdrawal: 2500000
    });

    const bubbles = formatPromptForChatBubbles(prompt);

    expect(bubbles).toHaveLength(4);
    expect(bubbles[0]).toContain("📌 Gambaran sekarang");
    expect(bubbles[0]).toContain("📈 Proyeksi realistis");
    expect(bubbles[1]).toContain("🗓️ Timeline realistis");
    expect(bubbles[2]).toContain("🧾 Skema setelah tercapai");
    expect(bubbles[3]).toContain("🎯 Target versi kamu");
  });
});
