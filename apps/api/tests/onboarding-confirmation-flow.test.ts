import {
  BudgetMode,
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
    financialFreedomProfiles: [] as any[],
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
          const questionMatches = where?.questionKey
            ? session.questionKey === where.questionKey
            : true;
          const completedMatches =
            where?.isCompleted === undefined
              ? true
              : session.isCompleted === where.isCompleted;
          if (!idMatches || !questionMatches || !completedMatches) continue;
          Object.assign(session, data);
          count += 1;
        }
        return { count };
      },
      deleteMany: async ({ where }: any) => {
        const before = store.sessions.length;
        store.sessions = store.sessions.filter((session) => {
          const idMatches = where?.id ? session.id === where.id : true;
          const questionMatches = where?.questionKey
            ? session.questionKey === where.questionKey
            : true;
          const completedMatches =
            where?.isCompleted === undefined
              ? true
              : session.isCompleted === where.isCompleted;
          return !(idMatches && questionMatches && completedMatches);
        });
        return { count: before - store.sessions.length };
      }
    },
    financialProfile: {
      findUnique: async ({ where }: any) =>
        store.financialProfiles.find((profile) => profile.userId === where.userId) ?? null
    },
    financialFreedomProfile: {
      upsert: async ({ where, update, create }: any) => {
        const existing = store.financialFreedomProfiles.find(
          (profile) => profile.userId === where.userId
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const created = { ...create };
        store.financialFreedomProfiles.push(created);
        return created;
      }
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

vi.mock("@/lib/services/ai/ai-service", () => ({
  generateAIFinancialFreedomOnboardingAnalysis: vi.fn(async () => null),
  canonicalizeOnboardingAnswer: vi.fn(async () => null)
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

import { createOrUpdateFinancialGoal } from "@/lib/services/onboarding/onboarding-calculation-service";
import { handleOnboarding } from "@/lib/services/onboarding/onboarding-service";
import { activateSubscription } from "@/lib/services/payments/subscription-service";

const seedUser = (overrides: Record<string, unknown> = {}) => {
  hoisted.store.users = [
    {
      id: "user_1",
      waNumber: "6281234567890",
      name: "Boss",
      currency: "IDR",
      onboardingStatus: OnboardingStatus.IN_PROGRESS,
      onboardingStep: OnboardingStep.ASK_GOAL_SELECTION,
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
  hoisted.store.financialFreedomProfiles = [];
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

describe("onboarding confirmation flow", () => {
  beforeEach(() => {
    seedUser();
    vi.mocked(createOrUpdateFinancialGoal).mockClear();
    vi.mocked(activateSubscription).mockClear();
  });

  it("does not ask benar-salah confirmation for regular goal selection anymore", async () => {
    const result = await sendText("1 dan 5", "msg_goal_selection");

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("Biar langkahnya rapi");
    expect(result.replyText).toContain("Biar saya bisa bantu lebih pas");
    expect(result.replyText).not.toContain("balas `benar`");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_BUDGET_MODE);
    expect(
      hoisted.store.sessions.filter(
        (session) => session.questionKey === OnboardingQuestionKey.GOAL_SELECTION
      )
    ).toHaveLength(1);
    expect(hoisted.store.sessions[0]).toMatchObject({
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      isCompleted: true,
      normalizedAnswerJson: [
        FinancialGoalType.EMERGENCY_FUND,
        FinancialGoalType.FINANCIAL_FREEDOM
      ]
    });
    expect(
      hoisted.store.sessions.some(
        (session) => session.questionKey === OnboardingQuestionKey.GOAL_PRIORITY_FOCUS
      )
    ).toBe(true);
  });

  it("confirms a dated target only once after amount and month-year are both collected", async () => {
    seedUser({
      waNumber: "08123",
      onboardingStep: OnboardingStep.ASK_GOAL_TARGET_AMOUNT
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: null,
        monthlyExpenseTotal: 5000000,
        potentialMonthlySaving: null,
        emergencyFundTarget: 30000000,
        financialFreedomTarget: 150000000,
        activeIncomeMonthly: 12000000,
        passiveIncomeMonthly: null,
        estimatedMonthlyIncome: null
      }
    ];
    hoisted.store.financialGoals = [
      {
        id: "goal_house",
        userId: "user_1",
        goalType: FinancialGoalType.HOUSE,
        goalName: "Beli Rumah",
        targetAmount: null,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 0,
        createdAt: new Date("2026-04-25T00:01:00.000Z")
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [FinancialGoalType.HOUSE],
      rawAnswerJson: "rumah"
    });

    const amountResult = await sendText("700jt", "msg_target_amount");

    expect(amountResult.handled).toBe(true);
    expect(amountResult.replyText).toContain("maunya tercapai kapan Boss");
    expect(amountResult.replyText).not.toContain("balas `benar`");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_GOAL_TARGET_DATE);
    expect(createOrUpdateFinancialGoal).not.toHaveBeenCalled();

    const dateResult = await sendText("06/2030", "msg_target_date");

    expect(dateResult.handled).toBe(true);
    expect(dateResult.replyText).toContain(
      "Saya catat target Beli Rumah sebesar Rp700.000.000, target Juni 2030."
    );
    expect(dateResult.replyText).toContain("Target ini cukup agresif.");
    expect(dateResult.replyText).toContain("Ruang tabung sekarang sekitar Rp7.000.000/bulan");
    expect(dateResult.replyTexts?.[0]).not.toContain("Kalau Boss tetap mau kejar Juni 2030");
    expect(dateResult.replyTexts?.[1]).toContain("🎯 Timeline Keuangan Boss:");
    expect(dateResult.replyTexts?.[1]).toContain("🟡 Lagi dicek: Beli Rumah");
    expect(dateResult.replyTexts?.[1]).toContain("Gap tambahan: Rp7.285.715/bulan");
    /*
    expect(dateResult.replyTexts?.[1]).toContain("🎯 Timeline Keuangan Boss:");
    expect(dateResult.replyTexts?.[1]).toContain("Beli Rumah");
    expect(dateResult.replyTexts?.[1]).toContain("Juni 2030");
    expect(dateResult.replyTexts?.[1]).toContain("Gap: Rp7.000.000/bulan");
    */
    expect(dateResult.replyTexts?.[2]).toContain("Kalau Boss tetap mau pegang target Juni 2030");
    expect(dateResult.replyTexts?.[2]).toContain("Kalau ada bulan dan tahun lain yang lebih cocok");
    expect(dateResult.replyText).toContain("Timeline Keuangan Boss");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_GOAL_TARGET_DATE);
    expect(createOrUpdateFinancialGoal).not.toHaveBeenCalled();

    const confirmResult = await sendText("pakai target itu", "msg_target_confirm");

    expect(confirmResult.handled).toBe(true);
    expect(confirmResult.replyText).toContain("Oke, saya lanjut dari sini.");
    /*
    expect(confirmResult.replyTexts?.[1]).toContain("🎯 Timeline Keuangan Boss:");
    */
    expect(confirmResult.replyText).not.toContain("Timeline Keuangan Boss");
    expect(confirmResult.replyText).toContain("Kirim nomor WhatsApp aktif");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.VERIFY_PHONE);
    expect(createOrUpdateFinancialGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        goalType: FinancialGoalType.HOUSE,
        targetAmount: 700000000,
        targetMonth: 6,
        targetYear: 2030
      })
    );
  });

  it("rejects month-year input when the current goal step expects a target amount", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_TARGET_AMOUNT
    });
    hoisted.store.financialGoals = [
      {
        id: "goal_custom",
        userId: "user_1",
        goalType: FinancialGoalType.CUSTOM,
        goalName: "Dana Nikah",
        targetAmount: null,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 0,
        createdAt: new Date("2026-04-25T00:01:00.000Z")
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [FinancialGoalType.CUSTOM],
      rawAnswerJson: "custom"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_CUSTOM_NAME,
      questionKey: OnboardingQuestionKey.GOAL_CUSTOM_NAME,
      normalizedAnswerJson: "Dana Nikah",
      rawAnswerJson: "Dana Nikah"
    });

    const result = await sendText("Maret 2027", "msg_custom_goal_amount_as_date");

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("Itu kebaca sebagai target waktu");
    expect(result.replyText).toContain("kirim nominal dana dulu");
    expect(result.replyText).toContain("Untuk target ini, butuh dana berapa Boss?");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_GOAL_TARGET_AMOUNT);
    expect(
      hoisted.store.sessions.some(
        (session) =>
          session.questionKey === OnboardingQuestionKey.GOAL_TARGET_AMOUNT &&
          session.normalizedAnswerJson === 2027
      )
    ).toBe(false);
  });

  it("accepts natural keep-target replies even when the trailing month-year text is malformed", async () => {
    seedUser({
      waNumber: "08123",
      onboardingStep: OnboardingStep.ASK_GOAL_TARGET_DATE
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 9200000,
        monthlyExpenseTotal: 2500000,
        potentialMonthlySaving: 6700000,
        emergencyFundTarget: 22500000,
        financialFreedomTarget: 750000000
      }
    ];
    hoisted.store.financialGoals = [
      {
        id: "goal_emergency",
        userId: "user_1",
        goalType: FinancialGoalType.EMERGENCY_FUND,
        goalName: "Dana Darurat",
        targetAmount: 22500000,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 0,
        createdAt: new Date("2026-04-25T00:00:00.000Z")
      },
      {
        id: "goal_house",
        userId: "user_1",
        goalType: FinancialGoalType.HOUSE,
        goalName: "Beli Rumah",
        targetAmount: 700000000,
        targetMonth: 5,
        targetYear: 2035,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 1,
        createdAt: new Date("2026-04-25T00:01:00.000Z")
      },
      {
        id: "goal_vehicle",
        userId: "user_1",
        goalType: FinancialGoalType.VEHICLE,
        goalName: "Beli Kendaraan",
        targetAmount: 300000000,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 2,
        createdAt: new Date("2026-04-25T00:02:00.000Z")
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [
        FinancialGoalType.EMERGENCY_FUND,
        FinancialGoalType.HOUSE,
        FinancialGoalType.VEHICLE
      ],
      rawAnswerJson: "dana darurat, rumah, kendaraan"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 700000000,
      rawAnswerJson: "700jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_DATE,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
      normalizedAnswerJson: {
        label: "Mei 2035",
        month: 5,
        year: 2035,
        monthsFromNow: 109
      },
      rawAnswerJson: "05/2035"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 300000000,
      rawAnswerJson: "300jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_DATE,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
      normalizedAnswerJson: {
        label: "Juni 2032",
        month: 6,
        year: 2032,
        monthsFromNow: 74
      },
      rawAnswerJson: "06/2032",
      isCompleted: false
    });

    const result = await sendText("tetep juni 20232", "msg_keep_requested_deadline");

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("Oke, saya lanjut dari sini.");
    /*
    expect(result.replyText).toContain("Timeline Keuangan Boss");
    */
    expect(result.replyText).not.toContain("Timeline Keuangan Boss");
    expect(result.replyText).toContain("Kirim nomor WhatsApp aktif");
    expect(result.replyText).not.toContain("mana yang mau kamu utamakan dulu Boss");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.VERIFY_PHONE);
    expect(createOrUpdateFinancialGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        goalType: FinancialGoalType.VEHICLE,
        targetAmount: 300000000,
        targetMonth: 6,
        targetYear: 2032
      })
    );
  });

  it("derives surplus from income components and keeps formula-based emergency fund in timeline", async () => {
    seedUser({
      waNumber: "08123",
      onboardingStep: OnboardingStep.ASK_GOAL_TARGET_AMOUNT
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: null,
        monthlyExpenseTotal: 2500000,
        potentialMonthlySaving: null,
        emergencyFundTarget: 22500000,
        financialFreedomTarget: 750000000,
        activeIncomeMonthly: 8700000,
        passiveIncomeMonthly: 5000000,
        estimatedMonthlyIncome: null
      }
    ];
    hoisted.store.financialGoals = [
      {
        id: "goal_emergency",
        userId: "user_1",
        goalType: FinancialGoalType.EMERGENCY_FUND,
        goalName: "Dana Darurat",
        targetAmount: null,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 0,
        createdAt: new Date("2026-04-25T00:00:00.000Z")
      },
      {
        id: "goal_house",
        userId: "user_1",
        goalType: FinancialGoalType.HOUSE,
        goalName: "Beli Rumah",
        targetAmount: null,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 1,
        createdAt: new Date("2026-04-25T00:01:00.000Z")
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [FinancialGoalType.EMERGENCY_FUND, FinancialGoalType.HOUSE],
      rawAnswerJson: "dana darurat dan rumah"
    });

    const amountResult = await sendText("700jt", "msg_target_amount_derived");

    expect(amountResult.handled).toBe(true);
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_GOAL_TARGET_DATE);

    const dateResult = await sendText("06/2030", "msg_target_date_derived");

    expect(dateResult.handled).toBe(true);
    expect(dateResult.replyText).toContain("Ruang tabung sekarang sekitar Rp0/bulan");
    expect(dateResult.replyTexts?.[1]).toContain("🎯 Timeline Keuangan Boss:");
    expect(dateResult.replyTexts?.[1]).toContain("✅ Dana Darurat |");
    expect(dateResult.replyTexts?.[1]).toContain("🟡 Lagi dicek: Beli Rumah");
    expect(dateResult.replyTexts?.[1]).toContain("Periode paralel: Juni 2026 - Agustus 2026");
    expect(dateResult.replyTexts?.[1]).toContain(
      "Kalau target tetap Juni 2030: total setoran paralel Rp25.485.715/bulan"
    );
    expect(dateResult.replyTexts?.[1]).toContain("Gap tambahan: Rp14.285.715/bulan");
    /*
    expect(dateResult.replyTexts?.[1]).toContain("Dana Darurat");
    expect(dateResult.replyTexts?.[1]).toContain("Beli Rumah");
    expect(dateResult.replyTexts?.[1]).toContain("Gap:");
    */
    expect(dateResult.replyText).toContain("Karena target sebelumnya masih Dana Darurat");
    expect(dateResult.replyText).toContain("Beli Rumah");
    expect(dateResult.replyText).toContain("Versi realistisnya sekitar");
    expect(dateResult.replyText).toContain("Timeline Keuangan Boss");
  });

  it("rewinds a target section back to nominal when the section confirmation is rejected", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_TARGET_DATE
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [FinancialGoalType.HOUSE],
      rawAnswerJson: "rumah"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 700000000,
      rawAnswerJson: "700jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_DATE,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
      normalizedAnswerJson: {
        label: "Juni 2030",
        month: 6,
        year: 2030,
        monthsFromNow: 50
      },
      rawAnswerJson: "06/2030",
      isCompleted: false
    });

    const result = await sendText("salah", "msg_target_wrong");

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("Oke, saya ulang dari nominal targetnya dulu ya.");
    expect(result.replyText).toContain(
      "Untuk target rumah, kira-kira dana yang mau disiapkan berapa Boss?"
    );
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_GOAL_TARGET_AMOUNT);
    expect(
      hoisted.store.sessions.some(
        (session) =>
          session.questionKey === OnboardingQuestionKey.GOAL_TARGET_AMOUNT &&
          session.isCompleted === true
      )
    ).toBe(false);
  });

  it("can switch an aggressive target to the AI suggested month-year directly", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_TARGET_DATE
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
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 700000000,
      rawAnswerJson: "700jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_DATE,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
      normalizedAnswerJson: {
        label: "Juni 2030",
        month: 6,
        year: 2030,
        monthsFromNow: 50
      },
      rawAnswerJson: "06/2030",
      isCompleted: false
    });

    const result = await sendText("yauda realisitis aja", "msg_target_use_ai");

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("Oke, saya pakai saran");
    expect(result.replyText).toContain("analysis");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.COMPLETED);
    expect(createOrUpdateFinancialGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        goalType: FinancialGoalType.HOUSE,
        targetAmount: 700000000
      })
    );
    const lastCall = vi.mocked(createOrUpdateFinancialGoal).mock.calls.at(-1)?.[0] as any;
    expect(lastCall.targetYear > 2030 || (lastCall.targetYear === 2030 && lastCall.targetMonth > 6)).toBe(true);
  });

  it("accepts short suggestion wording while a target recommendation is pending", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_TARGET_DATE
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
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 700000000,
      rawAnswerJson: "700jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_DATE,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
      normalizedAnswerJson: {
        label: "Juni 2030",
        month: 6,
        year: 2030,
        monthsFromNow: 50
      },
      rawAnswerJson: "06/2030",
      isCompleted: false
    });

    const result = await sendText("pake saran anda aja", "msg_target_use_ai_short_suggestion");

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("Oke, saya pakai saran");
    const lastCall = vi.mocked(createOrUpdateFinancialGoal).mock.calls.at(-1)?.[0] as any;
    expect(lastCall.targetYear > 2030 || (lastCall.targetYear === 2030 && lastCall.targetMonth > 6)).toBe(true);
  });

  it("accepts compact wording to keep the user's original aggressive deadline", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_TARGET_DATE
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
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 700000000,
      rawAnswerJson: "700jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_DATE,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
      normalizedAnswerJson: {
        label: "Juni 2030",
        month: 6,
        year: 2030,
        monthsFromNow: 50
      },
      rawAnswerJson: "06/2030",
      isCompleted: false
    });

    const result = await sendText("ituaja", "msg_target_keep_original_compact");

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("Oke, saya lanjut dari sini");
    expect(createOrUpdateFinancialGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        goalType: FinancialGoalType.HOUSE,
        targetAmount: 700000000,
        targetMonth: 6,
        targetYear: 2030
      })
    );
  });

  it("accepts a custom replacement month-year directly and keeps the gap note if it is still aggressive", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_TARGET_DATE
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
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 700000000,
      rawAnswerJson: "700jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_DATE,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
      normalizedAnswerJson: {
        label: "Juni 2030",
        month: 6,
        year: 2030,
        monthsFromNow: 50
      },
      rawAnswerJson: "06/2030",
      isCompleted: false
    });

    const result = await sendText("06/2032", "msg_target_custom_date");

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("Oke, saya pakai target Beli Rumah di Juni 2032.");
    expect(result.replyText).toContain("Dengan target ini masih ada gap");
    expect(result.replyText).toContain("analysis");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.COMPLETED);
    expect(createOrUpdateFinancialGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        goalType: FinancialGoalType.HOUSE,
        targetAmount: 700000000,
        targetMonth: 6,
        targetYear: 2032
      })
    );
  });

  it("keeps the original desired date and aggressive status when the user sticks with an aggressive target", async () => {
    seedUser({
      waNumber: "08123",
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

    await sendText("700jt", "msg_stored_amount");
    await sendText("06/2030", "msg_stored_date");
    const confirmResult = await sendText("pakai target itu", "msg_stored_confirm");

    expect(confirmResult.handled).toBe(true);
    const storedTargetSession = [...hoisted.store.sessions]
      .reverse()
      .find(
        (session) =>
          session.questionKey === OnboardingQuestionKey.GOAL_TARGET_DATE &&
          session.isCompleted === true
      );

    expect(storedTargetSession?.normalizedAnswerJson).toMatchObject({
      goalType: FinancialGoalType.HOUSE,
      name: "Beli Rumah",
      amount: 700000000,
      desiredDate: {
        month: 6,
        year: 2030,
        label: "Juni 2030"
      },
      status: "aggressive",
      userDecision: "original"
    });
    expect(storedTargetSession?.normalizedAnswerJson).toHaveProperty("realisticEndDate");
    expect(storedTargetSession?.normalizedAnswerJson).toHaveProperty(
      "requiredMonthlyForDesiredDate"
    );
  });

  it("includes earlier targets when evaluating the next target in sequence", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_TARGET_DATE,
      goalExecutionMode: "SEQUENTIAL"
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 14000000,
        monthlyExpenseTotal: 4000000,
        potentialMonthlySaving: 10000000,
        emergencyFundTarget: 24000000,
        financialFreedomTarget: 120000000
      }
    ];
    hoisted.store.financialGoals = [
      {
        id: "goal_house",
        userId: "user_1",
        goalType: FinancialGoalType.HOUSE,
        goalName: "Beli Rumah",
        targetAmount: 300000000,
        targetMonth: 6,
        targetYear: 2028,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 0,
        createdAt: new Date("2026-04-25T00:00:00.000Z")
      },
      {
        id: "goal_vehicle",
        userId: "user_1",
        goalType: FinancialGoalType.VEHICLE,
        goalName: "Beli Kendaraan",
        targetAmount: null,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 1,
        createdAt: new Date("2026-04-25T00:01:00.000Z")
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [FinancialGoalType.HOUSE, FinancialGoalType.VEHICLE],
      rawAnswerJson: "rumah dan kendaraan"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 300000000,
      rawAnswerJson: "300jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_DATE,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
      normalizedAnswerJson: {
        label: "Juni 2028",
        month: 6,
        year: 2028,
        monthsFromNow: 26
      },
      rawAnswerJson: "06/2028"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 240000000,
      rawAnswerJson: "240jt"
    });
    const result = await sendText("06/2030", "msg_vehicle_target_date");

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("Beli Rumah");
    expect(result.replyText).toContain("proyeksi Beli Kendaraan ini saya hitung");
    expect(result.replyText).toContain("Rp4.897.960/bulan");
    expect(result.replyText).not.toContain("Rp240.000.000/bulan");
    expect(result.replyTexts?.[1]).toContain("Juni 2030");
    const vehicleRequiredMonthly = result.replyText.match(/perlu sekitar (Rp[\d.]+)\/bulan/i)?.[1];
    expect(vehicleRequiredMonthly).toBeTruthy();
    expect(result.replyTexts?.[1]).toContain("🎯 Timeline Keuangan Boss:");
    expect(result.replyTexts?.[1]).toContain("✅ Beli Rumah |");
    expect(result.replyTexts?.[1]).toContain("🟡 Lagi dicek: Beli Kendaraan");
    expect(result.replyTexts?.[1]).toContain("Periode paralel: Juni 2026 - Juni 2028");
    expect(result.replyTexts?.[1]).toContain(
      "Gap tambahan: Rp4.897.960/bulan (Juni 2026 - Juni 2028)"
    );
    /*
    expect(result.replyTexts?.[1]).toContain(`Nabung sekitar: ${vehicleRequiredMonthly}/bulan`);
    */
    expect(result.replyTexts?.[2]).toContain("Kalau Boss tetap mau pegang target Juni 2030");
    expect(result.replyTexts?.[1]).not.toContain("Target tercapai:");
  });

  it("keeps the user requested deadline in the pending timeline as a parallel preview when sequential timing is impossible", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_TARGET_DATE,
      goalExecutionMode: "SEQUENTIAL"
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 9200000,
        monthlyExpenseTotal: 2500000,
        potentialMonthlySaving: 6700000,
        emergencyFundTarget: 22500000,
        financialFreedomTarget: 750000000
      }
    ];
    hoisted.store.financialGoals = [
      {
        id: "goal_emergency",
        userId: "user_1",
        goalType: FinancialGoalType.EMERGENCY_FUND,
        goalName: "Dana Darurat",
        targetAmount: 22500000,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 0,
        createdAt: new Date("2026-04-25T00:00:00.000Z")
      },
      {
        id: "goal_house",
        userId: "user_1",
        goalType: FinancialGoalType.HOUSE,
        goalName: "Beli Rumah",
        targetAmount: 700000000,
        targetMonth: 5,
        targetYear: 2035,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 1,
        createdAt: new Date("2026-04-25T00:01:00.000Z")
      },
      {
        id: "goal_vehicle",
        userId: "user_1",
        goalType: FinancialGoalType.VEHICLE,
        goalName: "Beli Kendaraan",
        targetAmount: null,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 2,
        createdAt: new Date("2026-04-25T00:02:00.000Z")
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [
        FinancialGoalType.EMERGENCY_FUND,
        FinancialGoalType.HOUSE,
        FinancialGoalType.VEHICLE
      ],
      rawAnswerJson: "dana darurat, rumah, kendaraan"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 700000000,
      rawAnswerJson: "700jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_DATE,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
      normalizedAnswerJson: {
        label: "Mei 2035",
        month: 5,
        year: 2035,
        monthsFromNow: 109
      },
      rawAnswerJson: "05/2035"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 300000000,
      rawAnswerJson: "300jt"
    });

    const result = await sendText("06/2032", "msg_vehicle_requested_deadline");

    expect(result.handled).toBe(true);
    /*
    expect(result.replyText).toContain("target Juni 2032 belum keburu");
    expect(result.replyTexts?.[1]).toContain("Dana Darurat");
    expect(result.replyTexts?.[1]).toContain("Beli Rumah");
    expect(result.replyTexts?.[1]).toContain("📍 (Paralel)");
    expect(result.replyTexts?.[1]).toContain("Beli Kendaraan");
    expect(result.replyTexts?.[1]).toContain("Juni 2032");
    expect(result.replyTexts?.[1]).not.toContain("Februari 2039");
    expect(result.replyTexts?.[1]).toContain("Total kebutuhan paralel:");
    expect(result.replyTexts?.[1]).not.toContain("Gap:");
    */
    expect(result.replyText).toContain("perlu sekitar Rp4.347.827/bulan");
    expect(result.replyText).toContain("Ruang tabung sekarang sekitar Rp0/bulan");
    expect(result.replyText).toContain("Versi realistisnya sekitar Maret 2039.");
    expect(result.replyText).not.toContain("Rp300.000.000/bulan");
    expect(result.replyTexts?.[1]).toContain("🎯 Timeline Keuangan Boss:");
    expect(result.replyTexts?.[1]).toContain("✅ Dana Darurat |");
    expect(result.replyTexts?.[1]).toContain("✅ Beli Rumah |");
    expect(result.replyTexts?.[1]).toContain("🟡 Lagi dicek: Beli Kendaraan");
    expect(result.replyTexts?.[1]).toContain("Timeline realistis: Juli 2035 - Maret 2039");
    expect(result.replyTexts?.[1]).toContain("Periode paralel: Oktober 2026 - Juni 2032");
    expect(result.replyTexts?.[1]).toContain("Kalau target tetap Juni 2032: total setoran paralel");
    expect(result.replyTexts?.[1]).toContain("Gap tambahan: Rp4.347.827/bulan (Oktober 2026 - Juni 2032)");
    expect(result.replyTexts?.[1]).toContain(
      "Kalau deadline Juni 2032 tetap dipakai, perlu tambah sekitar Rp4.347.827/bulan dari Oktober 2026 sampai Juni 2032."
    );
    expect(result.replyTexts?.[2]).toContain("Kalau Boss tetap mau pegang target Juni 2032");
    expect(result.replyTexts?.[2]).toContain("Kalau mau saya pakai versi yang lebih realistis, saya bisa geser ke Maret 2039.");
    expect(result.replyText).toContain("Timeline Keuangan Boss");
  });

  it("uses a parallel preview instead of a one-month sequential setoran when the requested date is right after the previous target ends", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_TARGET_DATE,
      goalExecutionMode: "SEQUENTIAL"
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 9200000,
        monthlyExpenseTotal: 2500000,
        potentialMonthlySaving: 6700000,
        emergencyFundTarget: 22500000,
        financialFreedomTarget: 750000000
      }
    ];
    hoisted.store.financialGoals = [
      {
        id: "goal_emergency",
        userId: "user_1",
        goalType: FinancialGoalType.EMERGENCY_FUND,
        goalName: "Dana Darurat",
        targetAmount: 22500000,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 0,
        createdAt: new Date("2026-04-25T00:00:00.000Z")
      },
      {
        id: "goal_house",
        userId: "user_1",
        goalType: FinancialGoalType.HOUSE,
        goalName: "Beli Rumah",
        targetAmount: 700000000,
        targetMonth: 5,
        targetYear: 2035,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 1,
        createdAt: new Date("2026-04-25T00:01:00.000Z")
      },
      {
        id: "goal_vehicle",
        userId: "user_1",
        goalType: FinancialGoalType.VEHICLE,
        goalName: "Beli Kendaraan",
        targetAmount: null,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 2,
        createdAt: new Date("2026-04-25T00:02:00.000Z")
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [
        FinancialGoalType.EMERGENCY_FUND,
        FinancialGoalType.HOUSE,
        FinancialGoalType.VEHICLE
      ],
      rawAnswerJson: "dana darurat, rumah, kendaraan"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 700000000,
      rawAnswerJson: "700jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_DATE,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
      normalizedAnswerJson: {
        label: "Mei 2035",
        month: 5,
        year: 2035,
        monthsFromNow: 109
      },
      rawAnswerJson: "05/2035"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 300000000,
      rawAnswerJson: "300jt"
    });

    const result = await sendText("06/2035", "msg_vehicle_target_date_after_house");

    expect(result.handled).toBe(true);
    expect(result.replyText).not.toContain("Rp300.000.000/bulan");
    expect(result.replyText).toContain("perlu sekitar Rp2.857.143/bulan");
    expect(result.replyText).toContain("gap Rp2.857.143/bulan");
    expect(result.replyTexts?.[1]).toContain("Periode paralel: Oktober 2026 - Mei 2035");
    expect(result.replyTexts?.[1]).toContain(
      "Kalau target tetap Juni 2035: total setoran paralel Rp9.557.143/bulan"
    );
    expect(result.replyTexts?.[1]).not.toContain("Timeline: Juni 2035 - Juni 2035");
  });

  it("keeps confirmed parallel targets consistent when evaluating the next target after them", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_TARGET_DATE,
      goalExecutionMode: "SEQUENTIAL"
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 9200000,
        monthlyExpenseTotal: 2500000,
        potentialMonthlySaving: 6700000,
        emergencyFundTarget: 22500000,
        financialFreedomTarget: 750000000
      }
    ];
    hoisted.store.financialGoals = [
      {
        id: "goal_emergency",
        userId: "user_1",
        goalType: FinancialGoalType.EMERGENCY_FUND,
        goalName: "Dana Darurat",
        targetAmount: 22500000,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 0,
        createdAt: new Date("2026-04-25T00:00:00.000Z")
      },
      {
        id: "goal_house",
        userId: "user_1",
        goalType: FinancialGoalType.HOUSE,
        goalName: "Beli Rumah",
        targetAmount: 700000000,
        targetMonth: 5,
        targetYear: 2035,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 1,
        createdAt: new Date("2026-04-25T00:01:00.000Z")
      },
      {
        id: "goal_vehicle",
        userId: "user_1",
        goalType: FinancialGoalType.VEHICLE,
        goalName: "Beli Kendaraan",
        targetAmount: 300000000,
        targetMonth: 6,
        targetYear: 2035,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 2,
        createdAt: new Date("2026-04-25T00:02:00.000Z")
      },
      {
        id: "goal_vacation",
        userId: "user_1",
        goalType: FinancialGoalType.VACATION,
        goalName: "Liburan",
        targetAmount: null,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 3,
        createdAt: new Date("2026-04-25T00:03:00.000Z")
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [
        FinancialGoalType.EMERGENCY_FUND,
        FinancialGoalType.HOUSE,
        FinancialGoalType.VEHICLE,
        FinancialGoalType.VACATION
      ],
      rawAnswerJson: "dana darurat, rumah, kendaraan, liburan"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 700000000,
      rawAnswerJson: "700jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_DATE,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
      normalizedAnswerJson: {
        goalType: FinancialGoalType.HOUSE,
        name: "Beli Rumah",
        amount: 700000000,
        target: {
          label: "Mei 2035",
          month: 5,
          year: 2035,
          monthsFromNow: 109
        },
        desiredDate: {
          label: "Mei 2035",
          month: 5,
          year: 2035,
          monthsFromNow: 109
        },
        realisticDate: {
          label: "Mei 2035",
          month: 5,
          year: 2035,
          monthsFromNow: 109
        },
        realisticStartDate: {
          label: "September 2026",
          month: 9,
          year: 2026,
          monthsFromNow: 5
        },
        realisticEndDate: {
          label: "Mei 2035",
          month: 5,
          year: 2035,
          monthsFromNow: 109
        },
        requiredMonthlyForDesiredDate: 6666667,
        allocatedMonthly: 6700000,
        gapMonthly: 0,
        status: "feasible",
        userDecision: "original"
      },
      rawAnswerJson: "05/2035"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 300000000,
      rawAnswerJson: "300jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_DATE,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
      normalizedAnswerJson: {
        goalType: FinancialGoalType.VEHICLE,
        name: "Beli Kendaraan",
        amount: 300000000,
        target: {
          label: "Juni 2035",
          month: 6,
          year: 2035,
          monthsFromNow: 110
        },
        desiredDate: {
          label: "Juni 2035",
          month: 6,
          year: 2035,
          monthsFromNow: 110
        },
        realisticDate: {
          label: "Februari 2039",
          month: 2,
          year: 2039,
          monthsFromNow: 154
        },
        realisticStartDate: {
          label: "Juni 2035",
          month: 6,
          year: 2035,
          monthsFromNow: 110
        },
        realisticEndDate: {
          label: "Februari 2039",
          month: 2,
          year: 2039,
          monthsFromNow: 154
        },
        requiredMonthlyForDesiredDate: 2830189,
        allocatedMonthly: 33333,
        gapMonthly: 2796856,
        status: "needs_parallel",
        userDecision: "original"
      },
      rawAnswerJson: "06/2035"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 20000000,
      rawAnswerJson: "20jt"
    });

    const result = await sendText("11/2026", "msg_vacation_after_parallel_vehicle");

    expect(result.handled).toBe(true);
    expect(result.replyText).not.toContain("Rp20.000.000/bulan");
    expect(result.replyText).toContain("perlu sekitar Rp10.000.000/bulan");
    expect(result.replyText).toContain("gap Rp12.796.856/bulan");
    expect(result.replyTexts?.[1]).toContain(
      "✅ Beli Kendaraan | Oktober 2026 - Juni 2035 | Rp2.830.189/bulan | gap Rp2.796.856/bulan"
    );
    expect(result.replyTexts?.[1]).toContain("Periode paralel: Oktober 2026 - November 2026");
    expect(result.replyTexts?.[1]).toContain(
      "Kalau target tetap November 2026: total setoran paralel Rp19.496.856/bulan"
    );
    expect(result.replyTexts?.[1]).toContain(
      "Gap tambahan: Rp12.796.856/bulan (Oktober 2026 - November 2026)"
    );
    expect(result.replyTexts?.[1]).not.toContain("Juni 2035 - Februari 2039");
  });

  it("does not show a reversed parallel period when the requested date is before the realistic start", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_TARGET_DATE,
      goalExecutionMode: "SEQUENTIAL"
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 9200000,
        monthlyExpenseTotal: 2500000,
        potentialMonthlySaving: 6700000,
        emergencyFundTarget: 22500000,
        financialFreedomTarget: 750000000
      }
    ];
    hoisted.store.financialGoals = [
      {
        id: "goal_emergency",
        userId: "user_1",
        goalType: FinancialGoalType.EMERGENCY_FUND,
        goalName: "Dana Darurat",
        targetAmount: 22500000,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 0,
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
        priorityOrder: 1,
        createdAt: new Date("2026-04-25T00:01:00.000Z")
      },
      {
        id: "goal_vehicle",
        userId: "user_1",
        goalType: FinancialGoalType.VEHICLE,
        goalName: "Beli Kendaraan",
        targetAmount: 300000000,
        targetMonth: 3,
        targetYear: 2039,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 2,
        createdAt: new Date("2026-04-25T00:02:00.000Z")
      },
      {
        id: "goal_vacation",
        userId: "user_1",
        goalType: FinancialGoalType.VACATION,
        goalName: "Liburan",
        targetAmount: null,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 3,
        createdAt: new Date("2026-04-25T00:03:00.000Z")
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [
        FinancialGoalType.EMERGENCY_FUND,
        FinancialGoalType.HOUSE,
        FinancialGoalType.VEHICLE,
        FinancialGoalType.VACATION
      ],
      rawAnswerJson: "dana darurat, rumah, kendaraan, liburan"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 700000000,
      rawAnswerJson: "700jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_DATE,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
      normalizedAnswerJson: {
        goalType: FinancialGoalType.HOUSE,
        name: "Beli Rumah",
        amount: 700000000,
        target: {
          label: "Juni 2035",
          month: 6,
          year: 2035,
          monthsFromNow: 110
        },
        desiredDate: {
          label: "Juni 2035",
          month: 6,
          year: 2035,
          monthsFromNow: 110
        },
        realisticDate: {
          label: "Juni 2035",
          month: 6,
          year: 2035,
          monthsFromNow: 110
        },
        realisticStartDate: {
          label: "Oktober 2026",
          month: 10,
          year: 2026,
          monthsFromNow: 6
        },
        realisticEndDate: {
          label: "Juni 2035",
          month: 6,
          year: 2035,
          monthsFromNow: 110
        },
        requiredMonthlyForDesiredDate: 6666667,
        allocatedMonthly: 6700000,
        gapMonthly: 0,
        status: "feasible",
        userDecision: "original"
      },
      rawAnswerJson: "06/2035"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 300000000,
      rawAnswerJson: "300jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_DATE,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
      normalizedAnswerJson: {
        goalType: FinancialGoalType.VEHICLE,
        name: "Beli Kendaraan",
        amount: 300000000,
        target: {
          label: "Maret 2039",
          month: 3,
          year: 2039,
          monthsFromNow: 155
        },
        desiredDate: {
          label: "Juni 2037",
          month: 6,
          year: 2037,
          monthsFromNow: 134
        },
        realisticDate: {
          label: "Maret 2039",
          month: 3,
          year: 2039,
          monthsFromNow: 155
        },
        realisticStartDate: {
          label: "Juli 2035",
          month: 7,
          year: 2035,
          monthsFromNow: 111
        },
        realisticEndDate: {
          label: "Maret 2039",
          month: 3,
          year: 2039,
          monthsFromNow: 155
        },
        requiredMonthlyForDesiredDate: 2325582,
        allocatedMonthly: 6700000,
        gapMonthly: 0,
        status: "feasible",
        userDecision: "realistic"
      },
      rawAnswerJson: "realistis aja"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 30000000,
      rawAnswerJson: "30jt"
    });

    const result = await sendText("11/2026", "msg_vacation_before_realistic_vehicle_start");

    expect(result.handled).toBe(true);
    expect(result.replyTexts?.[1]).toContain("Timeline realistis: April 2039 - Agustus 2039");
    expect(result.replyTexts?.[1]).toContain("Periode paralel: Oktober 2026 - November 2026");
    expect(result.replyTexts?.[1]).not.toContain("Periode paralel: Juli 2035 - November 2026");
    expect(result.replyTexts?.[1]).not.toContain("dari Juli 2035 sampai November 2026");
  });

  it("limits the parallel gap period to the overlapping previous target window", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_TARGET_DATE,
      goalExecutionMode: "SEQUENTIAL"
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 9000000,
        monthlyExpenseTotal: 2500000,
        potentialMonthlySaving: 6500000,
        emergencyFundTarget: 26000000,
        financialFreedomTarget: 750000000
      }
    ];
    hoisted.store.financialGoals = [
      {
        id: "goal_emergency",
        userId: "user_1",
        goalType: FinancialGoalType.EMERGENCY_FUND,
        goalName: "Dana Darurat",
        targetAmount: 26000000,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 0,
        createdAt: new Date("2026-04-25T00:00:00.000Z")
      },
      {
        id: "goal_house",
        userId: "user_1",
        goalType: FinancialGoalType.HOUSE,
        goalName: "Beli Rumah",
        targetAmount: null,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 1,
        createdAt: new Date("2026-04-25T00:01:00.000Z")
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [FinancialGoalType.EMERGENCY_FUND, FinancialGoalType.HOUSE],
      rawAnswerJson: "dana darurat, rumah"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 300000000,
      rawAnswerJson: "300jt"
    });

    const result = await sendText("06/2030", "msg_house_deadline_overlaps_emergency_only");

    expect(result.handled).toBe(true);
    expect(result.replyTexts?.[1]).toContain("Periode paralel: Juni 2026 - September 2026");
    expect(result.replyTexts?.[1]).toContain(
      "Gap tambahan: Rp6.122.449/bulan (Juni 2026 - September 2026)"
    );
    expect(result.replyTexts?.[1]).not.toContain("Periode paralel: Juni 2026 - Juni 2030");
    expect(result.replyTexts?.[1]).not.toContain("dari Juni 2026 sampai Juni 2030");
  });

  it("allows an early vacation deadline to run in parallel with emergency fund only", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_TARGET_DATE,
      goalExecutionMode: "SEQUENTIAL"
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 9200000,
        monthlyExpenseTotal: 2500000,
        potentialMonthlySaving: 6700000,
        emergencyFundTarget: 22500000,
        financialFreedomTarget: 750000000
      }
    ];
    hoisted.store.financialGoals = [
      {
        id: "goal_emergency",
        userId: "user_1",
        goalType: FinancialGoalType.EMERGENCY_FUND,
        goalName: "Dana Darurat",
        targetAmount: 22500000,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 0,
        createdAt: new Date("2026-04-25T00:00:00.000Z")
      },
      {
        id: "goal_house",
        userId: "user_1",
        goalType: FinancialGoalType.HOUSE,
        goalName: "Beli Rumah",
        targetAmount: 300000000,
        targetMonth: 6,
        targetYear: 2030,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 1,
        createdAt: new Date("2026-04-25T00:01:00.000Z")
      },
      {
        id: "goal_vehicle",
        userId: "user_1",
        goalType: FinancialGoalType.VEHICLE,
        goalName: "Beli Kendaraan",
        targetAmount: 200000000,
        targetMonth: 12,
        targetYear: 2032,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 2,
        createdAt: new Date("2026-04-25T00:02:00.000Z")
      },
      {
        id: "goal_vacation",
        userId: "user_1",
        goalType: FinancialGoalType.VACATION,
        goalName: "Liburan",
        targetAmount: null,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 3,
        createdAt: new Date("2026-04-25T00:03:00.000Z")
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [
        FinancialGoalType.EMERGENCY_FUND,
        FinancialGoalType.HOUSE,
        FinancialGoalType.VEHICLE,
        FinancialGoalType.VACATION
      ],
      rawAnswerJson: "dana darurat, rumah, kendaraan, liburan"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 300000000,
      rawAnswerJson: "300jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_DATE,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
      normalizedAnswerJson: {
        goalType: FinancialGoalType.HOUSE,
        name: "Beli Rumah",
        amount: 300000000,
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
          label: "Oktober 2026",
          month: 10,
          year: 2026,
          monthsFromNow: 6
        },
        realisticEndDate: {
          label: "Juni 2030",
          month: 6,
          year: 2030,
          monthsFromNow: 50
        },
        requiredMonthlyForDesiredDate: 6666667,
        allocatedMonthly: 6700000,
        gapMonthly: 0,
        status: "feasible",
        userDecision: "original"
      },
      rawAnswerJson: "06/2030"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 200000000,
      rawAnswerJson: "200jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_DATE,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_DATE,
      normalizedAnswerJson: {
        goalType: FinancialGoalType.VEHICLE,
        name: "Beli Kendaraan",
        amount: 200000000,
        target: {
          label: "Desember 2032",
          month: 12,
          year: 2032,
          monthsFromNow: 80
        },
        desiredDate: {
          label: "Juni 2032",
          month: 6,
          year: 2032,
          monthsFromNow: 74
        },
        realisticDate: {
          label: "Desember 2032",
          month: 12,
          year: 2032,
          monthsFromNow: 80
        },
        realisticStartDate: {
          label: "Juli 2030",
          month: 7,
          year: 2030,
          monthsFromNow: 51
        },
        realisticEndDate: {
          label: "Desember 2032",
          month: 12,
          year: 2032,
          monthsFromNow: 80
        },
        requiredMonthlyForDesiredDate: 2898551,
        allocatedMonthly: 6700000,
        gapMonthly: 0,
        status: "feasible",
        userDecision: "realistic"
      },
      rawAnswerJson: "realistis aja"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_TARGET_AMOUNT,
      questionKey: OnboardingQuestionKey.GOAL_TARGET_AMOUNT,
      normalizedAnswerJson: 4000000,
      rawAnswerJson: "4jt"
    });

    const result = await sendText("06/2026", "msg_early_vacation_parallel_with_emergency");

    expect(result.handled).toBe(true);
    expect(result.replyTexts?.[1]).toContain("Periode paralel: Juni 2026 - Juni 2026");
    expect(result.replyTexts?.[1]).toContain(
      "Kalau target tetap Juni 2026: total setoran paralel Rp10.700.000/bulan"
    );
    expect(result.replyTexts?.[1]).toContain(
      "Gap tambahan: Rp4.000.000/bulan (Juni 2026 - Juni 2026)"
    );
  });

  it("shows a short financial freedom preview and lets the user choose the revised plan or the original baseline", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 12000000,
        monthlyExpenseTotal: 5000000,
        potentialMonthlySaving: 7000000,
        emergencyFundTarget: 30000000,
        financialFreedomTarget: 300000000
      }
    ];
    hoisted.store.financialGoals = [
      {
        id: "goal_ff",
        userId: "user_1",
        goalType: FinancialGoalType.FINANCIAL_FREEDOM,
        goalName: "Financial Freedom",
        targetAmount: 300000000,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 1,
        createdAt: new Date("2026-04-25T00:00:00.000Z")
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [FinancialGoalType.FINANCIAL_FREEDOM],
      rawAnswerJson: "financial freedom"
    });

    const result = await sendText("04/2028", "msg_ff_target");

    expect(result.handled).toBe(true);
    expect(result.replyTexts?.[0]).toContain("🧭 Versi yang saya cek");
    expect(result.replyTexts?.[0]).toContain("Target dana FF: Rp1.500.000.000");
    expect(result.replyTexts?.[0]).toContain("Timeline realistis:");
    expect(result.replyTexts?.[0]).toContain("Estimasi sampai tercapai:");
    expect(result.replyTexts?.[0]).toContain("Skema setelah tercapai: sekitar Rp5.000.000/bulan");
    expect(result.replyTexts?.[1]).toContain(
      "Kalau mau pakai versi ini, balas `pakai ini` atau `lanjut`."
    );
    expect(result.replyTexts?.[1]).toContain(
      "Kalau mau balik ke versi awal, balas `pakai yang awal`."
    );
    expect(result.replyTexts?.[1]).toContain("Versi awal saya: Target dana FF");
    expect(hoisted.store.users[0].onboardingStep).toBe(
      OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE
    );
  });

  it("uses the requested monthly passive target inside the short financial freedom preview", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 12000000,
        monthlyExpenseTotal: 5000000,
        potentialMonthlySaving: 7000000,
        emergencyFundTarget: 30000000,
        financialFreedomTarget: 300000000
      }
    ];
    hoisted.store.financialGoals = [
      {
        id: "goal_ff",
        userId: "user_1",
        goalType: FinancialGoalType.FINANCIAL_FREEDOM,
        goalName: "Financial Freedom",
        targetAmount: 300000000,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 1,
        createdAt: new Date("2026-04-25T00:00:00.000Z")
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [FinancialGoalType.FINANCIAL_FREEDOM],
      rawAnswerJson: "financial freedom"
    });

    const result = await sendText("04/2028 target 10jt/bulan", "msg_ff_target_with_monthly");

    expect(result.handled).toBe(true);
    expect(result.replyTexts?.[0]).toContain("Target dana FF: Rp3.000.000.000");
    expect(result.replyTexts?.[0]).toContain(
      "Target hasil pasif yang dipakai: Rp10.000.000/bulan"
    );
    expect(result.replyTexts?.[0]).toContain("Skema setelah tercapai: sekitar Rp10.000.000/bulan");
    expect(result.replyTexts?.[1]).toContain(
      "Kalau mau pakai versi ini, balas `pakai ini` atau `lanjut`."
    );
  });

  it("lets the user fall back to the original financial freedom baseline after previewing a revised plan", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 12000000,
        monthlyExpenseTotal: 5000000,
        potentialMonthlySaving: 7000000,
        emergencyFundTarget: 30000000,
        financialFreedomTarget: 300000000
      }
    ];
    hoisted.store.financialGoals = [
      {
        id: "goal_ff",
        userId: "user_1",
        goalType: FinancialGoalType.FINANCIAL_FREEDOM,
        goalName: "Financial Freedom",
        targetAmount: 300000000,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 1,
        createdAt: new Date("2026-04-25T00:00:00.000Z")
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [FinancialGoalType.FINANCIAL_FREEDOM],
      rawAnswerJson: "financial freedom"
    });

    const pendingResult = await sendText("04/2028 target 10jt/bulan", "msg_ff_pending_custom");

    expect(pendingResult.handled).toBe(true);
    expect(pendingResult.replyTexts?.[1]).toContain("pakai yang awal");

    const confirmResult = await sendText("pakai yang awal", "msg_ff_confirm_original");

    expect(confirmResult.handled).toBe(true);
    expect(confirmResult.replyText).toContain(
      "Oke, saya balik pakai versi awal Financial Freedom."
    );
    expect(confirmResult.replyText).toContain("Target dana FF");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.COMPLETED);
    expect(hoisted.store.financialFreedomProfiles[0]).toMatchObject({
      enabled: true,
      monthlyExpense: 0
    });
  });

  it("treats 'sudah' as confirmation after skipping financial freedom so the prompt does not repeat", async () => {
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
        financialFreedomTarget: 750000000
      }
    ];
    hoisted.store.financialGoals = [
      {
        id: "goal_ff",
        userId: "user_1",
        goalType: FinancialGoalType.FINANCIAL_FREEDOM,
        goalName: "Financial Freedom",
        targetAmount: 750000000,
        targetMonth: null,
        targetYear: null,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 1,
        createdAt: new Date("2026-04-25T00:00:00.000Z")
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [FinancialGoalType.FINANCIAL_FREEDOM],
      rawAnswerJson: "financial freedom"
    });

    const skipResult = await sendText("skip", "msg_ff_skip_pending");

    expect(skipResult.handled).toBe(true);
    expect(skipResult.replyText).toContain(
      "Oke, untuk sekarang target Financial Freedom saya keluarkan dulu dari daftar prioritas."
    );
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_GOAL_FINANCIAL_FREEDOM_AGE);

    const confirmResult = await sendText("sudah", "msg_ff_skip_confirm");

    expect(confirmResult.handled).toBe(true);
    expect(confirmResult.replyText).toContain("analysis");
    expect(confirmResult.replyText).not.toContain("🎯 Target versi kamu");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.COMPLETED);
    expect(hoisted.store.financialGoals.find((goal) => goal.goalType === FinancialGoalType.FINANCIAL_FREEDOM)?.status).toBe(
      FinancialGoalStatus.ARCHIVED
    );
  });

  it("makes financial freedom planning wait for the full earlier goal queue before using the same surplus", async () => {
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
        financialFreedomTarget: 750000000
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
        targetMonth: 5,
        targetYear: 2035,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 2,
        createdAt: new Date("2026-04-25T00:01:00.000Z")
      },
      {
        id: "goal_vehicle",
        userId: "user_1",
        goalType: FinancialGoalType.VEHICLE,
        goalName: "Beli Kendaraan",
        targetAmount: 300000000,
        targetMonth: 6,
        targetYear: 2032,
        status: FinancialGoalStatus.ACTIVE,
        priorityOrder: 3,
        createdAt: new Date("2026-04-25T00:02:00.000Z")
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
        priorityOrder: 4,
        createdAt: new Date("2026-04-25T00:03:00.000Z")
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [
        FinancialGoalType.EMERGENCY_FUND,
        FinancialGoalType.HOUSE,
        FinancialGoalType.VEHICLE,
        FinancialGoalType.FINANCIAL_FREEDOM
      ],
      rawAnswerJson: "dana darurat, rumah, kendaraan, financial freedom"
    });

    const result = await sendText("12/2049", "msg_ff_target_after_queue");

    expect(result.handled).toBe(true);
    expect(result.replyTexts?.[0]).toContain(
      "Target sebelumnya yang masih dihitung: Dana Darurat, Beli Rumah, dan Beli Kendaraan"
    );
    expect(result.replyTexts?.[0]).toContain(
      "Alokasi FF baru kebuka setelah Dana Darurat, Beli Rumah, dan Beli Kendaraan selesai."
    );
    expect(result.replyTexts?.[0]).toContain("Timeline realistis:");
    expect(result.replyTexts?.[1]).toContain(
      "Kalau mau pakai versi ini, balas `pakai ini` atau `lanjut`."
    );
  });
});
