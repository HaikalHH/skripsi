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

vi.mock("@/lib/services/ai/message-normalization", () => ({
  canonicalizeSupportedFinanceMessage: vi.fn(async () => null)
}));

vi.mock("@/lib/services/assistant/memory/conversation-memory", () => ({
  resolveConversationMemory: vi.fn(async () => null)
}));

vi.mock("@/lib/services/market/quote", () => ({
  TROY_OUNCE_TO_GRAM: 31.1034768,
  getMarketQuoteBySymbol: vi.fn(async () => {
    throw new Error("not used");
  })
}));

vi.mock("@/lib/services/onboarding/flow/shared/calculation/onboarding-calculation-service", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/services/onboarding/flow/shared/calculation/onboarding-calculation-service")>(
      "@/lib/services/onboarding/flow/shared/calculation/onboarding-calculation-service"
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

import {
  generateOnboardingAnalysis,
  replaceExpensePlan
} from "@/lib/services/onboarding/flow/shared/calculation/onboarding-calculation-service";
import {
  getOnboardingState,
  handleOnboarding
} from "@/lib/services/onboarding/flow/shared/service/onboarding-service";

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
    expect(result.replyText).toContain("*Oke, kita lanjut ya Boss*");
    expect(result.replyText).toContain("Pengeluaran bulanan Boss sudah kebaca.");
    expect(result.replyText).toContain("*Aset apa aja yang Boss punya saat ini?*");
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

  it("asks for category detail when manual expense answer is only a total", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN,
      budgetMode: BudgetMode.MANUAL_PLAN
    });

    const result = await sendText(
      "pengeluaran saya sekitar 5 juta",
      "msg_manual_total_only"
    );

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("baru kebaca sebagai total pengeluaran");
    expect(result.replyText).toContain("*Belum, bantu susun*");
    expect(hoisted.store.users[0].onboardingStep).toBe(
      OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN
    );
    expect(replaceExpensePlan).not.toHaveBeenCalled();
    expect(hoisted.store.sessions).toHaveLength(0);
  });

  it("routes manual expense help requests into guided expense setup", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN,
      budgetMode: BudgetMode.MANUAL_PLAN
    });

    const result = await sendText(
      "Saya belum punya, tolong bantu susun",
      "msg_manual_help"
    );

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("saya bantu susun satu per satu");
    expect(result.replyText).toContain("makan dan minum");
    expect(hoisted.store.users[0].onboardingStep).toBe(
      OnboardingStep.ASK_GUIDED_EXPENSE_FOOD
    );
    expect(hoisted.store.users[0].budgetMode).toBe(BudgetMode.GUIDED_PLAN);
    expect(replaceExpensePlan).not.toHaveBeenCalled();
  });

  it("confirms manual expense breakdown and allows adding another category before saving", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN,
      budgetMode: BudgetMode.MANUAL_PLAN
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 5000000,
        monthlyExpenseTotal: null,
        potentialMonthlySaving: null,
        emergencyFundTarget: null,
        activeIncomeMonthly: 5000000,
        passiveIncomeMonthly: null,
        estimatedMonthlyIncome: null
      }
    ];

    const first = await sendText(
      "makan 1jt, transport 200rb",
      "msg_manual_breakdown"
    );

    expect(first.handled).toBe(true);
    expect(first.replyText).toContain("*Siap, aku catat dulu*");
    expect(first.replyText).toContain("Ada pengeluaran lain yang mau ditambah");
    expect(first.replyText).toContain("Balas *ada* atau *sudah*");
    expect(first.replyText).not.toContain("Makan: Rp1.000.000");
    expect(hoisted.store.users[0].onboardingStep).toBe(
      OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN
    );
    expect(hoisted.store.sessions.at(-1)?.isCompleted).toBe(false);
    expect(replaceExpensePlan).not.toHaveBeenCalled();

    const additional = await sendText("cicilan motor 500rb", "msg_manual_add_more");

    expect(additional.handled).toBe(true);
    expect(additional.replyText).toContain("*Siap, aku catat dulu*");
    expect(additional.replyText).toContain("Ada pengeluaran lain yang mau ditambah");
    expect(additional.replyText).not.toContain("Total: Rp1.700.000");
    expect(hoisted.store.sessions.at(-1)?.isCompleted).toBe(false);
    expect(replaceExpensePlan).not.toHaveBeenCalled();

    const review = await sendText("sudah", "msg_manual_review");

    expect(review.handled).toBe(true);
    expect(review.replyText).toContain("*Aku sudah rapihin pengeluaran bulanan Boss*");
    expect(review.replyText).toContain("Ini yang aku tangkap");
    expect(review.replyText).toContain("🍽️ *Makan & Minum*: Rp1.000.000");
    expect(review.replyText).toContain("⛽ *Transport*: Rp200.000");
    expect(review.replyText).toContain("📱 *Tagihan*: Rp500.000");
    expect(review.replyText).toContain("*Rp1.700.000/bulan*");
    expect(review.replyText).toContain("balas *lanjut*");
    expect(review.replyText).toContain("balas *ada*");
    expect(hoisted.store.users[0].onboardingStep).toBe(
      OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN
    );
    expect(replaceExpensePlan).not.toHaveBeenCalled();

    const done = await sendText("sudah", "msg_manual_done");

    expect(done.handled).toBe(true);
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_ASSET_SELECTION);
    expect(replaceExpensePlan).toHaveBeenCalledWith({
      userId: "user_1",
      source: ExpensePlanSource.MANUAL_USER_PLAN,
      breakdown: {
        food: 1000000,
        transport: 200000,
        bills: 500000,
        entertainment: 0,
        others: 0
      }
    });
  });

  it("asks one-by-one before merging manual expense categories that look related", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN,
      budgetMode: BudgetMode.MANUAL_PLAN
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 5000000,
        monthlyExpenseTotal: null,
        potentialMonthlySaving: null,
        emergencyFundTarget: null,
        activeIncomeMonthly: 5000000,
        passiveIncomeMonthly: null,
        estimatedMonthlyIncome: null
      }
    ];

    const first = await sendText(
      "listrik 200rb indihome 100rb makan 500rb minum 200rb transport 100rb",
      "msg_manual_merge_candidates"
    );

    expect(first.handled).toBe(true);
    expect(first.replyText).toContain("*Siap, aku catat dulu*");
    expect(first.replyText).not.toContain("Tagihan: Rp300.000");
    expect(first.replyText).not.toContain("Makan: Rp700.000");
    expect(first.replyText).not.toContain("Transport: Rp100.000");
    expect(first.replyText).toContain("Ada pengeluaran lain yang mau ditambah");
    expect(replaceExpensePlan).not.toHaveBeenCalled();

    const billsMergeQuestion = await sendText("sudah", "msg_manual_merge_done");

    expect(billsMergeQuestion.handled).toBe(true);
    expect(billsMergeQuestion.replyText).toContain("*Aku lihat ada beberapa pengeluaran yang mirip, Boss*");
    expect(billsMergeQuestion.replyText).toContain("Sepertinya ini masih satu kategori");
    expect(billsMergeQuestion.replyText).toContain("📱 Tagihan");
    expect(billsMergeQuestion.replyText).toContain("• Listrik: *Rp200.000*");
    expect(billsMergeQuestion.replyText).toContain("• Indihome: *Rp100.000*");
    expect(billsMergeQuestion.replyText).toContain("Total kalau digabung: *Rp300.000*");
    expect(billsMergeQuestion.replyText).toContain("*gabung* untuk digabung");
    expect(billsMergeQuestion.replyText).toContain("*pisah* untuk tetap dipisah");
    expect(hoisted.store.users[0].onboardingStep).toBe(
      OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN
    );
    expect(replaceExpensePlan).not.toHaveBeenCalled();

    const foodMergeQuestion = await sendText("gabung", "msg_manual_merge_bills");

    expect(foodMergeQuestion.handled).toBe(true);
    expect(foodMergeQuestion.replyText).toContain("🍽️ Makan");
    expect(foodMergeQuestion.replyText).toContain("• Makan: *Rp500.000*");
    expect(foodMergeQuestion.replyText).toContain("• Minum: *Rp200.000*");
    expect(foodMergeQuestion.replyText).toContain("Mau aku gabung jadi *Makan & Minum*");
    expect(replaceExpensePlan).not.toHaveBeenCalled();

    const review = await sendText("pisah", "msg_manual_split_food");

    expect(review.handled).toBe(true);
    expect(review.replyText).toContain("*Aku sudah rapihin pengeluaran bulanan Boss*");
    expect(review.replyText).toContain("📱 *Tagihan*: Rp300.000");
    expect(review.replyText).toContain("⛽ *Transport*: Rp100.000");
    expect(review.replyText).toContain("📦 *Makan*: Rp500.000");
    expect(review.replyText).toContain("📦 *Minum*: Rp200.000");
    expect(review.replyText).toContain("*Rp1.100.000/bulan*");
    expect(review.replyText).not.toContain("Sekarang aset yang sudah Boss punya apa aja?");
    expect(hoisted.store.users[0].onboardingStep).toBe(
      OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN
    );
    expect(replaceExpensePlan).not.toHaveBeenCalled();

    const completed = await sendText("sudah", "msg_manual_final_done");

    expect(completed.handled).toBe(true);
    expect(completed.replyText).toContain("*Aset apa aja yang Boss punya saat ini?*");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_ASSET_SELECTION);
    expect(replaceExpensePlan).toHaveBeenCalledWith({
      userId: "user_1",
      source: ExpensePlanSource.MANUAL_USER_PLAN,
      breakdown: {
        food: 0,
        transport: 100000,
        bills: 300000,
        entertainment: 0,
        others: 700000
      },
      customExpenseItems: [
        { label: "makan", amount: 500000 },
        { label: "minum", amount: 200000 }
      ]
    });
  });

  it("blocks manual expense save when expenses exceed income until extra income makes it safe", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN,
      budgetMode: BudgetMode.MANUAL_PLAN
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 1000000,
        monthlyExpenseTotal: null,
        potentialMonthlySaving: null,
        emergencyFundTarget: null,
        activeIncomeMonthly: 1000000,
        passiveIncomeMonthly: null,
        estimatedMonthlyIncome: null
      }
    ];

    await sendText("makan 1500000", "msg_deficit_manual_breakdown");
    const review = await sendText("sudah", "msg_deficit_manual_review");
    expect(review.replyText).toContain("*Rp1.500.000/bulan*");
    expect(replaceExpensePlan).not.toHaveBeenCalled();

    const warning = await sendText("sudah", "msg_deficit_manual_final");
    expect(warning.replyText).toContain("Pengeluaran bulanan Boss lebih besar dari income");
    expect(warning.replyText).toContain("Income saat ini: Rp1.000.000/bulan");
    expect(warning.replyText).toContain("Defisit: Rp500.000/bulan");
    expect(hoisted.store.users[0].onboardingStep).toBe(
      OnboardingStep.ASK_MANUAL_EXPENSE_BREAKDOWN
    );
    expect(replaceExpensePlan).not.toHaveBeenCalled();

    const incomeType = await sendText("ada", "msg_deficit_manual_has_income");
    expect(incomeType.replyText).toContain("Income tambahannya masuk jenis apa");

    const incomeAmount = await sendText("active income", "msg_deficit_manual_active_type");
    expect(incomeAmount.replyText).toContain("Nominal active income tambahannya");

    const safeConfirm = await sendText("1jt", "msg_deficit_manual_active_amount");
    expect(safeConfirm.replyText).toContain("Budget sudah aman untuk disimpan");
    expect(safeConfirm.replyText).toContain("Income: Rp2.000.000/bulan");
    expect(replaceExpensePlan).not.toHaveBeenCalled();

    const completed = await sendText("simpan", "msg_deficit_manual_save");
    expect(completed.replyText).toContain("*Aset apa aja yang Boss punya saat ini?*");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_ASSET_SELECTION);
    expect(hoisted.upsertIncomeProfile).toHaveBeenLastCalledWith({
      userId: "user_1",
      activeIncomeMonthly: 2000000,
      passiveIncomeMonthly: 0
    });
    expect(replaceExpensePlan).toHaveBeenCalledWith({
      userId: "user_1",
      source: ExpensePlanSource.MANUAL_USER_PLAN,
      breakdown: {
        food: 1500000,
        transport: 0,
        bills: 0,
        entertainment: 0,
        others: 0
      }
    });
  });

  it("blocks guided expense save and lets the user revise expenses before saving", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GUIDED_EXPENSE_OTHERS,
      budgetMode: BudgetMode.GUIDED_PLAN
    });
    hoisted.store.financialProfiles = [
      {
        userId: "user_1",
        monthlyIncomeTotal: 1000000,
        monthlyExpenseTotal: null,
        potentialMonthlySaving: null,
        emergencyFundTarget: null,
        activeIncomeMonthly: 1000000,
        passiveIncomeMonthly: null,
        estimatedMonthlyIncome: null
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GUIDED_EXPENSE_FOOD,
      questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_FOOD,
      normalizedAnswerJson: 1200000,
      rawAnswerJson: "1.2jt"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GUIDED_EXPENSE_TRANSPORT,
      questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_TRANSPORT,
      normalizedAnswerJson: 100000,
      rawAnswerJson: "100rb"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GUIDED_EXPENSE_BILLS,
      questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_BILLS,
      normalizedAnswerJson: 0,
      rawAnswerJson: "0"
    });
    addSession({
      stepKey: OnboardingStep.ASK_GUIDED_EXPENSE_ENTERTAINMENT,
      questionKey: OnboardingQuestionKey.GUIDED_EXPENSE_ENTERTAINMENT,
      normalizedAnswerJson: 0,
      rawAnswerJson: "0"
    });

    const warning = await sendText("ga ada", "msg_deficit_guided_no_other");
    expect(warning.replyText).toContain("Pengeluaran bulanan Boss lebih besar dari income");
    expect(warning.replyText).toContain("Pengeluaran: Rp1.300.000/bulan");
    expect(replaceExpensePlan).not.toHaveBeenCalled();

    const adjust = await sendText("tidak ada", "msg_deficit_guided_no_income");
    expect(adjust.replyText).toContain("Mau ubah nominal pengeluaran dulu");

    const categories = await sendText("ubah", "msg_deficit_guided_edit");
    expect(categories.replyText).toContain("Kategori pengeluaran mana yang mau diubah");
    expect(categories.replyText).toContain("1. Makan");

    const amountPrompt = await sendText("1", "msg_deficit_guided_choose_food");
    expect(amountPrompt.replyText).toContain("Nominal baru untuk Makan");

    const safeConfirm = await sendText("800rb", "msg_deficit_guided_food_amount");
    expect(safeConfirm.replyText).toContain("Budget sudah aman untuk disimpan");
    expect(safeConfirm.replyText).toContain("Pengeluaran: Rp900.000/bulan");
    expect(replaceExpensePlan).not.toHaveBeenCalled();

    const completed = await sendText("simpan", "msg_deficit_guided_save");
    expect(completed.replyText).toContain("*Aset apa aja yang Boss punya saat ini?*");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_ASSET_SELECTION);
    expect(replaceExpensePlan).toHaveBeenCalledWith({
      userId: "user_1",
      source: ExpensePlanSource.GUIDED_ONBOARDING_PLAN,
      breakdown: {
        food: 800000,
        transport: 100000,
        bills: 0,
        entertainment: 0,
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
    expect(completed.replyText).toContain("*Oke, kita lanjut ya Boss*");
    expect(completed.replyText).toContain("Pengeluaran bulanan Boss sudah kebaca.");
    expect(completed.replyText).toContain("*Aset apa aja yang Boss punya saat ini?*");
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
        "✅ *Oke, kita lanjut ya Boss*",
        "",
        "Pengeluaran bulanan Boss sudah kebaca.",
        "Sekarang aku mau cek aset yang Boss punya, supaya gambaran keuangannya lebih lengkap."
      ].join("\n"),
      [
        "📦 *Aset apa aja yang Boss punya saat ini?*",
        "",
        "Boleh pilih lebih dari satu:",
        "",
        "1. 💰 Tabungan",
        "2. 🪙 Emas",
        "3. 📈 Saham",
        "4. 🏠 Properti",
        "5. ❌ Belum punya"
      ].join("\n")
    ]);
    expect(completed.preserveReplyTextBubbles).toBe(true);
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_ASSET_SELECTION);
    expect(replaceExpensePlan).toHaveBeenLastCalledWith({
      userId: "user_1",
      source: ExpensePlanSource.GUIDED_ONBOARDING_PLAN,
      breakdown: {
        food: 1000000,
        transport: 200000,
        bills: 300000,
        entertainment: 500000,
        others: 500000
      },
      customExpenseItems: [{ label: "jajan istri", amount: 500000 }]
    });
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
      }
    ];
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [FinancialGoalType.HOUSE, FinancialGoalType.VACATION],
      rawAnswerJson: "rumah dan liburan"
    });

    const result = await sendText("skip", "msg_asset_skip");

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("Untuk target rumah, kira-kira dana yang mau disiapkan berapa Boss?");
    expect(result.replyText).not.toContain("Analisa awalnya sudah kebentuk.");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_GOAL_TARGET_AMOUNT);
  });

  it("keeps the gold gram step when the answer uses a wrong quantity unit", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_ASSET_GOLD_GRAMS
    });
    addSession({
      stepKey: OnboardingStep.ASK_ASSET_SELECTION,
      questionKey: OnboardingQuestionKey.ASSET_SELECTION,
      normalizedAnswerJson: ["GOLD"],
      rawAnswerJson: "emas"
    });
    addSession({
      stepKey: OnboardingStep.ASK_ASSET_GOLD_TYPE,
      questionKey: OnboardingQuestionKey.ASSET_GOLD_TYPE,
      normalizedAnswerJson: "BULLION",
      rawAnswerJson: "batangan"
    });

    const result = await sendText("2 lot", "msg_gold_wrong_quantity_unit");

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("Jumlah gram emas belum valid");
    expect(result.replyText).toContain("Berapa gram emas batangannya Boss?");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_ASSET_GOLD_GRAMS);
    expect(
      hoisted.store.sessions.some(
        (session) => session.questionKey === OnboardingQuestionKey.ASSET_GOLD_GRAMS
      )
    ).toBe(false);
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

    expect(state.stepKey).toBe("ASK_ACTIVE_INCOME_COUNT" as OnboardingStep);
    expect(state.prompt?.questionKey).toBe("ACTIVE_INCOME_COUNT" as OnboardingQuestionKey);
    expect(hoisted.store.users[0].onboardingStep).toBe("ASK_ACTIVE_INCOME_COUNT" as OnboardingStep);
  });

  it("collects multiple active incomes with NLP and asks cycle selection when none was confirmed", async () => {
    seedUser({
      onboardingStep: "ASK_ACTIVE_INCOME_COUNT" as OnboardingStep,
      budgetMode: BudgetMode.GUIDED_PLAN
    });

    const frequency = await sendText("gaji utama sama freelance", "msg_income_frequency");
    expect(frequency.handled).toBe(true);
    expect(frequency.replyText).toContain("💰Income aktif ke-1 nominalnya berapa Boss?");
    expect(hoisted.store.sessions.at(-1)?.normalizedAnswerJson).toBe("MULTIPLE");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_ACTIVE_INCOME);

    const firstAmount = await sendText("10jt", "msg_income_first_amount");
    expect(firstAmount.replyText).toContain("Income aktif ke-1 biasanya masuk tanggal berapa");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_SALARY_DATE);

    const firstPayday = await sendText("tanggal 25", "msg_income_first_payday");
    expect(firstPayday.replyText).toContain("Mau pakai tanggal 25 sebagai awal periode bulanan");
    expect(firstPayday.replyText).toContain("dari tanggal 25 ke tanggal 24 bulan berikutnya");
    expect(hoisted.store.users[0].onboardingStep).toBe("ASK_ACTIVE_INCOME_CYCLE_CONFIRM" as OnboardingStep);

    const firstNotCycle = await sendText("engga", "msg_income_first_not_cycle");
    expect(firstNotCycle.replyText).toContain("Masih ada income aktif lain");
    expect(hoisted.store.users[0].salaryDate).toBeNull();
    expect(hoisted.store.users[0].onboardingStep).toBe("ASK_ACTIVE_INCOME_ADD_MORE" as OnboardingStep);

    const addMore = await sendText("masih", "msg_income_add_more");
    expect(addMore.replyText).toContain("💰Income aktif ke-2 nominalnya berapa Boss?");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_ACTIVE_INCOME);

    const secondAmount = await sendText("2jt", "msg_income_second_amount");
    expect(secondAmount.replyText).toContain("Income aktif ke-2 biasanya masuk tanggal berapa");

    const secondPayday = await sendText("tanggal 10", "msg_income_second_payday");
    expect(secondPayday.replyText).toContain("Mau pakai tanggal 10 sebagai awal periode bulanan");
    expect(secondPayday.replyText).toContain("dari tanggal 10 ke tanggal 9 bulan berikutnya");

    const secondNotCycle = await sendText("nggak", "msg_income_second_not_cycle");
    expect(secondNotCycle.replyText).toContain("Masih ada income aktif lain");
    expect(hoisted.store.users[0].salaryDate).toBeNull();

    const doneWithoutCycle = await sendText("udah itu aja", "msg_income_done_without_cycle");
    expect(doneWithoutCycle.replyText).toContain("mana yang mau dijadikan awal periode report bulanan");
    expect(doneWithoutCycle.replyText).toContain("Income aktif ke-1, tanggal 25");
    expect(doneWithoutCycle.replyText).toContain("Income aktif ke-2, tanggal 10");
    expect(hoisted.store.users[0].onboardingStep).toBe("ASK_ACTIVE_INCOME_CYCLE_SELECT" as OnboardingStep);

    const selectedCycle = await sendText("income kedua aja", "msg_income_select_cycle");
    expect(selectedCycle.replyText).toContain("💰Selain itu ada income pasif juga Boss?");
    expect(hoisted.store.users[0].salaryDate).toBe(10);
    expect(hoisted.store.financialProfiles[0]?.activeIncomeMonthly).toBe(12000000);
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_HAS_PASSIVE_INCOME);
  });

  it("ignores exclusive asset none choice when concrete assets are also selected", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_ASSET_SELECTION
    });

    const result = await sendText("1-4 dan 5", "msg_asset_conflict");

    expect(result.handled).toBe(true);
    expect(result.replyText).not.toContain('pilihan "Belum punya" nggak bisa digabung');
    expect(hoisted.store.sessions.at(-1)?.normalizedAnswerJson).toEqual([
      "SAVINGS",
      "GOLD",
      "STOCK",
      "PROPERTY"
    ]);
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_ASSET_SAVINGS_NAME);
  });

  it("ignores Belum ada target when real target choices are selected together", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_SELECTION
    });

    const result = await sendText("1-5 dan 6", "msg_goal_conflict");
    const goalSelectionSession = hoisted.store.sessions.find(
      (session) => session.questionKey === OnboardingQuestionKey.GOAL_SELECTION
    );

    expect(result.handled).toBe(true);
    expect(result.replyText).not.toContain('pilihan "Belum ada target" nggak bisa digabung');
    expect(goalSelectionSession?.normalizedAnswerJson).toEqual([
      FinancialGoalType.EMERGENCY_FUND,
      FinancialGoalType.HOUSE,
      FinancialGoalType.VEHICLE,
      FinancialGoalType.VACATION,
      FinancialGoalType.CUSTOM
    ]);
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_BUDGET_MODE);
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
      }
    ];

    const result = await sendText("udah itu aja", "msg_asset_add_more_done");

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("analysis");
    expect(result.replyText).toContain("Boss bisa pakai Finance AI");
    expect(result.replyText).toContain("Catat transaksi natural");
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
      }
    ];
    vi.mocked(generateOnboardingAnalysis).mockRejectedValueOnce(new Error("AI down"));

    const result = await sendText("udah itu aja", "msg_asset_add_more_analysis_fail");

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("Onboarding selesai, Boss.");
    expect(result.replyText).toContain("📊 Ringkasan Keuangan Boss");
    expect(result.replyText).toContain("Income: Rp9.200.000/bulan");
    expect(result.replyText).toContain("Pengeluaran: Rp2.500.000/bulan");
    expect(result.replyText).toContain("Ruang nabung: Rp6.700.000/bulan");
    expect(result.replyText).toContain(
      "Bacaan saya: data utama sudah masuk"
    );
    expect(result.replyText).toContain("Boss bisa pakai Finance AI");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.COMPLETED);
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
    const completedTimeline = result.replyTexts?.join("\n\n") ?? result.replyText;

    expect(result.handled).toBe(true);
    expect(completedTimeline).toContain("Timeline Target Boss");
    expect(completedTimeline).toContain("Dana Nikah");
    expect(completedTimeline).toContain("Beli Rumah");
    expect((completedTimeline.indexOf("Dana Nikah") ?? -1)).toBeLessThan(
      completedTimeline.indexOf("Beli Rumah") ?? Number.MAX_SAFE_INTEGER
    );

    const timelineResult = await handleOnboarding({
      user: hoisted.store.users[0],
      isNew: false,
      messageId: "msg_request_completed_timeline",
      messageType: "TEXT",
      text: "lihat timeline"
    });
    const combinedTimeline = timelineResult.replyTexts?.join("\n\n") ?? timelineResult.replyText;

    expect(timelineResult.handled).toBe(true);
    expect(combinedTimeline).toContain("Timeline Target Boss");
    expect(combinedTimeline).toContain("Dana Nikah");
    expect(combinedTimeline).toContain("Beli Rumah");
    expect((combinedTimeline.indexOf("Dana Nikah") ?? -1)).toBeLessThan(
      combinedTimeline.indexOf("Beli Rumah") ?? Number.MAX_SAFE_INTEGER
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
    expect(dateResult.replyTexts?.[0]).toContain("🎯 Target Baru: Beli Rumah");
    expect(dateResult.replyTexts?.[0]).toContain("Target: Rp700.000.000");
    expect(dateResult.replyTexts?.[0]).toContain("Deadline awal: Juni 2030");
    expect(dateResult.replyText).not.toContain("kira-kira dana yang mau disiapkan berapa Boss?");
  });

  it("keeps asking for target amount when the answer is a full date", async () => {
    seedUser({
      onboardingStep: OnboardingStep.ASK_GOAL_TARGET_AMOUNT
    });
    addSession({
      stepKey: OnboardingStep.ASK_GOAL_SELECTION,
      questionKey: OnboardingQuestionKey.GOAL_SELECTION,
      normalizedAnswerJson: [FinancialGoalType.HOUSE],
      rawAnswerJson: "rumah"
    });

    const result = await sendText("16 juni 2036", "msg_goal_amount_full_date_guard");

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("Itu kebaca sebagai target waktu");
    expect(result.replyText).toContain("kirim nominal dana dulu");
    expect(result.replyText).toContain("Untuk target rumah, kira-kira dana yang mau disiapkan berapa Boss?");
    expect(hoisted.store.users[0].onboardingStep).toBe(OnboardingStep.ASK_GOAL_TARGET_AMOUNT);
    expect(
      hoisted.store.sessions.some(
        (session) =>
          session.questionKey === OnboardingQuestionKey.GOAL_TARGET_AMOUNT &&
          session.normalizedAnswerJson === 16
      )
    ).toBe(false);
  });
});
