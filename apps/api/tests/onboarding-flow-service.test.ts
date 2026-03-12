import { OnboardingStep } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  formatPromptForChat,
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
  goalExpenseStrategy: null
};

describe("onboarding flow service", () => {
  it("does not render numbered options for boolean prompts", () => {
    const prompt = getPromptForStep(OnboardingStep.ASK_HAS_PASSIVE_INCOME, baseContext);
    const text = formatPromptForChat(prompt);

    expect(text).not.toContain("Pilihan:");
    expect(text).toBe("Ada passive income Boss?");
  });

  it("still renders numbered options for multi-choice prompts", () => {
    const prompt = getPromptForStep(OnboardingStep.ASK_PRIMARY_GOAL, baseContext);
    const text = formatPromptForChat(prompt);

    expect(text).toContain("Pilihan:");
    expect(text).toContain("1. Mengatur pengeluaran");
  });

  it("keeps the welcome prompt natural without explicit answer examples", () => {
    const prompt = getPromptForStep(OnboardingStep.WAIT_REGISTER, baseContext);
    const text = formatPromptForChat(prompt);

    expect(text).not.toContain("Pilihan:");
    expect(text.toLowerCase()).not.toContain("oke saya siap");
    expect(text.toLowerCase()).toContain("langsung balas saja");
  });

  it("frames manual expense prompt as flexible input instead of rigid format", () => {
    const prompt = getPromptForStep(OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN, baseContext);
    const text = formatPromptForChat(prompt);

    expect(text.toLowerCase()).toContain("gaya bebas");
    expect(text.toLowerCase()).toContain("saya akan baca otomatis");
    expect(text.toLowerCase()).toContain("contoh kalau mau");
  });
});

