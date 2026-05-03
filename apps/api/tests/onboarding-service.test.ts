import {
  BudgetMode,
  ExpensePlanSource,
  FinancialGoalStatus,
  FinancialGoalType,
  OnboardingQuestionKey,
  OnboardingStatus,
  OnboardingStep,
  RegistrationStatus
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const store = {
    users: [] as any[],
    sessions: [] as any[],
    financialProfiles: [] as any[],
    expensePlans: [] as any[],
    financialGoals: [] as any[]
  };

  const ensureProfile = (userId: string) => {
    let profile = store.financialProfiles.find((item) => item.userId === userId);
    if (!profile) {
      profile = {
        userId,
        monthlyIncomeTotal: null,
        monthlyExpenseTotal: null,
        potentialMonthlySaving: null,
        emergencyFundTarget: null,
        financialFreedomTarget: null,
        activeIncomeMonthly: null,
        passiveIncomeMonthly: null,
        estimatedMonthlyIncome: null
      };
      store.financialProfiles.push(profile);
    }
    return profile;
  };

  const recomputeProfile = (userId: string) => {
    const profile = ensureProfile(userId);
    const incomeFromActive =
      (profile.activeIncomeMonthly ?? 0) + (profile.passiveIncomeMonthly ?? 0);
    profile.monthlyIncomeTotal =
      profile.estimatedMonthlyIncome ??
      (incomeFromActive > 0 ? incomeFromActive : profile.monthlyIncomeTotal);
    profile.potentialMonthlySaving =
      profile.monthlyIncomeTotal !== null && profile.monthlyExpenseTotal !== null
        ? profile.monthlyIncomeTotal - profile.monthlyExpenseTotal
        : null;
    profile.emergencyFundTarget =
      profile.monthlyExpenseTotal !== null ? profile.monthlyExpenseTotal * 6 : null;
    profile.financialFreedomTarget =
      profile.monthlyExpenseTotal !== null ? profile.monthlyExpenseTotal * 300 : null;
    return profile;
  };

  const upsertGoal = (payload: any) => {
    const existing = store.financialGoals.find(
      (goal) => goal.userId === payload.userId && goal.goalType === payload.goalType
    );
    if (existing) {
      Object.assign(existing, payload);
      return existing;
    }

    const created = {
      id: `goal_${store.financialGoals.length + 1}`,
      priorityOrder: store.financialGoals.length + 1,
      createdAt: new Date("2026-04-25T00:00:00.000Z"),
      ...payload
    };
    store.financialGoals.push(created);
    return created;
  };

  const upsertIncomeProfile = vi.fn(async (payload: any) => {
    const profile = ensureProfile(payload.userId);
    if ("activeIncomeMonthly" in payload) {
      profile.activeIncomeMonthly = payload.activeIncomeMonthly;
    }
    if ("passiveIncomeMonthly" in payload) {
      profile.passiveIncomeMonthly = payload.passiveIncomeMonthly;
    }
    if ("estimatedMonthlyIncome" in payload) {
      profile.estimatedMonthlyIncome = payload.estimatedMonthlyIncome;
    }
    recomputeProfile(payload.userId);
  });

  const replaceExpensePlan = vi.fn(async (payload: any) => {
    store.expensePlans = [
      {
        userId: payload.userId,
        source: payload.source,
        isActive: true,
        createdAt: new Date("2026-04-25T00:00:00.000Z"),
        items: Object.entries(payload.breakdown ?? {}).map(([category, amount]) => ({
          category,
          monthlyAmount: amount
        }))
      }
    ];
    const profile = ensureProfile(payload.userId);
    profile.monthlyExpenseTotal = Object.values(payload.breakdown ?? {}).reduce<number>(
      (sum, amount) => sum + (typeof amount === "number" ? amount : 0),
      0
    );
    recomputeProfile(payload.userId);
  });

  const setMonthlyExpenseTotal = vi.fn(async (userId: string, total: number) => {
    const profile = ensureProfile(userId);
    profile.monthlyExpenseTotal = total;
    recomputeProfile(userId);
  });

  const buildInitialFinancialProfile = vi.fn(async (userId: string) => {
    recomputeProfile(userId);
  });

  const createOrUpdateFinancialGoal = vi.fn(async (payload: any) => upsertGoal(payload));

  const prismaMock: any = {
    user: {
      findUnique: async ({ where }: any) =>
        store.users.find((user) => user.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const user = store.users.find((item) => item.id === where.id);
        if (!user) throw new Error("User not found");
        Object.assign(user, data, {
          updatedAt: new Date("2026-04-25T00:00:00.000Z")
        });
        return user;
      }
    },
    onboardingSession: {
      findMany: async ({ where, orderBy, take }: any) => {
        const filtered = store.sessions.filter((session) => {
          const userMatches = where?.userId ? session.userId === where.userId : true;
          const questionMatches = where?.questionKey
            ? session.questionKey === where.questionKey
            : true;
          const completedMatches =
            where?.isCompleted === undefined
              ? true
              : session.isCompleted === where.isCompleted;
          return userMatches && questionMatches && completedMatches;
        });

        filtered.sort((left, right) =>
          orderBy?.createdAt === "desc"
            ? right.createdAt.getTime() - left.createdAt.getTime()
            : left.createdAt.getTime() - right.createdAt.getTime()
        );

        return typeof take === "number" ? filtered.slice(0, take) : filtered;
      },
      create: async ({ data }: any) => {
        const session = {
          id: `session_${store.sessions.length + 1}`,
          createdAt: new Date(`2026-04-25T00:00:${String(store.sessions.length).padStart(2, "0")}.000Z`),
          updatedAt: new Date(`2026-04-25T00:00:${String(store.sessions.length).padStart(2, "0")}.000Z`),
          ...data
        };
        store.sessions.push(session);
        return session;
      },
      update: async ({ where, data }: any) => {
        const session = store.sessions.find((item) => item.id === where.id);
        if (!session) throw new Error("Session not found");
        Object.assign(session, data, {
          updatedAt: new Date("2026-04-25T00:05:00.000Z")
        });
        return session;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const session of store.sessions) {
          const idMatches = where?.id ? session.id === where.id : true;
          const completedMatches =
            where?.isCompleted === undefined
              ? true
              : session.isCompleted === where.isCompleted;
          if (!idMatches || !completedMatches) continue;
          Object.assign(session, data);
          count += 1;
        }
        return { count };
      },
      deleteMany: async ({ where }: any) => {
        const before = store.sessions.length;
        store.sessions = store.sessions.filter((session) => {
          const idMatches = where?.id ? session.id === where.id : true;
          const completedMatches =
            where?.isCompleted === undefined
              ? true
              : session.isCompleted === where.isCompleted;
          return !(idMatches && completedMatches);
        });
        return { count: before - store.sessions.length };
      }
    },
    financialProfile: {
      findUnique: async ({ where }: any) =>
        store.financialProfiles.find((profile) => profile.userId === where.userId) ?? null
    },
    expensePlan: {
      findFirst: async ({ where }: any) =>
        store.expensePlans.find((plan) => plan.userId === where.userId && plan.isActive) ?? null
    },
    financialGoal: {
      findFirst: async ({ where }: any) =>
        store.financialGoals.find(
          (goal) =>
            goal.userId === where.userId &&
            goal.goalType === where.goalType &&
            (!where.status?.in || where.status.in.includes(goal.status))
        ) ?? null,
      findMany: async ({ where }: any) =>
        store.financialGoals.filter(
          (goal) =>
            goal.userId === where.userId &&
            (!where.status?.in || where.status.in.includes(goal.status))
        ),
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const goal of store.financialGoals) {
          const userMatches = where?.userId ? goal.userId === where.userId : true;
          const goalMatches = where?.goalType ? goal.goalType === where.goalType : true;
          if (!userMatches || !goalMatches) continue;
          Object.assign(goal, data);
          count += 1;
        }
        return { count };
      }
    }
  };

  return {
    store,
    prismaMock,
    buildInitialFinancialProfile,
    createOrUpdateFinancialGoal,
    replaceExpensePlan,
    setMonthlyExpenseTotal,
    upsertIncomeProfile
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: hoisted.prismaMock
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock("@/lib/services/ai/ai-service", () => ({
  generateAIFinancialFreedomOnboardingAnalysis: vi.fn(async () => null),
  canonicalizeOnboardingAnswer: vi.fn(async () => null)
}));

vi.mock("@/lib/services/assistant/conversation-memory-service", () => ({
  resolveConversationMemory: vi.fn(async () => null)
}));

vi.mock("@/lib/services/market/market-price-service", () => ({
  TROY_OUNCE_TO_GRAM: 31.1034768,
  buildManualMutualFundSymbol: vi.fn((raw: string) => `MANUAL_${raw}`),
  getMarketQuoteBySymbol: vi.fn(async () => {
    throw new Error("not used");
  }),
  getMutualFundQuoteBySelection: vi.fn(async () => {
    throw new Error("not used");
  })
}));

vi.mock("@/lib/services/onboarding/onboarding-calculation-service", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/services/onboarding/onboarding-calculation-service")>(
      "@/lib/services/onboarding/onboarding-calculation-service"
    );

  return {
    ...actual,
    buildInitialFinancialProfile: hoisted.buildInitialFinancialProfile,
    createOnboardingAsset: vi.fn(async () => null),
    createOrUpdateFinancialGoal: hoisted.createOrUpdateFinancialGoal,
    generateOnboardingAnalysis: vi.fn(async () => "analysis"),
    replaceExpensePlan: hoisted.replaceExpensePlan,
    setMonthlyExpenseTotal: hoisted.setMonthlyExpenseTotal,
    syncFinancialGoalPriorities: vi.fn(async () => []),
    upsertIncomeProfile: hoisted.upsertIncomeProfile
  };
});

vi.mock("@/lib/services/payments/subscription-service", () => ({
  activateSubscription: vi.fn(async () => ({ status: "ACTIVE" }))
}));

import {
  generateOnboardingAnalysis,
  replaceExpensePlan
} from "@/lib/services/onboarding/onboarding-calculation-service";
import {
  getOnboardingState,
  handleOnboarding
} from "@/lib/services/onboarding/onboarding-service";
import { activateSubscription } from "@/lib/services/payments/subscription-service";

const seedUser = (overrides: Record<string, unknown> = {}) => {
  hoisted.store.users = [
    {
      id: "user_1",
      waNumber: "6281234567890",
      name: "Boss",
      currency: "IDR",
      onboardingStatus: OnboardingStatus.IN_PROGRESS,
      onboardingStep: OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS,
      registrationStatus: RegistrationStatus.PENDING,
      onboardingCompletedAt: null,
      budgetMode: BudgetMode.GUIDED_PLAN,
      employmentType: null,
      incomeStability: null,
      hasPassiveIncome: null,
      salaryDate: null,
      targetFinancialFreedomAge: null,
      goalExecutionMode: null,
      priorityGoalType: null,
      hasAssets: null,
      analysisReady: false,
      createdAt: new Date("2026-04-25T00:00:00.000Z"),
      updatedAt: new Date("2026-04-25T00:00:00.000Z"),
      ...overrides
    }
  ];
  hoisted.store.sessions = [];
  hoisted.store.financialProfiles = [];
  hoisted.store.expensePlans = [];
  hoisted.store.financialGoals = [];
};

const addSession = (data: Record<string, unknown>) => {
  hoisted.store.sessions.push({
    id: `seed_session_${hoisted.store.sessions.length + 1}`,
    userId: "user_1",
    isCompleted: true,
    createdAt: new Date(`2026-04-25T00:00:${String(hoisted.store.sessions.length).padStart(2, "0")}.000Z`),
    updatedAt: new Date(`2026-04-25T00:00:${String(hoisted.store.sessions.length).padStart(2, "0")}.000Z`),
    ...data
  });
};

const sendText = async (text: string, messageId = `msg_${Math.random()}`) =>
  handleOnboarding({
    user: hoisted.store.users[0],
    isNew: false,
    messageId,
    messageType: "TEXT",
    text
  });

describe("onboarding service", () => {
  beforeEach(() => {
    seedUser();
    vi.mocked(replaceExpensePlan).mockClear();
    vi.mocked(activateSubscription).mockClear();
    vi.mocked(generateOnboardingAnalysis).mockResolvedValue("analysis");
  });

  it("finishes quick setup first and goes straight to optional assets", async () => {
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 9200000,
        monthlyExpenseTotal: 2650000,
        potentialMonthlySaving: 6550000,
        emergencyFundTarget: 15900000,
        financialFreedomTarget: 795000000
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [FinancialGoalType.EMERGENCY_FUND],
      rawAnswerJson: "dana darurat"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GUIDED_EXPENSE_FOOD,
      questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_FOOD,
      normalizedAnswerJson: 1200000,
      rawAnswerJson: "1.2jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GUIDED_EXPENSE_TRANSPORT,
      questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_TRANSPORT,
      normalizedAnswerJson: 350000,
      rawAnswerJson: "350rb"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GUIDED_EXPENSE_BILLS,
      questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_BILLS,
      normalizedAnswerJson: 700000,
      rawAnswerJson: "700rb"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GUIDED_EXPENSE_ENTERTAINMENT,
      questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_ENTERTAINMENT,
      normalizedAnswerJson: 400000,
      rawAnswerJson: "400rb"
    });

    const result = await sendText("udah itu aja", "msg_quick_setup_done");

    expect(result.handled).toBe(true);
    expect(result.replyText).not.toContain("Quick setup beres. Ini gambaran awalnya dulu.");
    expect(result.replyText).not.toContain("analysis");
    expect(result.replyText).toContain("Berikut kategori pengeluarannya:");
    expect(result.replyText).toContain("Total pengeluaran: Rp2.650.000/bulan");
    expect(result.replyText).toContain("Sisa dari income: Rp6.550.000/bulan");
    expect(result.replyText).toContain("Sip, gambaran pengeluaran bulanannya sudah kebaca.");
    expect(result.replyText).toContain("Sekarang aset yang sudah Boss punya apa aja?");
    expect(result.replyText).not.toContain("Quick setup-nya sudah beres");
    expect(result.replyText).not.toContain("ditambah di dashboard");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_ASSET_SELECTION);
    expect(replaceExpensePlan).toHaveBeenCalledWith({
      userId: "user_1",
      source: ExpensePlanSource.GUIDED_ONBOARDING_PLAN,
      breakdown: {
        food: 1200000,
        transport: 350000,
        bills: 700000,
        entertainment: 400000,
        others: 0
      }
    });
  });

  it("waits until guided other-expense input is finished before showing the full recap", async () => {
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 9200000,
        monthlyExpenseTotal: 2500000,
        potentialMonthlySaving: 6700000,
        emergencyFundTarget: 15000000,
        financialFreedomTarget: 750000000
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GUIDED_EXPENSE_FOOD,
      questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_FOOD,
      normalizedAnswerJson: 1000000,
      rawAnswerJson: "1jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GUIDED_EXPENSE_TRANSPORT,
      questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_TRANSPORT,
      normalizedAnswerJson: 200000,
      rawAnswerJson: "200rb"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GUIDED_EXPENSE_BILLS,
      questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_BILLS,
      normalizedAnswerJson: 300000,
      rawAnswerJson: "300rb"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GUIDED_EXPENSE_ENTERTAINMENT,
      questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_ENTERTAINMENT,
      normalizedAnswerJson: 500000,
      rawAnswerJson: "500rb"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS,
      questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_OTHERS,
      normalizedAnswerJson: {
        kind: "presence",
        hasOtherExpense: true
      },
      rawAnswerJson: "ada"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS,
      questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_OTHERS,
      normalizedAnswerJson: {
        kind: "category_name",
        label: "jajan istri"
      },
      rawAnswerJson: "jajan istri"
    });

    const result = await sendText("500rb", "msg_other_expense_amount");

    expect(result.handled).toBe(true);
    expect(result.replyText).not.toContain("Berikut kategori pengeluarannya:");
    expect(result.replyText).not.toContain("- Makan & kebutuhan harian: Rp1.000.000/bulan");
    expect(result.replyText).toContain("Masih ada pengeluaran lain lagi");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS);

    const completed = await sendText("udah itu aja", "msg_other_expense_done");

    expect(completed.handled).toBe(true);
    expect(completed.replyText).toContain("Berikut kategori pengeluarannya:");
    expect(completed.replyText).toContain("- Makan & kebutuhan harian: Rp1.000.000/bulan");
    expect(completed.replyText).toContain("- Transport: Rp200.000/bulan");
    expect(completed.replyText).toContain("- Tagihan & kewajiban rutin: Rp300.000/bulan");
    expect(completed.replyText).toContain("- Hiburan & lifestyle: Rp500.000/bulan");
    expect(completed.replyText).toContain("- jajan istri: Rp500.000/bulan");
    expect(completed.replyText).toContain("Total pengeluaran: Rp2.500.000/bulan");
    expect(completed.replyText).toContain("Sisa dari income: Rp6.700.000/bulan");
    expect(completed.replyText).toContain(
      "Sip, gambaran pengeluaran bulanannya sudah kebaca. Sekarang saya cek aset yang sudah jalan ya Boss."
    );
    expect(completed.replyText).toContain("Sekarang aset yang sudah Boss punya apa aja?");
    expect(completed.replyText).not.toContain("Quick setup-nya sudah beres.");
    expect(completed.replyTexts).toEqual([
      [
        "Berikut kategori pengeluarannya:",
        "- Makan & kebutuhan harian: Rp1.000.000/bulan",
        "- Transport: Rp200.000/bulan",
        "- Tagihan & kewajiban rutin: Rp300.000/bulan",
        "- Hiburan & lifestyle: Rp500.000/bulan",
        "- jajan istri: Rp500.000/bulan",
        "",
        "Total pengeluaran: Rp2.500.000/bulan",
        "Sisa dari income: Rp6.700.000/bulan",
        "",
        "Sip, gambaran pengeluaran bulanannya sudah kebaca. Sekarang saya cek aset yang sudah jalan ya Boss."
      ].join("\n"),
      [
        "Sekarang aset yang sudah Boss punya apa aja?",
        "",
        "Kalau ada beberapa, boleh pilih sekaligus. Kalau belum ada, pilih `Belum punya` ya.",
        "",
        "Pilihan:",
        "1. Tabungan",
        "2. Emas",
        "3. Saham",
        "4. Crypto",
        "5. Reksa dana",
        "6. Properti",
        "7. Belum punya"
      ].join("\n")
    ]);
    expect(completed.preserveReplyTextBubbles).toBe(true);
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_ASSET_SELECTION);
  });

  it("routes asset completion straight into the next personalization question when detail is pending", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_ASSET_SELECTION
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 10000000,
        monthlyExpenseTotal: 3500000,
        potentialMonthlySaving: 6500000,
        emergencyFundTarget: 21000000,
        financialFreedomTarget: 1050000000
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [FinancialGoalType.HOUSE, FinancialGoalType.FINANCIAL_FREEDOM],
      rawAnswerJson: "rumah dan financial freedom"
    });

    const result = await sendText("skip", "msg_asset_skip");

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("Untuk target rumah, kira-kira dana yang mau disiapkan berapa Boss?");
    expect(result.replyText).not.toContain("Analisa awalnya sudah kebentuk.");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_GOAL_TARGET_AMOUNT);
  });

  it("migrates users off the removed personalization choice step into the next real question", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_PERSONALIZATION_CHOICE
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 10000000,
        monthlyExpenseTotal: 3500000,
        potentialMonthlySaving: 6500000,
        emergencyFundTarget: 21000000,
        financialFreedomTarget: 1050000000
      }
    ];

    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [FinancialGoalType.HOUSE, FinancialGoalType.VACATION],
      rawAnswerJson: "rumah dan liburan"
    });

    const result = await sendText("nanti dulu", "msg_personalization_migrated");

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("Untuk target rumah, kira-kira dana yang mau disiapkan berapa Boss?");
    expect(result.replyText).not.toContain("Analisa awalnya sudah kebentuk.");
    expect(result.replyText).not.toContain("analysis");
    expect(result.replyText).not.toContain("Nominalnya belum valid.");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_GOAL_TARGET_AMOUNT);
  });

  it("skips stale quick-setup prompts when budget and employment answers are already stored", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_BUDGET_MODE,
      budgetMode: BudgetMode.GUIDED_PLAN
    });

    addSession({
      stepKey: OnboardingStep.ASK_BUDGET_MODE,
      questionKey: OnboardingQuestionKey.BUDGET_MODE,
      normalizedAnswerJson: BudgetMode.GUIDED_PLAN,
      rawAnswerJson: "tolong bantu susun"
    });
    addSession({
      stepKey: OnboardingStep.ASK_EMPLOYMENT_TYPES,
      questionKey: OnboardingQuestionKey.EMPLOYMENT_TYPES,
      normalizedAnswerJson: ["EMPLOYEE"],
      rawAnswerJson: "karyawan"
    });

    const state = await getOnboardingState({ userId: "user_1" });

    expect(state.stepKey).toBe(OnboardingStep.ASK_ACTIVE_INCOME);
    expect(state.prompt?.questionKey).toBe(OnboardingQuestionKey.ACTIVE_INCOME_MONTHLY);
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_ACTIVE_INCOME);
  });

  it("uses an ambiguity fallback when Belum punya is mixed with real asset choices", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_ASSET_SELECTION
    });

    const result = await sendText("1-4 dan 7", "msg_asset_conflict");

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain(
      'Boss, pilihan "Belum punya" nggak bisa digabung dengan aset lain.'
    );
    expect(result.replyText).toContain("Tabungan, Emas, Saham, dan Crypto");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_ASSET_SELECTION);
  });

  it("accepts udah itu aja on asset add-more and closes onboarding cleanly", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_ASSET_ADD_MORE,
      hasAssets: true
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 9200000,
        monthlyExpenseTotal: 2500000,
        potentialMonthlySaving: 6700000,
        emergencyFundTarget: 15000000,
        financialFreedomTarget: 750000000
      }
    ];

    const result = await sendText("udah itu aja", "msg_asset_add_more_done");

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("analysis");
    expect(result.replyText).toContain("pantau cashflow bulanan");
    expect(result.replyText).toContain("fitur otomatis sudah aktif");
    expect(result.replyText).not.toContain("https://pay.test/pay_token");
    expect(activateSubscription).toHaveBeenCalledWith("user_1");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.COMPLETED);
  });

  it("falls back to a safe summary when final analysis generation fails", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_ASSET_ADD_MORE,
      hasAssets: true
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 9200000,
        monthlyExpenseTotal: 2500000,
        potentialMonthlySaving: 6700000,
        emergencyFundTarget: 15000000,
        financialFreedomTarget: 750000000
      }
    ];
    vi.mocked(generateOnboardingAnalysis).mockRejectedValueOnce(new Error("AI down"));

    const result = await sendText("udah itu aja", "msg_asset_add_more_analysis_fail");

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("📊 Ringkasan Keuangan Boss");
    expect(result.replyText).toContain("Income: Rp9.200.000/bulan");
    expect(result.replyText).toContain("Pengeluaran: Rp2.500.000/bulan");
    expect(result.replyText).toContain("Ruang nabung: Rp6.700.000/bulan");
    expect(result.replyText).toContain(
      "Insight detailnya lagi saya rapihin, tapi data onboarding Boss sudah aman tersimpan."
    );
    expect(result.replyText).toContain("fitur otomatis sudah aktif");
    expect(result.replyText).not.toContain("https://pay.test/pay_token");
    expect(activateSubscription).toHaveBeenCalledWith("user_1");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.COMPLETED);
  });

  it("keeps the financial freedom prompt split into separate WhatsApp bubbles", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 9200000,
        monthlyExpenseTotal: 2500000,
        potentialMonthlySaving: 6700000,
        emergencyFundTarget: 22500000,
        financialFreedomTarget: 750000000,
        activeIncomeMonthly: 8700000,
        passiveIncomeMonthly: 500000,
        estimatedMonthlyIncome: null
      }
    ];
    hoisted.store.financialGoals = [
      {
        id: "goal_ef",
        userId: "user_1",
        goalType: FinancialGoalType.EMERGENCY_FUND,
        goalName: "Dana Darurat",
        targetAmount: null,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 1,
        createdAt: new Date("2026-04-25T00:00:00.000Z")
      },
      {
        id: "goal_house",
        userId: "user_1",
        goalType: FinancialGoalType.HOUSE,
        goalName: "Beli Rumah",
        targetAmount: 700000000,
        targetMonth: 6,
        targetYear: 2035,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 2,
        createdAt: new Date("2026-04-25T00:01:00.000Z")
      },
      {
        id: "goal_ff",
        userId: "user_1",
        goalType: FinancialGoalType.FINANCIAL_FREEDOM,
        goalName: "Financial Freedom",
        targetAmount: 750000000,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 3,
        createdAt: new Date("2026-04-25T00:02:00.000Z")
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [
        FinancialGoalType.EMERGENCY_FUND,
        FinancialGoalType.HOUSE,
        FinancialGoalType.FINANCIAL_FREEDOM
      ],
      rawAnswerJson: "dana darurat, rumah, financial freedom"
    });

    const result = await handleOnboarding({
      user: hoisted.store.users[0],
      isNew: false,
      messageId: "msg_ff_prompt_split",
      messageType: "TEXT",
      text: " "
    });

    expect(result.handled).toBe(true);
    expect(result.preserveReplyTextBubbles).toBe(true);
    expect(result.replyTexts).toHaveLength(4);
    expect(result.replyTexts?.[1]).toContain("🗓️ Timeline realistis");
    expect(result.replyTexts?.[2]).toContain("🧾 Skema setelah tercapai");
    expect(result.replyTexts?.[3]).toContain("🎯 Target versi kamu");
  });

  it("keeps custom targets in the final timeline and follows stored priority order metadata", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_ASSET_ADD_MORE,
      hasAssets: true,
      goalExecutionMode: "SEQUENTIAL" as any,
      priorityGoalType: FinancialGoalType.CUSTOM
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 12000000,
        monthlyExpenseTotal: 5000000,
        potentialMonthlySaving: 7000000,
        emergencyFundTarget: 30000000,
        financialFreedomTarget: 150000000
      }
    ];
    hoisted.store.financialGoals = [
      {
        id: "goal_house",
        userId: "user_1",
        goalType: FinancialGoalType.HOUSE,
        goalName: "Beli Rumah",
        targetAmount: 240000000,
        targetMonth: 6,
        targetYear: 2030,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 1,
        createdAt: new Date("2026-04-25T00:01:00.000Z")
      },
      {
        id: "goal_custom",
        userId: "user_1",
        goalType: FinancialGoalType.CUSTOM,
        goalName: "Dana Nikah",
        targetAmount: 48000000,
        targetMonth: 4,
        targetYear: 2028,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 2,
        createdAt: new Date("2026-04-25T00:02:00.000Z")
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [FinancialGoalType.HOUSE, FinancialGoalType.CUSTOM],
      rawAnswerJson: "rumah dan dana nikah"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_CUSTOM_NAME,
      questionKey: OnboardingQuestionKey.GOAL_CUSTOM_NAME,
      normalizedAnswerJson: "Dana Nikah",
      rawAnswerJson: "Dana Nikah"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 240000000,
      rawAnswerJson: "240jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_DATE,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
      normalizedAnswerJson: {
        goalType: FinancialGoalType.HOUSE,
        name: "Beli Rumah",
        amount: 240000000,
        target: {
          label: "Juni 2030",
          month: 6,
          year: 2030,
          monthsFromNow: 50
        },
        desiredDate: {
          label: "Juni 2030",
          month: 6,
          year: 2030,
          monthsFromNow: 50
        },
        realisticDate: {
          label: "Juni 2030",
          month: 6,
          year: 2030,
          monthsFromNow: 50
        },
        realisticStartDate: {
          label: "Mei 2026",
          month: 5,
          year: 2026,
          monthsFromNow: 1
        },
        realisticEndDate: {
          label: "Juni 2030",
          month: 6,
          year: 2030,
          monthsFromNow: 50
        },
        requiredMonthlyForDesiredDate: 4800000,
        allocatedMonthly: 7000000,
        gapMonthly: 0,
        status: "feasible",
        userDecision: "original"
      },
      rawAnswerJson: "06/2030"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 48000000,
      rawAnswerJson: "48jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_DATE,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
      normalizedAnswerJson: {
        goalType: FinancialGoalType.CUSTOM,
        name: "Dana Nikah",
        amount: 48000000,
        target: {
          label: "April 2028",
          month: 4,
          year: 2028,
          monthsFromNow: 24
        },
        desiredDate: {
          label: "April 2028",
          month: 4,
          year: 2028,
          monthsFromNow: 24
        },
        realisticDate: {
          label: "April 2028",
          month: 4,
          year: 2028,
          monthsFromNow: 24
        },
        realisticStartDate: {
          label: "Mei 2026",
          month: 5,
          year: 2026,
          monthsFromNow: 1
        },
        realisticEndDate: {
          label: "April 2028",
          month: 4,
          year: 2028,
          monthsFromNow: 24
        },
        requiredMonthlyForDesiredDate: 2000000,
        allocatedMonthly: 7000000,
        gapMonthly: 0,
        status: "feasible",
        userDecision: "original"
      },
      rawAnswerJson: "04/2028"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_PRIORITY_FOCUS,
      normalizedAnswerJson: {
        priorityOrder: [
          {
            goalType: FinancialGoalType.CUSTOM,
            goalName: "Dana Nikah",
            targetMonth: 4,
            targetYear: 2028,
            monthsFromNow: 24
          },
          {
            goalType: FinancialGoalType.HOUSE,
            goalName: "Beli Rumah",
            targetMonth: 6,
            targetYear: 2030,
            monthsFromNow: 50
          }
        ],
        executionMode: "SEQUENTIAL",
        priorityGoalType: FinancialGoalType.CUSTOM
      },
      rawAnswerJson: "AUTO_PRIORITY_ORDER"
    });

    const result = await sendText("udah itu aja", "msg_finalize_custom_timeline");
    const combinedReply = result.replyTexts?.join("\n\n") ?? result.replyText;

    expect(result.handled).toBe(true);
    expect(combinedReply).toContain("Timeline Keuangan Boss");
    expect(combinedReply).toContain("Dana Nikah");
    expect(combinedReply).toContain("Beli Rumah");
    expect((combinedReply.indexOf("Dana Nikah") ?? -1)).toBeLessThan(
      combinedReply.indexOf("Beli Rumah") ?? Number.MAX_SAFE_INTEGER
    );
  });

  it("processes rapid target messages in order without replaying the old question", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_TARGET_AMOUNT
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 12000000,
        monthlyExpenseTotal: 5000000,
        potentialMonthlySaving: 7000000,
        emergencyFundTarget: 30000000,
        financialFreedomTarget: 150000000
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [FinancialGoalType.HOUSE],
      rawAnswerJson: "rumah"
    });

    const amountResult = await sendText("700jt", "msg_rapid_goal_amount");
    const dateResult = await sendText("06/2030", "msg_rapid_goal_date");

    expect(amountResult.handled).toBe(true);
    expect(amountResult.replyText).toContain("maunya tercapai kapan Boss");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_GOAL_TARGET_DATE);
    expect(dateResult.handled).toBe(true);
    expect(dateResult.replyText).toContain(
      "Saya catat target Beli Rumah sebesar Rp700.000.000, target Juni 2030."
    );
    expect(dateResult.replyText).not.toContain("kira-kira dana yang mau disiapkan berapa Boss?");
  });
});
