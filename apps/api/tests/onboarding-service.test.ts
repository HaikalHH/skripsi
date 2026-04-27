import {
  BudgetMode,
  OnboardingStatus,
  OnboardingStep,
  RegistrationStatus
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const store = {
    users: [] as any[],
    onboardingCanonicalizations: {} as Record<string, string | null>,
    onboardingSessions: [] as any[],
    createdAssets: [] as any[],
    sessionCounter: 1
  };

  const prismaMock: any = {
    user: {
      findUnique: async ({ where }: any) => {
        if (where?.id) {
          return store.users.find((user) => user.id === where.id) ?? null;
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        const user = store.users.find((item) => item.id === where.id);
        if (!user) throw new Error("User not found");
        Object.assign(user, data, { updatedAt: new Date("2026-03-10T10:00:00.000Z") });
        return user;
      }
    },
    onboardingSession: {
      findMany: async ({ where }: any) =>
        store.onboardingSessions.filter((session) => session.userId === where.userId),
      create: async ({ data }: any) => {
        const row = {
          id: `session_${store.sessionCounter++}`,
          createdAt: new Date(`2026-03-10T10:00:${String(store.sessionCounter).padStart(2, "0")}.000Z`),
          ...data
        };
        store.onboardingSessions.push(row);
        return row;
      }
    }
  };

  return { store, prismaMock };
});

vi.mock("@/lib/prisma", () => ({
  prisma: hoisted.prismaMock
}));

vi.mock("@/lib/services/ai/ai-service", () => ({
  canonicalizeOnboardingAnswer: vi.fn(async ({ rawAnswer }: any) =>
    Object.prototype.hasOwnProperty.call(hoisted.store.onboardingCanonicalizations, rawAnswer)
      ? hoisted.store.onboardingCanonicalizations[rawAnswer]
      : null
  )
}));

vi.mock("@/lib/services/onboarding/onboarding-calculation-service", () => ({
  buildInitialFinancialProfile: vi.fn(async () => null),
  createOnboardingAsset: vi.fn(async (params: any) => {
    hoisted.store.createdAssets.push(params);
    return null;
  }),
  createOrUpdateFinancialGoal: vi.fn(async () => null),
  deriveEmploymentSummary: vi.fn(() => ({
    employmentType: "OTHER",
    incomeStability: "STABLE"
  })),
  generateOnboardingAnalysis: vi.fn(async () => "analysis"),
  parseManualBreakdownTotal: vi.fn(() => 0),
  replaceExpensePlan: vi.fn(async () => null),
  setMonthlyExpenseTotal: vi.fn(async () => null),
  upsertIncomeProfile: vi.fn(async () => null)
}));

vi.mock("@/lib/services/payments/payment-service", () => ({
  buildDummyPaymentLink: vi.fn((token: string) => `https://pay.test/${token}`),
  createOrGetPendingPaymentSession: vi.fn(async () => ({ token: "pay_token" }))
}));

vi.mock("@/lib/services/assistant/conversation-memory-service", () => ({
  resolveConversationMemory: vi.fn(async ({ text }: any) => ({
    kind: "none",
    effectiveText: text
  }))
}));

import { handleOnboarding, submitOnboardingAnswer } from "@/lib/services/onboarding/onboarding-service";

const seedUser = (overrides: Record<string, unknown>) => {
  hoisted.store.users = [
    {
      id: "user_1",
      waNumber: "6281234567890",
      name: "Test User",
      currency: "IDR",
      onboardingStatus: OnboardingStatus.IN_PROGRESS,
      onboardingStep: OnboardingStep.WAIT_REGISTER,
      registrationStatus: RegistrationStatus.PENDING,
      onboardingCompletedAt: null,
      budgetMode: null,
      employmentType: null,
      incomeStability: null,
      hasPassiveIncome: null,
      salaryDate: null,
      targetFinancialFreedomAge: null,
      hasAssets: null,
      analysisReady: false,
      createdAt: new Date("2026-03-10T10:00:00.000Z"),
      updatedAt: new Date("2026-03-10T10:00:00.000Z"),
      ...overrides
    }
  ];
  hoisted.store.onboardingCanonicalizations = {};
  hoisted.store.onboardingSessions = [];
  hoisted.store.createdAssets = [];
  hoisted.store.sessionCounter = 1;
};

const sendText = async (text: string) =>
  handleOnboarding({
    user: hoisted.store.users[0],
    isNew: false,
    messageType: "TEXT",
    text
  });

describe("onboarding service semantic fallback", () => {
  beforeEach(() => {
    seedUser({});
  });

  it("normalizes a freeform ready confirmation into the welcome start command", async () => {
    hoisted.store.onboardingCanonicalizations["gaskeun boss"] = "Oke saya siap";

    const state = await submitOnboardingAnswer({
      userId: "user_1",
      answer: "gaskeun boss"
    });

    expect(state.stepKey).toBe(OnboardingStep.ASK_PRIMARY_GOAL);
    expect(state.promptText).toContain("Apa tujuan utama kamu pakai AI Finance ini?");
    expect(hoisted.store.users[0].onboardingStatus).toBe(OnboardingStatus.IN_PROGRESS);
  });

  it("normalizes a freeform budget planning answer into the guided budget mode", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_BUDGET_MODE
    });
    hoisted.store.onboardingCanonicalizations["belum ada, bantu susunin aja"] =
      "Belum punya, tapi mau dibantu membuat";

    const state = await submitOnboardingAnswer({
      userId: "user_1",
      answer: "belum ada, bantu susunin aja"
    });

    expect(state.stepKey).toBe(OnboardingStep.ASK_GUIDED_EXPENSE_FOOD);
    expect(state.promptText).toContain("pengeluaran untuk makan dan minum");
    expect(hoisted.store.users[0].budgetMode).toBe(BudgetMode.GUIDED_PLAN);
  });
});

describe("onboarding service asset flow", () => {
  beforeEach(() => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_ASSET_SELECTION
    });
  });

  it("guides stock asset entry step by step and stores converted share quantity", async () => {
    const selectStep = await sendText("saham");
    expect(selectStep.state?.stepKey).toBe(OnboardingStep.ASK_ASSET_NAME);
    expect(selectStep.replyText).toContain("Apa kode sahamnya?");

    const codeStep = await sendText("bbri");
    expect(codeStep.state?.stepKey).toBe(OnboardingStep.ASK_ASSET_GOLD_GRAMS);
    expect(codeStep.replyText).toContain("Berapa yang kamu punya?");

    const quantityStep = await sendText("2 lot");
    expect(quantityStep.state?.stepKey).toBe(OnboardingStep.ASK_ASSET_ESTIMATED_VALUE);
    expect(quantityStep.replyText).toContain("Berapa harga beli per lembar sahamnya?");

    const priceStep = await sendText("9000");
    expect(priceStep.state?.stepKey).toBe(OnboardingStep.ASK_ASSET_ADD_MORE);
    expect(priceStep.replyText).toContain("Berikut catatan saham kamu:");
    expect(priceStep.replyText).toContain("Kode saham: BBRI");
    expect(priceStep.replyText).toContain("Jumlah: 2 lot (200 lembar)");
    expect(priceStep.replyText).toContain("Harga beli per lembar: Rp. 9.000");
    expect(priceStep.replyText).toContain("Total nilai: Rp. 1.800.000");
    expect(priceStep.replyText).toContain("Apakah ada aset lain yang ingin kamu tambahkan?");

    expect(hoisted.store.createdAssets).toEqual([
      {
        userId: "user_1",
        assetType: "STOCK",
        assetName: "BBRI",
        quantity: 200,
        unit: "lembar",
        estimatedValue: 1800000,
        notes: "2 lot @ 9000"
      }
    ]);
  });

  it("uses bank and saldo prompts for savings assets", async () => {
    const selectStep = await sendText("tabungan");
    expect(selectStep.state?.stepKey).toBe(OnboardingStep.ASK_ASSET_NAME);
    expect(selectStep.replyText).toContain("Di bank mana tabungannya?");

    const bankStep = await sendText("BCA");
    expect(bankStep.state?.stepKey).toBe(OnboardingStep.ASK_ASSET_ESTIMATED_VALUE);
    expect(bankStep.replyText).toContain("Berapa saldo tabungannya?");

    const saldoStep = await sendText("5 juta");
    expect(saldoStep.state?.stepKey).toBe(OnboardingStep.ASK_ASSET_ADD_MORE);
    expect(saldoStep.replyText).toContain("Berikut catatan tabungan kamu:");
    expect(saldoStep.replyText).toContain("Bank: BCA");
    expect(saldoStep.replyText).toContain("Saldo: Rp. 5.000.000");

    expect(hoisted.store.createdAssets).toEqual([
      {
        userId: "user_1",
        assetType: "SAVINGS",
        assetName: "BCA",
        estimatedValue: 5000000,
        unit: "account"
      }
    ]);
  });

  it("uses property-specific prompts", async () => {
    const selectStep = await sendText("properti");
    expect(selectStep.state?.stepKey).toBe(OnboardingStep.ASK_ASSET_NAME);
    expect(selectStep.replyText).toContain("Properti apa yang kamu punya?");

    const nameStep = await sendText("apartemen");
    expect(nameStep.state?.stepKey).toBe(OnboardingStep.ASK_ASSET_ESTIMATED_VALUE);
    expect(nameStep.replyText).toContain("Berapa estimasi nilai propertinya?");
  });
});

