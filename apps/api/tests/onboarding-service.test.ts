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
    onboardingCanonicalizations: {} as Record<string, string | null>
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
  createOnboardingAsset: vi.fn(async () => null),
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

import { submitOnboardingAnswer } from "@/lib/services/onboarding/onboarding-service";

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
};

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

