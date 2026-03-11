import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const store = {
    now: new Date("2026-02-24T12:00:00.000Z"),
    idCounter: 1,
    users: [] as any[],
    subscriptions: [] as any[],
    budgets: [] as any[],
    savingsGoals: [] as any[],
    transactions: [] as any[],
    messageLogs: [] as any[],
    aiLogs: [] as any[],
    outboundMessages: [] as any[],
    semanticCanonicalizations: {} as Record<string, string | null>,
    extractionResult: {
      intent: "RECORD_TRANSACTION",
      type: "EXPENSE",
      amount: 50_000,
      category: "makan",
      merchant: null,
      note: null,
      occurredAt: "2026-02-24T12:00:00.000Z",
      reportPeriod: null,
      adviceQuery: null
    }
  };

  const matchesDateRange = (date: Date, occurredAt: any) => {
    if (!occurredAt) return true;
    if (occurredAt.gte && date < occurredAt.gte) return false;
    if (occurredAt.lte && date > occurredAt.lte) return false;
    return true;
  };

  const filterTransactions = (where: any) =>
    store.transactions.filter((tx) => {
      if (where?.userId && tx.userId !== where.userId) return false;
      if (where?.type && tx.type !== where.type) return false;
      if (where?.category && tx.category !== where.category) return false;
      if (!matchesDateRange(tx.occurredAt, where?.occurredAt)) return false;
      return true;
    });

  const prismaMock: any = {
    user: {
      findUnique: async ({ where }: any) => {
        if (where?.waNumber) {
          return store.users.find((user) => user.waNumber === where.waNumber) ?? null;
        }
        if (where?.id) {
          return store.users.find((user) => user.id === where.id) ?? null;
        }
        return null;
      },
      create: async ({ data }: any) => {
        const user = {
          id: `user_${store.idCounter++}`,
          waNumber: data.waNumber,
          name: data.name ?? null,
          currency: data.currency ?? "IDR",
          monthlyBudget: data.monthlyBudget ?? null,
          registrationStatus: data.registrationStatus ?? "PENDING",
          onboardingStep: data.onboardingStep ?? "WAIT_REGISTER",
          onboardingCompletedAt: data.onboardingCompletedAt ?? null,
          createdAt: new Date(store.now),
          updatedAt: new Date(store.now)
        };
        store.users.push(user);

        if (data.subscriptions?.create) {
          store.subscriptions.push({
            id: `sub_${store.idCounter++}`,
            userId: user.id,
            status: data.subscriptions.create.status,
            createdAt: new Date(store.now),
            updatedAt: new Date(store.now)
          });
        }

        if (data.savingsGoal?.create) {
          store.savingsGoals.push({
            id: `goal_${store.idCounter++}`,
            userId: user.id,
            targetAmount: data.savingsGoal.create.targetAmount ?? 0,
            currentProgress: data.savingsGoal.create.currentProgress ?? 0,
            createdAt: new Date(store.now),
            updatedAt: new Date(store.now)
          });
        }

        return user;
      },
      update: async ({ where, data }: any) => {
        const user = store.users.find((item) => item.id === where.id);
        if (!user) throw new Error("User not found");
        Object.assign(user, data, { updatedAt: new Date(store.now) });
        return user;
      },
      findMany: async ({ where, select }: any) => {
        let users = [...store.users];
        if (where?.id?.in) {
          const idSet = new Set(where.id.in);
          users = users.filter((item) => idSet.has(item.id));
        }

        if (select) {
          return users.map((user) => {
            const row: Record<string, unknown> = {};
            for (const key of Object.keys(select)) {
              if (select[key]) row[key] = user[key];
            }
            return row;
          });
        }

        return users;
      }
    },
    subscription: {
      findFirst: async ({ where, orderBy }: any) => {
        let rows = store.subscriptions.filter((item) => item.userId === where.userId);
        if (orderBy?.createdAt === "desc") {
          rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return rows[0] ?? null;
      },
      findMany: async ({ where, distinct, select }: any) => {
        let rows = [...store.subscriptions];
        if (where?.status?.in) {
          const allowed = new Set(where.status.in);
          rows = rows.filter((item) => allowed.has(item.status));
        }

        if (distinct?.includes("userId")) {
          const seen = new Set<string>();
          rows = rows.filter((item) => {
            if (seen.has(item.userId)) return false;
            seen.add(item.userId);
            return true;
          });
        }

        if (select) {
          return rows.map((row) => {
            const selected: Record<string, unknown> = {};
            for (const key of Object.keys(select)) {
              if (select[key]) selected[key] = row[key];
            }
            return selected;
          });
        }

        return rows;
      },
      update: async ({ where, data }: any) => {
        const row = store.subscriptions.find((item) => item.id === where.id);
        if (!row) throw new Error("Subscription not found");
        Object.assign(row, data, { updatedAt: new Date(store.now) });
        return row;
      },
      create: async ({ data }: any) => {
        const row = {
          id: `sub_${store.idCounter++}`,
          userId: data.userId,
          status: data.status,
          createdAt: new Date(store.now),
          updatedAt: new Date(store.now)
        };
        store.subscriptions.push(row);
        return row;
      }
    },
    messageLog: {
      create: async ({ data }: any) => {
        const row = {
          id: `msg_${store.idCounter++}`,
          ...data
        };
        store.messageLogs.push(row);
        return row;
      },
      findMany: async ({ where, orderBy, take, select }: any) => {
        let rows = [...store.messageLogs];
        if (where?.userId) {
          rows = rows.filter((item) => item.userId === where.userId);
        }
        if (where?.messageType) {
          rows = rows.filter((item) => item.messageType === where.messageType);
        }
        if (where?.sentAt?.gte) {
          rows = rows.filter((item) => item.sentAt >= where.sentAt.gte);
        }
        if (where?.id?.not) {
          rows = rows.filter((item) => item.id !== where.id.not);
        }
        if (orderBy?.sentAt === "desc") {
          rows = rows.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
        }
        if (typeof take === "number") rows = rows.slice(0, take);
        if (!select) return rows;
        return rows.map((row) => {
          const selected: Record<string, unknown> = {};
          for (const key of Object.keys(select)) {
            if (select[key]) selected[key] = row[key];
          }
          return selected;
        });
      }
    },
    aIAnalysisLog: {
      create: async ({ data }: any) => {
        const row = {
          id: `ailog_${store.idCounter++}`,
          ...data
        };
        store.aiLogs.push(row);
        return row;
      }
    },
    budget: {
      findUnique: async ({ where }: any) =>
        store.budgets.find(
          (item) =>
            item.userId === where.userId_category.userId &&
            item.category === where.userId_category.category
        ) ?? null,
      findMany: async ({ where }: any) => {
        if (!where?.userId) return [...store.budgets];
        return store.budgets.filter((item) => item.userId === where.userId);
      },
      upsert: async ({ where, update, create }: any) => {
        const existing = store.budgets.find(
          (item) =>
            item.userId === where.userId_category.userId &&
            item.category === where.userId_category.category
        );

        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date(store.now) });
          return existing;
        }

        const row = {
          id: `budget_${store.idCounter++}`,
          ...create,
          createdAt: new Date(store.now),
          updatedAt: new Date(store.now)
        };
        store.budgets.push(row);
        return row;
      }
    },
    savingsGoal: {
      upsert: async ({ where, update, create }: any) => {
        const existing = store.savingsGoals.find((item) => item.userId === where.userId);
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date(store.now) });
          return existing;
        }

        const row = {
          id: `goal_${store.idCounter++}`,
          ...create,
          createdAt: new Date(store.now),
          updatedAt: new Date(store.now)
        };
        store.savingsGoals.push(row);
        return row;
      }
    },
    transaction: {
      findMany: async ({ where, orderBy }: any) => {
        let rows = filterTransactions(where);
        if (orderBy?.occurredAt === "asc") {
          rows = rows.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
        }
        return rows;
      },
      aggregate: async ({ where }: any) => {
        const rows = filterTransactions(where);
        const sum = rows.reduce((acc, item) => acc + Number(item.amount), 0);
        return {
          _sum: {
            amount: sum
          }
        };
      },
      create: async ({ data }: any) => {
        const row = {
          id: `tx_${store.idCounter++}`,
          ...data,
          createdAt: new Date(store.now)
        };
        store.transactions.push(row);
        return row;
      },
      groupBy: async ({ by, where }: any) => {
        if (!Array.isArray(by) || !by.includes("category")) {
          throw new Error("Only category groupBy is supported in test mock");
        }

        const rows = filterTransactions(where);
        const map = new Map<string, number>();
        for (const row of rows) {
          map.set(row.category, (map.get(row.category) ?? 0) + Number(row.amount));
        }

        return Array.from(map.entries()).map(([category, amount]) => ({
          category,
          _sum: { amount }
        }));
      }
    },
    outboundMessage: {
      create: async ({ data }: any) => {
        const row = {
          id: `out_${store.idCounter++}`,
          userId: data.userId,
          waNumber: data.waNumber,
          messageText: data.messageText,
          status: data.status ?? "PENDING",
          errorMessage: data.errorMessage ?? null,
          sentAt: data.sentAt ?? null,
          createdAt: new Date(store.now),
          updatedAt: new Date(store.now)
        };
        store.outboundMessages.push(row);
        return row;
      },
      findFirst: async ({ where, select }: any) => {
        const row =
          store.outboundMessages.find((item) => {
            if (where?.userId && item.userId !== where.userId) return false;
            if (where?.createdAt?.gte && item.createdAt < where.createdAt.gte) return false;
            if (where?.messageText?.startsWith) {
              return item.messageText.startsWith(where.messageText.startsWith);
            }
            return true;
          }) ?? null;

        if (!row || !select) return row;
        const selected: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) selected[key] = row[key];
        }
        return selected;
      },
      findMany: async ({ where, orderBy, take }: any) => {
        let rows = [...store.outboundMessages];
        if (where?.userId) {
          rows = rows.filter((item) => item.userId === where.userId);
        }
        if (Array.isArray(where?.OR) && where.OR.length) {
          rows = rows.filter((item) =>
            where.OR.some((condition: any) => {
              if (condition?.status) {
                return item.status === condition.status;
              }
              if (condition?.sentAt?.gte) {
                return item.sentAt != null && item.sentAt >= condition.sentAt.gte;
              }
              if (condition?.createdAt?.gte) {
                return item.createdAt >= condition.createdAt.gte;
              }
              return false;
            })
          );
        }
        if (where?.status) {
          rows = rows.filter((item) => item.status === where.status);
        }
        if (orderBy?.createdAt === "asc") {
          rows = rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        if (orderBy?.createdAt === "desc") {
          rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (typeof take === "number") rows = rows.slice(0, take);
        return rows;
      },
      updateMany: async ({ where, data }: any) => {
        const ids = new Set(where?.id?.in ?? []);
        let count = 0;
        for (const row of store.outboundMessages) {
          if (!ids.has(row.id)) continue;
          Object.assign(row, data, { updatedAt: new Date(store.now) });
          count += 1;
        }
        return { count };
      },
      update: async ({ where, data }: any) => {
        const row = store.outboundMessages.find((item) => item.id === where.id);
        if (!row) throw new Error("Outbound message not found");
        Object.assign(row, data, { updatedAt: new Date(store.now) });
        return row;
      }
    }
  };

  prismaMock.$transaction = async (fn: any) => fn(prismaMock);

  return {
    store,
    prismaMock
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: hoisted.prismaMock
}));

vi.mock("@/lib/services/ai-service", () => ({
  extractIntentAndTransaction: vi.fn(async () => hoisted.store.extractionResult),
  generateAIInsight: vi.fn(async () => "insight"),
  generateAIFinancialAdvice: vi.fn(async () => "advice"),
  canonicalizeOnboardingAnswer: vi.fn(async () => null),
  canonicalizeSupportedFinanceMessage: vi.fn(async ({ userMessage }: any) =>
    Object.prototype.hasOwnProperty.call(hoisted.store.semanticCanonicalizations, userMessage)
      ? hoisted.store.semanticCanonicalizations[userMessage]
      : null
  )
}));

import { claimPendingOutboundMessages } from "@/lib/services/outbound-message-service";
import { processInboundBody } from "@/lib/features/inbound/process-inbound";
import { runProactiveReminders } from "@/lib/services/reminder-service";

const store = hoisted.store;

const seedData = () => {
  store.users = [
    {
      id: "user_1",
      waNumber: "6281110001",
      name: "Test User",
      currency: "IDR",
      salaryDate: 25,
      monthlyBudget: null,
      registrationStatus: "COMPLETED",
      onboardingStep: "COMPLETED",
      onboardingCompletedAt: new Date("2026-02-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    }
  ];
  store.subscriptions = [
    {
      id: "sub_1",
      userId: "user_1",
      status: "ACTIVE",
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
      updatedAt: new Date("2026-02-01T00:00:00.000Z")
    }
  ];
  store.budgets = [
    {
      id: "budget_1",
      userId: "user_1",
      category: "makan",
      monthlyLimit: 1_000_000,
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
      updatedAt: new Date("2026-02-01T00:00:00.000Z")
    }
  ];
  store.savingsGoals = [
    {
      id: "goal_1",
      userId: "user_1",
      targetAmount: 1_500_000,
      currentProgress: 0,
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
      updatedAt: new Date("2026-02-01T00:00:00.000Z")
    }
  ];
  store.transactions = [
    {
      id: "tx_1",
      userId: "user_1",
      type: "INCOME",
      amount: 3_000_000,
      category: "salary",
      merchant: null,
      note: null,
      occurredAt: new Date("2026-02-02T10:00:00.000Z"),
      source: "TEXT",
      rawText: "gaji",
      createdAt: new Date("2026-02-02T10:00:00.000Z")
    },
    {
      id: "tx_2",
      userId: "user_1",
      type: "EXPENSE",
      amount: 850_000,
      category: "makan",
      merchant: null,
      note: null,
      occurredAt: new Date("2026-02-05T12:00:00.000Z"),
      source: "TEXT",
      rawText: "makan",
      createdAt: new Date("2026-02-05T12:00:00.000Z")
    },
    {
      id: "tx_3",
      userId: "user_1",
      type: "EXPENSE",
      amount: 100_000,
      category: "belanja",
      merchant: null,
      note: null,
      occurredAt: new Date("2026-02-12T09:00:00.000Z"),
      source: "TEXT",
      rawText: "belanja",
      createdAt: new Date("2026-02-12T09:00:00.000Z")
    },
    {
      id: "tx_4",
      userId: "user_1",
      type: "EXPENSE",
      amount: 450_000,
      category: "transport",
      merchant: null,
      note: null,
      occurredAt: new Date("2026-02-20T09:00:00.000Z"),
      source: "TEXT",
      rawText: "transport",
      createdAt: new Date("2026-02-20T09:00:00.000Z")
    }
  ];
  store.messageLogs = [];
  store.aiLogs = [];
  store.outboundMessages = [];
  store.semanticCanonicalizations = {};
  store.idCounter = 100;
  store.now = new Date("2026-02-24T12:00:00.000Z");
  store.extractionResult = {
    intent: "RECORD_TRANSACTION",
    type: "EXPENSE",
    amount: 50_000,
    category: "makan",
    merchant: null,
    note: null,
    occurredAt: "2026-02-24T12:00:00.000Z",
    reportPeriod: null,
    adviceQuery: null
  };
};

describe("inbound + reminder e2e (mock DB)", () => {
  beforeEach(() => {
    seedData();
  });

  it("processes inbound transaction and returns near-budget warning", async () => {
    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "beli kopi 50rb",
      sentAt: "2026-02-24T12:00:00.000Z"
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Transaksi berhasil dicatat");
    expect(result.body.replyText).toContain("Warning: budget kategori Food & Drink hampir habis");
    expect(store.transactions).toHaveLength(5);
    expect(store.transactions.at(-1)?.amount).toBe(50_000);
    expect(store.transactions.at(-1)?.category).toBe("Food & Drink");
  });

  it("falls back to deterministic parser when AI misses simple income text", async () => {
    store.extractionResult = {
      intent: "UNKNOWN",
      type: null,
      amount: null,
      category: null,
      merchant: null,
      note: null,
      occurredAt: null,
      reportPeriod: null,
      adviceQuery: null
    } as any;

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "gaji masuk 5 juta",
      sentAt: "2026-02-24T12:00:00.000Z"
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Transaksi berhasil dicatat");
    expect(result.body.replyText).toContain("- Tipe: INCOME");
    expect(result.body.replyText).toContain("- Amount: 5000000.00");
    expect(store.transactions.at(-1)?.type).toBe("INCOME");
    expect(store.transactions.at(-1)?.amount).toBe(5_000_000);
    expect(store.transactions.at(-1)?.category).toBe("Salary");
  });

  it("normalizes merchant names when fallback transaction parsing is used", async () => {
    store.extractionResult = {
      intent: "UNKNOWN",
      type: null,
      amount: null,
      category: null,
      merchant: null,
      note: null,
      occurredAt: null,
      reportPeriod: null,
      adviceQuery: null
    } as any;

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "bayar spotify family 50 ribu",
      sentAt: "2026-02-24T12:00:00.000Z"
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Transaksi berhasil dicatat");
    expect(store.transactions.at(-1)?.category).toBe("Entertainment");
    expect(store.transactions.at(-1)?.merchant).toBe("Spotify");
  });

  it("resolves short report follow-up from recent conversation context", async () => {
    const now = Date.now();
    const txOccurredAt = new Date(now - 2 * 60 * 60 * 1000);
    const firstSentAt = new Date(now - 60 * 60 * 1000);
    const secondSentAt = new Date(now - 30 * 60 * 1000);

    store.transactions.push({
      id: "tx_5",
      userId: "user_1",
      type: "EXPENSE",
      amount: 75_000,
      category: "makan",
      merchant: null,
      note: null,
      occurredAt: txOccurredAt,
      source: "TEXT",
      rawText: "sarapan",
      createdAt: txOccurredAt
    });

    const first = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "laporan minggu ini",
      sentAt: firstSentAt.toISOString()
    });
    expect(first.status).toBe(200);
    expect(first.body.replyText).toContain("Report weekly:");

    const second = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "yang monthly juga",
      sentAt: secondSentAt.toISOString()
    });
    expect(second.status).toBe(200);
    expect(second.body.replyText).toContain("Report monthly:");
  });

  it("returns detailed transactions for a requested bucket", async () => {
    const now = new Date();
    const currentMonthDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.max(1, Math.min(now.getUTCDate(), 5)), 9, 0, 0, 0)
    );

    store.transactions.push({
      id: "tx_5",
      userId: "user_1",
      type: "EXPENSE",
      amount: 75_000,
      category: "Entertainment",
      merchant: "Spotify",
      note: null,
      occurredAt: currentMonthDate,
      source: "TEXT",
      rawText: "bayar spotify premium",
      createdAt: currentMonthDate
    });

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "detail entertainment bulan ini apa saja",
      sentAt: "2026-02-24T12:00:00.000Z"
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Rincian transaksi Entertainment untuk bulan ini:");
    expect(result.body.replyText).toContain("Spotify");
    expect(result.body.replyText).toContain("Rp75.000");
  });

  it("returns top transaction inside a bucket", async () => {
    const now = new Date();
    const baseDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.max(1, Math.min(now.getUTCDate(), 5)), 10, 0, 0, 0)
    );

    store.transactions.push(
      {
        id: "tx_5",
        userId: "user_1",
        type: "EXPENSE",
        amount: 75_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: baseDate,
        source: "TEXT",
        rawText: "bayar spotify premium",
        createdAt: baseDate
      },
      {
        id: "tx_6",
        userId: "user_1",
        type: "EXPENSE",
        amount: 120_000,
        category: "Entertainment",
        merchant: "Netflix",
        note: null,
        occurredAt: new Date(baseDate.getTime() + 60_000),
        source: "TEXT",
        rawText: "bayar netflix",
        createdAt: new Date(baseDate.getTime() + 60_000)
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "entertainment terbesar bulan ini apa",
      sentAt: new Date(baseDate.getTime() + 120_000).toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Transaksi terbesar di bucket Entertainment untuk bulan ini:");
    expect(result.body.replyText).toContain("Netflix");
    expect(result.body.replyText).toContain("Rp120.000");
  });

  it("returns total for a specific label inside a bucket", async () => {
    const now = new Date();
    const baseDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.max(1, Math.min(now.getUTCDate(), 5)), 11, 0, 0, 0)
    );

    store.transactions.push(
      {
        id: "tx_5",
        userId: "user_1",
        type: "EXPENSE",
        amount: 75_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: baseDate,
        source: "TEXT",
        rawText: "bayar spotify premium",
        createdAt: baseDate
      },
      {
        id: "tx_6",
        userId: "user_1",
        type: "EXPENSE",
        amount: 25_000,
        category: "Entertainment",
        merchant: null,
        note: null,
        occurredAt: new Date(baseDate.getTime() + 60_000),
        source: "TEXT",
        rawText: "spotify family tambahan",
        createdAt: new Date(baseDate.getTime() + 60_000)
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "spotify bulan ini total berapa",
      sentAt: new Date(baseDate.getTime() + 120_000).toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain('Total pengeluaran Entertainment yang cocok dengan "spotify"');
    expect(result.body.replyText).toContain("Rp100.000");
    expect(result.body.replyText).toContain("2 transaksi");
  });

  it("returns filtered bucket details by label", async () => {
    const now = new Date();
    const baseDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.max(1, Math.min(now.getUTCDate(), 5)), 12, 0, 0, 0)
    );

    store.transactions.push(
      {
        id: "tx_5",
        userId: "user_1",
        type: "EXPENSE",
        amount: 350_000,
        category: "Bills",
        merchant: "Biznet",
        note: null,
        occurredAt: baseDate,
        source: "TEXT",
        rawText: "bayar internet rumah",
        createdAt: baseDate
      },
      {
        id: "tx_6",
        userId: "user_1",
        type: "EXPENSE",
        amount: 250_000,
        category: "Bills",
        merchant: "PLN",
        note: null,
        occurredAt: new Date(baseDate.getTime() + 60_000),
        source: "TEXT",
        rawText: "bayar listrik",
        createdAt: new Date(baseDate.getTime() + 60_000)
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "rincian bills yang internet aja",
      sentAt: new Date(baseDate.getTime() + 120_000).toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain('Rincian transaksi Bills yang cocok dengan "internet"');
    expect(result.body.replyText).toContain("Biznet");
    expect(result.body.replyText).toContain("Rp350.000");
    expect(result.body.replyText).not.toContain("PLN");
  });

  it("compares bucket spending against the previous week", async () => {
    const now = new Date();
    const currentWeekDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    currentWeekDate.setUTCHours(10, 0, 0, 0);
    const previousWeekDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    previousWeekDate.setUTCHours(10, 0, 0, 0);

    store.transactions.push(
      {
        id: "tx_5",
        userId: "user_1",
        type: "EXPENSE",
        amount: 150_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: currentWeekDate,
        source: "TEXT",
        rawText: "spotify premium",
        createdAt: currentWeekDate
      },
      {
        id: "tx_6",
        userId: "user_1",
        type: "EXPENSE",
        amount: 100_000,
        category: "Entertainment",
        merchant: "Netflix",
        note: null,
        occurredAt: new Date(currentWeekDate.getTime() + 60_000),
        source: "TEXT",
        rawText: "netflix family",
        createdAt: new Date(currentWeekDate.getTime() + 60_000)
      },
      {
        id: "tx_7",
        userId: "user_1",
        type: "EXPENSE",
        amount: 80_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: previousWeekDate,
        source: "TEXT",
        rawText: "spotify premium",
        createdAt: previousWeekDate
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "entertainment naik dibanding minggu lalu gak",
      sentAt: now.toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Pengeluaran Entertainment naik dibanding periode sebelumnya.");
    expect(result.body.replyText).toContain("Periode sekarang: Rp250.000");
    expect(result.body.replyText).toContain("Periode sebelumnya: Rp80.000");
  });

  it("returns percentage change against the previous month for a filtered label", async () => {
    const now = new Date();
    const currentMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 5, 10, 0, 0, 0));
    const previousMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 5, 10, 0, 0, 0));

    store.transactions.push(
      {
        id: "tx_5",
        userId: "user_1",
        type: "EXPENSE",
        amount: 200_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: currentMonthDate,
        source: "TEXT",
        rawText: "spotify family",
        createdAt: currentMonthDate
      },
      {
        id: "tx_6",
        userId: "user_1",
        type: "EXPENSE",
        amount: 100_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: previousMonthDate,
        source: "TEXT",
        rawText: "spotify premium",
        createdAt: previousMonthDate
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "spotify naik berapa persen dibanding bulan lalu",
      sentAt: now.toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain('Pengeluaran Entertainment yang cocok dengan "spotify" naik dibanding periode sebelumnya.');
    expect(result.body.replyText).toContain("Periode sekarang: Rp200.000");
    expect(result.body.replyText).toContain("Periode sebelumnya: Rp100.000");
    expect(result.body.replyText).toContain("(100.0%)");
  });

  it("returns average monthly spending for a detailed label", async () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const months = [2, 1, 0].map((offset) => {
      const date = new Date(Date.UTC(year, month - offset, 5, 9, 0, 0, 0));
      return date;
    });

    store.transactions.push(
      {
        id: "tx_5",
        userId: "user_1",
        type: "EXPENSE",
        amount: 50_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: months[0],
        source: "TEXT",
        rawText: "spotify premium",
        createdAt: months[0]
      },
      {
        id: "tx_6",
        userId: "user_1",
        type: "EXPENSE",
        amount: 25_000,
        category: "Entertainment",
        merchant: null,
        note: null,
        occurredAt: months[1],
        source: "TEXT",
        rawText: "spotify duo",
        createdAt: months[1]
      },
      {
        id: "tx_7",
        userId: "user_1",
        type: "EXPENSE",
        amount: 75_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: months[2],
        source: "TEXT",
        rawText: "spotify family",
        createdAt: months[2]
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "spotify rata-rata per bulan berapa",
      sentAt: now.toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain('Rata-rata pengeluaran Entertainment yang cocok dengan "spotify" per bulan: Rp50.000.');
    expect(result.body.replyText).toContain("Basis perhitungan: 3 bulan data");
    expect(result.body.replyText).toContain("Total tercatat: Rp150.000");
  });

  it("returns average weekly spending for a bucket", async () => {
    const now = new Date();
    const weeks = [2, 1, 0].map((offset) => {
      const date = new Date(now.getTime() - offset * 7 * 24 * 60 * 60 * 1000);
      date.setUTCHours(9, 0, 0, 0);
      return date;
    });

    store.transactions.push(
      {
        id: "tx_5",
        userId: "user_1",
        type: "EXPENSE",
        amount: 120_000,
        category: "Bills",
        merchant: "Biznet",
        note: null,
        occurredAt: weeks[0],
        source: "TEXT",
        rawText: "internet rumah",
        createdAt: weeks[0]
      },
      {
        id: "tx_6",
        userId: "user_1",
        type: "EXPENSE",
        amount: 180_000,
        category: "Bills",
        merchant: "PLN",
        note: null,
        occurredAt: weeks[1],
        source: "TEXT",
        rawText: "listrik rumah",
        createdAt: weeks[1]
      },
      {
        id: "tx_7",
        userId: "user_1",
        type: "EXPENSE",
        amount: 120_000,
        category: "Bills",
        merchant: "Telkomsel",
        note: null,
        occurredAt: weeks[2],
        source: "TEXT",
        rawText: "pulsa bulanan",
        createdAt: weeks[2]
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "rata-rata spending bills per minggu",
      sentAt: now.toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Rata-rata pengeluaran Bills per minggu: Rp140.000.");
    expect(result.body.replyText).toContain("Basis perhitungan: 3 minggu data");
    expect(result.body.replyText).toContain("Total tercatat: Rp420.000");
  });

  it("returns contribution share of a detailed label inside a bucket", async () => {
    const now = new Date();
    const baseDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.max(1, Math.min(now.getUTCDate(), 6)), 10, 0, 0, 0)
    );

    store.transactions.push(
      {
        id: "tx_5",
        userId: "user_1",
        type: "EXPENSE",
        amount: 150_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: baseDate,
        source: "TEXT",
        rawText: "spotify premium",
        createdAt: baseDate
      },
      {
        id: "tx_6",
        userId: "user_1",
        type: "EXPENSE",
        amount: 50_000,
        category: "Entertainment",
        merchant: "Netflix",
        note: null,
        occurredAt: new Date(baseDate.getTime() + 60_000),
        source: "TEXT",
        rawText: "netflix mobile",
        createdAt: new Date(baseDate.getTime() + 60_000)
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "spotify kontribusinya berapa persen dari entertainment bulan ini",
      sentAt: new Date(baseDate.getTime() + 120_000).toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("spotify berkontribusi 75.0% dari bucket Entertainment untuk bulan ini.");
    expect(result.body.replyText).toContain("Total spotify: Rp150.000");
    expect(result.body.replyText).toContain("Total bucket Entertainment: Rp200.000");
  });

  it("returns top merchants inside a bucket for the current month", async () => {
    const now = new Date();
    const baseDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.max(1, Math.min(now.getUTCDate(), 5)), 13, 0, 0, 0)
    );

    store.transactions.push(
      {
        id: "tx_5",
        userId: "user_1",
        type: "EXPENSE",
        amount: 120_000,
        category: "Entertainment",
        merchant: "Netflix",
        note: null,
        occurredAt: baseDate,
        source: "TEXT",
        rawText: "netflix family",
        createdAt: baseDate
      },
      {
        id: "tx_6",
        userId: "user_1",
        type: "EXPENSE",
        amount: 150_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: new Date(baseDate.getTime() + 60_000),
        source: "TEXT",
        rawText: "spotify premium",
        createdAt: new Date(baseDate.getTime() + 60_000)
      },
      {
        id: "tx_7",
        userId: "user_1",
        type: "EXPENSE",
        amount: 90_000,
        category: "Entertainment",
        merchant: "Steam",
        note: null,
        occurredAt: new Date(baseDate.getTime() + 120_000),
        source: "TEXT",
        rawText: "steam wallet",
        createdAt: new Date(baseDate.getTime() + 120_000)
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "3 merchant entertainment terbesar bulan ini apa aja",
      sentAt: new Date(baseDate.getTime() + 180_000).toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Top 3 merchant di bucket Entertainment untuk bulan ini:");
    expect(result.body.replyText).toContain("1. Spotify | Rp150.000 | 1 transaksi");
    expect(result.body.replyText).toContain("2. Netflix | Rp120.000 | 1 transaksi");
    expect(result.body.replyText).toContain("3. Steam | Rp90.000 | 1 transaksi");
  });

  it("returns most frequent merchants inside a bucket", async () => {
    const now = new Date();
    const baseDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.max(1, Math.min(now.getUTCDate(), 5)), 14, 0, 0, 0)
    );

    store.transactions.push(
      {
        id: "tx_5",
        userId: "user_1",
        type: "EXPENSE",
        amount: 50_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: baseDate,
        source: "TEXT",
        rawText: "spotify premium",
        createdAt: baseDate
      },
      {
        id: "tx_6",
        userId: "user_1",
        type: "EXPENSE",
        amount: 60_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: new Date(baseDate.getTime() + 60_000),
        source: "TEXT",
        rawText: "spotify family",
        createdAt: new Date(baseDate.getTime() + 60_000)
      },
      {
        id: "tx_7",
        userId: "user_1",
        type: "EXPENSE",
        amount: 70_000,
        category: "Entertainment",
        merchant: "Netflix",
        note: null,
        occurredAt: new Date(baseDate.getTime() + 120_000),
        source: "TEXT",
        rawText: "netflix family",
        createdAt: new Date(baseDate.getTime() + 120_000)
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "merchant entertainment paling sering bulan ini",
      sentAt: new Date(baseDate.getTime() + 180_000).toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Merchant paling sering di bucket Entertainment untuk bulan ini:");
    expect(result.body.replyText).toContain("1. Spotify | Rp110.000 | 2 transaksi");
    expect(result.body.replyText).toContain("2. Netflix | Rp70.000 | 1 transaksi");
  });

  it("returns most frequent bill merchants for the last six months", async () => {
    const now = new Date();
    const dates = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 5, 9, 0, 0, 0));
      return date;
    });

    store.transactions.push(
      {
        id: "tx_5",
        userId: "user_1",
        type: "EXPENSE",
        amount: 300_000,
        category: "Bills",
        merchant: "Biznet",
        note: null,
        occurredAt: dates[0],
        source: "TEXT",
        rawText: "internet rumah",
        createdAt: dates[0]
      },
      {
        id: "tx_6",
        userId: "user_1",
        type: "EXPENSE",
        amount: 310_000,
        category: "Bills",
        merchant: "Biznet",
        note: null,
        occurredAt: dates[1],
        source: "TEXT",
        rawText: "internet rumah",
        createdAt: dates[1]
      },
      {
        id: "tx_7",
        userId: "user_1",
        type: "EXPENSE",
        amount: 200_000,
        category: "Bills",
        merchant: "PLN",
        note: null,
        occurredAt: dates[2],
        source: "TEXT",
        rawText: "listrik",
        createdAt: dates[2]
      },
      {
        id: "tx_8",
        userId: "user_1",
        type: "EXPENSE",
        amount: 205_000,
        category: "Bills",
        merchant: "PLN",
        note: null,
        occurredAt: dates[3],
        source: "TEXT",
        rawText: "listrik",
        createdAt: dates[3]
      },
      {
        id: "tx_9",
        userId: "user_1",
        type: "EXPENSE",
        amount: 90_000,
        category: "Bills",
        merchant: "BPJS",
        note: null,
        occurredAt: dates[4],
        source: "TEXT",
        rawText: "bpjs",
        createdAt: dates[4]
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "merchant bills paling rutin 6 bulan terakhir",
      sentAt: now.toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Merchant paling sering di bucket Bills untuk 6 bulan terakhir:");
    expect(result.body.replyText).toContain("1. Biznet | Rp610.000 | 2 transaksi");
    expect(result.body.replyText).toContain("2. PLN | Rp405.000 | 2 transaksi");
  });

  it("returns top bill merchants for the last three months", async () => {
    const now = new Date();
    const dates = [2, 1, 0].map((offset, index) => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 5 + index, 9, 0, 0, 0));
      return date;
    });
    const oldDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 4, 5, 9, 0, 0, 0));

    store.transactions.push(
      {
        id: "tx_5",
        userId: "user_1",
        type: "EXPENSE",
        amount: 300_000,
        category: "Bills",
        merchant: "Biznet",
        note: null,
        occurredAt: dates[0],
        source: "TEXT",
        rawText: "internet rumah",
        createdAt: dates[0]
      },
      {
        id: "tx_6",
        userId: "user_1",
        type: "EXPENSE",
        amount: 250_000,
        category: "Bills",
        merchant: "PLN",
        note: null,
        occurredAt: dates[1],
        source: "TEXT",
        rawText: "listrik rumah",
        createdAt: dates[1]
      },
      {
        id: "tx_7",
        userId: "user_1",
        type: "EXPENSE",
        amount: 200_000,
        category: "Bills",
        merchant: "Telkomsel",
        note: null,
        occurredAt: dates[2],
        source: "TEXT",
        rawText: "pulsa bulanan",
        createdAt: dates[2]
      },
      {
        id: "tx_8",
        userId: "user_1",
        type: "EXPENSE",
        amount: 180_000,
        category: "Bills",
        merchant: "BPJS",
        note: null,
        occurredAt: new Date(dates[2].getTime() + 60_000),
        source: "TEXT",
        rawText: "bpjs kesehatan",
        createdAt: new Date(dates[2].getTime() + 60_000)
      },
      {
        id: "tx_9",
        userId: "user_1",
        type: "EXPENSE",
        amount: 120_000,
        category: "Bills",
        merchant: "XL",
        note: null,
        occurredAt: new Date(dates[1].getTime() + 60_000),
        source: "TEXT",
        rawText: "paket data",
        createdAt: new Date(dates[1].getTime() + 60_000)
      },
      {
        id: "tx_10",
        userId: "user_1",
        type: "EXPENSE",
        amount: 500_000,
        category: "Bills",
        merchant: "ShouldBeIgnored",
        note: null,
        occurredAt: oldDate,
        source: "TEXT",
        rawText: "tagihan lama",
        createdAt: oldDate
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "top 5 merchant bills 3 bulan terakhir",
      sentAt: now.toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Top 5 merchant di bucket Bills untuk 3 bulan terakhir:");
    expect(result.body.replyText).toContain("1. Biznet | Rp300.000 | 1 transaksi");
    expect(result.body.replyText).toContain("2. PLN | Rp250.000 | 1 transaksi");
    expect(result.body.replyText).toContain("5. XL | Rp120.000 | 1 transaksi");
    expect(result.body.replyText).not.toContain("ShouldBeIgnored");
  });

  it("returns the category with the biggest increase versus last month", async () => {
    const now = new Date();
    const currentMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 7, 10, 0, 0, 0));
    const previousMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 7, 10, 0, 0, 0));

    store.transactions.push(
      {
        id: "tx_5",
        userId: "user_1",
        type: "EXPENSE",
        amount: 400_000,
        category: "Entertainment",
        merchant: "Netflix",
        note: null,
        occurredAt: currentMonthDate,
        source: "TEXT",
        rawText: "netflix family",
        createdAt: currentMonthDate
      },
      {
        id: "tx_6",
        userId: "user_1",
        type: "EXPENSE",
        amount: 100_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: previousMonthDate,
        source: "TEXT",
        rawText: "spotify premium",
        createdAt: previousMonthDate
      },
      {
        id: "tx_7",
        userId: "user_1",
        type: "EXPENSE",
        amount: 150_000,
        category: "Bills",
        merchant: "PLN",
        note: null,
        occurredAt: currentMonthDate,
        source: "TEXT",
        rawText: "listrik",
        createdAt: currentMonthDate
      },
      {
        id: "tx_8",
        userId: "user_1",
        type: "EXPENSE",
        amount: 120_000,
        category: "Bills",
        merchant: "PLN",
        note: null,
        occurredAt: previousMonthDate,
        source: "TEXT",
        rawText: "listrik",
        createdAt: previousMonthDate
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "kategori mana yang paling naik dibanding bulan lalu",
      sentAt: now.toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Kategori dengan kenaikan terbesar dibanding periode sebelumnya adalah Entertainment.");
    expect(result.body.replyText).toContain("Kenaikan: Rp300.000");
    expect(result.body.replyText).toContain("1. Entertainment | naik Rp300.000 (300.0%)");
  });

  it("returns recurring expenses across categories for the current month", async () => {
    const now = new Date();
    const baseDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.max(1, Math.min(now.getUTCDate(), 8)), 11, 0, 0, 0)
    );

    store.transactions.push(
      {
        id: "tx_5",
        userId: "user_1",
        type: "EXPENSE",
        amount: 50_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: baseDate,
        source: "TEXT",
        rawText: "spotify premium",
        createdAt: baseDate
      },
      {
        id: "tx_6",
        userId: "user_1",
        type: "EXPENSE",
        amount: 55_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: new Date(baseDate.getTime() + 60_000),
        source: "TEXT",
        rawText: "spotify family",
        createdAt: new Date(baseDate.getTime() + 60_000)
      },
      {
        id: "tx_7",
        userId: "user_1",
        type: "EXPENSE",
        amount: 100_000,
        category: "Bills",
        merchant: "PLN",
        note: null,
        occurredAt: new Date(baseDate.getTime() + 120_000),
        source: "TEXT",
        rawText: "listrik rumah",
        createdAt: new Date(baseDate.getTime() + 120_000)
      },
      {
        id: "tx_8",
        userId: "user_1",
        type: "EXPENSE",
        amount: 110_000,
        category: "Bills",
        merchant: "PLN",
        note: null,
        occurredAt: new Date(baseDate.getTime() + 180_000),
        source: "TEXT",
        rawText: "token listrik",
        createdAt: new Date(baseDate.getTime() + 180_000)
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "top recurring expense bulan ini",
      sentAt: new Date(baseDate.getTime() + 240_000).toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Top recurring expense untuk bulan ini:");
    expect(result.body.replyText).toContain("1. PLN | Bills | Rp210.000 | 2 transaksi");
    expect(result.body.replyText).toContain("2. Spotify | Entertainment | Rp105.000 | 2 transaksi | kemungkinan langganan");
  });

  it("answers flexible cashflow safety questions until payday", async () => {
    const now = new Date();
    const currentMonthPayday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 25, 9, 0, 0, 0));
    const lastPayday =
      currentMonthPayday.getTime() <= now.getTime()
        ? currentMonthPayday
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 25, 9, 0, 0, 0));
    const nextPayday =
      currentMonthPayday.getTime() > now.getTime()
        ? currentMonthPayday
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 25, 9, 0, 0, 0));
    const expectedPaydayLabel = new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(nextPayday);

    store.transactions.push(
      {
        id: "tx_cash_1",
        userId: "user_1",
        type: "INCOME",
        amount: 6_000_000,
        category: "Salary",
        merchant: null,
        note: null,
        occurredAt: lastPayday,
        source: "TEXT",
        rawText: "gaji bulan ini",
        createdAt: lastPayday
      },
      {
        id: "tx_cash_2",
        userId: "user_1",
        type: "EXPENSE",
        amount: 1_200_000,
        category: "Bills",
        merchant: "Biznet",
        note: null,
        occurredAt: new Date(lastPayday.getTime() + 3 * 24 * 60 * 60 * 1000),
        source: "TEXT",
        rawText: "bayar internet",
        createdAt: new Date(lastPayday.getTime() + 3 * 24 * 60 * 60 * 1000)
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "gue masih kuat sampe gajian gak",
      sentAt: now.toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("masih aman sampai gajian berikutnya");
    expect(result.body.replyText).toContain(expectedPaydayLabel);
    expect(result.body.replyText).toContain("Buffer saat ini");
  });

  it("supports looser recurring phrasing", async () => {
    const now = new Date();
    const baseDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.max(1, Math.min(now.getUTCDate(), 8)), 11, 0, 0, 0)
    );

    store.transactions.push(
      {
        id: "tx_5",
        userId: "user_1",
        type: "EXPENSE",
        amount: 50_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: baseDate,
        source: "TEXT",
        rawText: "spotify premium",
        createdAt: baseDate
      },
      {
        id: "tx_6",
        userId: "user_1",
        type: "EXPENSE",
        amount: 55_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: new Date(baseDate.getTime() + 60_000),
        source: "TEXT",
        rawText: "spotify family",
        createdAt: new Date(baseDate.getTime() + 60_000)
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "langganan rutin bulan ini apa aja",
      sentAt: new Date(baseDate.getTime() + 240_000).toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Top recurring expense untuk bulan ini:");
    expect(result.body.replyText).toContain("Spotify | Entertainment");
  });

  it("routes unsupported phrasing through semantic canonicalization before handling", async () => {
    const now = new Date();
    const safeDay = Math.max(1, Math.min(now.getUTCDate(), 5));
    const currentMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), safeDay, 10, 0, 0, 0));
    const previousMonthDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, safeDay, 10, 0, 0, 0)
    );
    const rawQuestion = "yang paling bikin pengeluaran gue meledak merchant apa ya";
    store.semanticCanonicalizations[rawQuestion] = "merchant apa yang paling ngedorong kenaikan spending";

    store.transactions.push(
      {
        id: "tx_sem_1",
        userId: "user_1",
        type: "EXPENSE",
        amount: 320_000,
        category: "Bills",
        merchant: "Biznet",
        note: null,
        occurredAt: currentMonthDate,
        source: "TEXT",
        rawText: "internet rumah",
        createdAt: currentMonthDate
      },
      {
        id: "tx_sem_2",
        userId: "user_1",
        type: "EXPENSE",
        amount: 120_000,
        category: "Bills",
        merchant: "Biznet",
        note: null,
        occurredAt: previousMonthDate,
        source: "TEXT",
        rawText: "internet rumah",
        createdAt: previousMonthDate
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: rawQuestion,
      sentAt: now.toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Selisih terbesar datang dari Biznet di bucket Bills.");
  });

  it("can semantically route a freeform month-end cashflow question", async () => {
    const now = new Date();
    const rawQuestion = "kalau gaya keluar duitku begini terus pas bulan nutup masih ada sisa gak ya";
    store.semanticCanonicalizations[rawQuestion] = "akhir bulan sisa berapa";

    const currentMonthPayday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 25, 9, 0, 0, 0));
    const lastPayday =
      currentMonthPayday.getTime() <= now.getTime()
        ? currentMonthPayday
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 25, 9, 0, 0, 0));

    store.transactions.push({
      id: "tx_sem_cash_1",
      userId: "user_1",
      type: "INCOME",
      amount: 5_500_000,
      category: "Salary",
      merchant: null,
      note: null,
      occurredAt: lastPayday,
      source: "TEXT",
      rawText: "gaji bulan ini",
      createdAt: lastPayday
    });

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: rawQuestion,
      sentAt: now.toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Estimasi sisa cashflow sampai akhir bulan");
  });

  it("can semantically route a freeform bucket detail question", async () => {
    const now = new Date();
    const baseDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.max(1, Math.min(now.getUTCDate(), 7)), 12, 0, 0, 0)
    );
    const rawQuestion = "coba bukain pengeluaran santai gue bulan ini isinya apa aja";
    store.semanticCanonicalizations[rawQuestion] = "detail entertainment bulan ini apa saja";

    store.transactions.push(
      {
        id: "tx_sem_detail_1",
        userId: "user_1",
        type: "EXPENSE",
        amount: 75_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: baseDate,
        source: "TEXT",
        rawText: "spotify premium",
        createdAt: baseDate
      },
      {
        id: "tx_sem_detail_2",
        userId: "user_1",
        type: "EXPENSE",
        amount: 120_000,
        category: "Entertainment",
        merchant: "Netflix",
        note: null,
        occurredAt: new Date(baseDate.getTime() + 60_000),
        source: "TEXT",
        rawText: "netflix",
        createdAt: new Date(baseDate.getTime() + 60_000)
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: rawQuestion,
      sentAt: now.toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Rincian transaksi Entertainment untuk bulan ini:");
    expect(result.body.replyText).toContain("Spotify");
    expect(result.body.replyText).toContain("Netflix");
  });

  it("explains which merchants caused a category to rise", async () => {
    const now = new Date();
    const safeDay = Math.max(1, Math.min(now.getUTCDate(), 5));
    const currentMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), safeDay, 10, 0, 0, 0));
    const previousMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, safeDay, 10, 0, 0, 0));

    store.transactions.push(
      {
        id: "tx_5",
        userId: "user_1",
        type: "EXPENSE",
        amount: 200_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: currentMonthDate,
        source: "TEXT",
        rawText: "spotify family",
        createdAt: currentMonthDate
      },
      {
        id: "tx_6",
        userId: "user_1",
        type: "EXPENSE",
        amount: 120_000,
        category: "Entertainment",
        merchant: "Netflix",
        note: null,
        occurredAt: new Date(currentMonthDate.getTime() + 60_000),
        source: "TEXT",
        rawText: "netflix family",
        createdAt: new Date(currentMonthDate.getTime() + 60_000)
      },
      {
        id: "tx_7",
        userId: "user_1",
        type: "EXPENSE",
        amount: 50_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: previousMonthDate,
        source: "TEXT",
        rawText: "spotify premium",
        createdAt: previousMonthDate
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "kenapa entertainment naik bulan ini",
      sentAt: now.toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Pengeluaran Entertainment naik terutama karena merchant ini:");
    expect(result.body.replyText).toContain("1. Spotify | naik Rp150.000");
    expect(result.body.replyText).toContain("2. Netflix | naik Rp120.000");
  });

  it("explains which merchant has the biggest delta across expenses", async () => {
    const now = new Date();
    const safeDay = Math.max(1, Math.min(now.getUTCDate(), 5));
    const currentMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), safeDay, 10, 0, 0, 0));
    const previousMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, safeDay, 10, 0, 0, 0));

    store.transactions.push(
      {
        id: "tx_5",
        userId: "user_1",
        type: "EXPENSE",
        amount: 300_000,
        category: "Bills",
        merchant: "Biznet",
        note: null,
        occurredAt: currentMonthDate,
        source: "TEXT",
        rawText: "internet rumah",
        createdAt: currentMonthDate
      },
      {
        id: "tx_6",
        userId: "user_1",
        type: "EXPENSE",
        amount: 100_000,
        category: "Bills",
        merchant: "Biznet",
        note: null,
        occurredAt: previousMonthDate,
        source: "TEXT",
        rawText: "internet rumah",
        createdAt: previousMonthDate
      },
      {
        id: "tx_7",
        userId: "user_1",
        type: "EXPENSE",
        amount: 150_000,
        category: "Entertainment",
        merchant: "Spotify",
        note: null,
        occurredAt: currentMonthDate,
        source: "TEXT",
        rawText: "spotify family",
        createdAt: currentMonthDate
      }
    );

    const result = await processInboundBody({
      waNumber: "6281110001",
      messageType: "TEXT",
      text: "selisih terbesar datang dari merchant mana",
      sentAt: now.toISOString()
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Selisih terbesar datang dari Biznet di bucket Bills.");
    expect(result.body.replyText).toContain("1. Biznet | Bills | naik Rp200.000");
  });

  it("keeps existing user when inbound wa format changes", async () => {
    store.users[0].waNumber = "081110001";

    const result = await processInboundBody({
      waNumber: "6281110001:12@s.whatsapp.net",
      messageType: "TEXT",
      text: "beli kopi 50rb",
      sentAt: "2026-02-24T12:00:00.000Z"
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Transaksi berhasil dicatat");
    expect(store.users).toHaveLength(1);
    expect(store.users[0]?.id).toBe("user_1");
    expect(store.users[0]?.waNumber).toBe("6281110001");
  });

  it("migrates lid-based user to phone number when waLid is provided", async () => {
    store.users[0].waNumber = "251796920508426";

    const result = await processInboundBody({
      waNumber: "6281110001",
      waLid: "251796920508426",
      messageType: "TEXT",
      text: "beli kopi 50rb",
      sentAt: "2026-02-24T12:00:00.000Z"
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Transaksi berhasil dicatat");
    expect(store.users).toHaveLength(1);
    expect(store.users[0]?.id).toBe("user_1");
    expect(store.users[0]?.waNumber).toBe("6281110001");
  });

  it("asks phone first on onboarding when sender identity is lid", async () => {
    store.users = [];
    store.subscriptions = [];
    store.budgets = [];
    store.savingsGoals = [];
    store.transactions = [];
    store.messageLogs = [];
    store.aiLogs = [];
    store.outboundMessages = [];
    store.idCounter = 1;

    const start = await processInboundBody({
      waNumber: "251796920508426",
      messageType: "TEXT",
      text: "register",
      sentAt: "2026-02-24T12:00:00.000Z"
    });
    expect(start.status).toBe(200);
    expect(start.body.replyText).toContain("kirim nomor WhatsApp aktif Anda dulu");
    expect(store.users).toHaveLength(1);
    expect(store.users[0]?.waNumber).toBe("251796920508426");

    const invalidPhone = await processInboundBody({
      waNumber: "251796920508426",
      messageType: "TEXT",
      text: "Haikal",
      sentAt: "2026-02-24T12:00:10.000Z"
    });
    expect(invalidPhone.status).toBe(200);
    expect(invalidPhone.body.replyText).toContain("Nomor WhatsApp belum valid");

    const unregisteredPhone = await processInboundBody({
      waNumber: "251796920508426",
      phoneInput: "6281275167471",
      phoneInputRegistered: false,
      messageType: "TEXT",
      text: "6281275167471",
      sentAt: "2026-02-24T12:00:15.000Z"
    });
    expect(unregisteredPhone.status).toBe(200);
    expect(unregisteredPhone.body.replyText).toContain("tidak terdaftar di WhatsApp");

    const setPhone = await processInboundBody({
      waNumber: "251796920508426",
      phoneInput: "6281275167471",
      phoneInputRegistered: true,
      messageType: "TEXT",
      text: "6281275167471",
      sentAt: "2026-02-24T12:00:20.000Z"
    });
    expect(setPhone.status).toBe(200);
    expect(setPhone.body.replyText).toContain("Apa tujuan utama kamu pakai AI Finance ini?");
    expect(store.users[0]?.waNumber).toBe("6281275167471");
    expect(store.users).toHaveLength(1);
  });

  it("accepts short readiness follow-up during onboarding", async () => {
    store.users = [];
    store.subscriptions = [];
    store.budgets = [];
    store.savingsGoals = [];
    store.transactions = [];
    store.messageLogs = [];
    store.aiLogs = [];
    store.outboundMessages = [];
    store.idCounter = 1;

    const result = await processInboundBody({
      waNumber: "6281275167471",
      messageType: "TEXT",
      text: "lanjut",
      sentAt: "2026-02-24T12:00:00.000Z"
    });

    expect(result.status).toBe(200);
    expect(result.body.replyText).toContain("Apa tujuan utama kamu pakai AI Finance ini?");
  });

  it("queues budget/goal/weekly reminders, then deduplicates next run", async () => {
    const firstRun = await runProactiveReminders(new Date("2026-02-24T12:00:00.000Z"));
    expect(firstRun.processedUsers).toBe(1);
    expect(firstRun.queuedByType.budget).toBe(1);
    expect(firstRun.queuedByType.goal).toBe(1);
    expect(firstRun.queuedByType.weekly).toBe(1);

    const claimed = await claimPendingOutboundMessages(10);
    expect(claimed).toHaveLength(3);
    expect(claimed.map((item) => item.status)).toEqual(["PROCESSING", "PROCESSING", "PROCESSING"]);

    const secondRun = await runProactiveReminders(new Date("2026-02-24T12:10:00.000Z"));
    expect(secondRun.queued).toBe(0);
  });
});

