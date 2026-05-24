import { FinancialGoalType, OnboardingStep } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { formatPromptForChat } from "@/lib/services/onboarding/flow/shared/questions/chat-format";
import { getPromptForStep } from "@/lib/services/onboarding/flow/get-prompt-for-step";
import { getNextOnboardingStep } from "@/lib/services/onboarding/flow/next-step";
import type { OnboardingPromptContext } from "@/lib/services/onboarding/flow/shared/questions/question-types";

const baseContext: OnboardingPromptContext = {
  needsPhoneVerification: false,
  budgetMode: null,
  employmentTypes: [],
  currentGoalType: null,
  currentAssetType: null,
  expenseAvailable: false,
  hasExpenseDependentGoal: false,
  goalExpenseStrategy: null,
  monthlyIncomeTotal: null,
  monthlyExpenseTotal: null,
  potentialMonthlySaving: null
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
    expect(text).toContain("1. 🚨Nabung dana darurat");
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

  it("keeps removed asset classes out of onboarding asset choices", () => {
    const prompt = getPromptForStep(OnboardingStep.ASK_ASSET_SELECTION, baseContext);
    const text = formatPromptForChat(prompt);

    expect(text).toContain("1. Tabungan");
    expect(text).toContain("2. Emas");
    expect(text).toContain("3. Saham");
    expect(text).toContain("4. Properti");
    expect(text).toContain("5. Belum punya");
    expect(text).not.toContain("Crypto");
    expect(text).not.toContain("Reksa dana");
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

  it("only offers manual or guided budget setup choices", () => {
    const prompt = getPromptForStep(OnboardingStep.ASK_BUDGET_MODE, baseContext);
    const text = formatPromptForChat(prompt);

    expect(text).toContain("1. Saya sudah punya gambaran pengeluaran");
    expect(text).toContain("2. Saya belum punya, tolong bantu susun");
    expect(text).not.toContain("3.");
    expect(text).not.toContain("Lihat dari catatan transaksi saya bulan ini");
  });

  it("asks active income frequency as choices instead of numeric examples", () => {
    const prompt = getPromptForStep("ASK_ACTIVE_INCOME_COUNT" as OnboardingStep, baseContext);
    const text = formatPromptForChat(prompt);

    expect(text).toContain("Dalam sebulan biasanya Boss menerima income aktif dengan pola yang mana?");
    expect(text).toContain("1. Satu kali gajian");
    expect(text).toContain("2. Lebih dari satu kali gajian");
    expect(text).not.toContain("Contoh:");
    expect(text).not.toContain("Balas angkanya aja");
  });

  it("keeps multi-active-income open ended until cycle start and completion are known", () => {
    expect(
      getNextOnboardingStep(
        OnboardingStep.ASK_SALARY_DATE,
        {
          ...baseContext,
          activeIncomeMode: "MULTIPLE",
          activeIncomePaydayCount: 1,
          activeIncomeCycleStartDay: null
        },
        25
      )
    ).toBe("ASK_ACTIVE_INCOME_CYCLE_CONFIRM");
    expect(
      getNextOnboardingStep(
        "ASK_ACTIVE_INCOME_CYCLE_CONFIRM" as OnboardingStep,
        {
          ...baseContext,
          activeIncomeMode: "MULTIPLE",
          activeIncomePaydayCount: 1,
          activeIncomeCycleStartDay: null
        },
        false
      )
    ).toBe("ASK_ACTIVE_INCOME_ADD_MORE");
    expect(
      getNextOnboardingStep(
        "ASK_ACTIVE_INCOME_ADD_MORE" as OnboardingStep,
        {
          ...baseContext,
          activeIncomeMode: "MULTIPLE",
          activeIncomePaydayCount: 1,
          activeIncomeCycleStartDay: null
        },
        false
      )
    ).toBe("ASK_ACTIVE_INCOME_CYCLE_SELECT");
    expect(
      getNextOnboardingStep(
        "ASK_ACTIVE_INCOME_CYCLE_SELECT" as OnboardingStep,
        {
          ...baseContext,
          activeIncomeMode: "MULTIPLE",
          activeIncomePaydays: [25, 10],
          activeIncomeCycleStartDay: null
        },
        10
      )
    ).toBe(OnboardingStep.ASK_HAS_PASSIVE_INCOME);
  });

  it("moves from positioning to goals before asking income details", () => {
    expect(
      getNextOnboardingStep(OnboardingStep.WAIT_REGISTER, baseContext, "START")
    ).toBe(OnboardingStep.ASK_GOAL_SELECTION);
    expect(
      getNextOnboardingStep(OnboardingStep.ASK_PRIMARY_GOAL, baseContext, "HOUSE")
    ).toBe(OnboardingStep.ASK_BUDGET_MODE);
  });

  it("continues to budget setup after goal selection", () => {
    expect(
      getNextOnboardingStep(
        OnboardingStep.ASK_GOAL_SELECTION,
        baseContext,
        FinancialGoalType.EMERGENCY_FUND
      )
    ).toBe(OnboardingStep.ASK_BUDGET_MODE);
  });

  it("holds expense-dependent questions until after goals, assets, and income", () => {
    const expenseDependentContext: OnboardingPromptContext = {
      ...baseContext,
      hasExpenseDependentGoal: true
    };

    expect(
      getNextOnboardingStep(OnboardingStep.ASK_ASSET_ADD_MORE, expenseDependentContext, false)
    ).toBe(OnboardingStep.SHOW_ANALYSIS);
    expect(
      getNextOnboardingStep(OnboardingStep.ASK_HAS_PASSIVE_INCOME, expenseDependentContext, false)
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
        FinancialGoalType.HOUSE,
        FinancialGoalType.CUSTOM
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

});
