import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
    const store = {
        now: new Date("2026-05-21T10:00:00.000Z"),
        idCounter: 1,
        users: [] as any[],
        transactions: [] as any[],
        messageLogs: [] as any[],
        aiLogs: [] as any[],
        outboundMessages: [] as any[],
        ocrResult: "TOTAL Rp 45.000" as string | null,
        ocrShouldThrow: false,
        geminiShouldThrow: false,
        extractionResult: {
            intent: "RECORD_TRANSACTION",
            type: "EXPENSE",
            amount: 45000,
            category: "makan",
            merchant: null,
            note: null,
            occurredAt: "2026-05-21T10:00:00.000Z",
            reportPeriod: null
        } as any
    };

    const prismaMock: any = {
        user: {
            findUnique: async ({ where }: any) => {
                if (where?.waNumber)
                    return store.users.find((u) => u.waNumber === where.waNumber) ?? null;
                if (where?.id)
                    return store.users.find((u) => u.id === where.id) ?? null;
                return null;
            },
            create: async ({ data }: any) => {
                const user = {
                    id: `user_${store.idCounter++}`,
                    waNumber: data.waNumber,
                    name: data.name ?? null,
                    currency: data.currency ?? "IDR",
                    monthlyBudget: null,
                    registrationStatus: data.registrationStatus ?? "COMPLETED",
                    onboardingStatus: data.onboardingStatus ?? "COMPLETED",
                    onboardingStep: data.onboardingStep ?? "COMPLETED",
                    onboardingCompletedAt: new Date(store.now),
                    createdAt: new Date(store.now),
                    updatedAt: new Date(store.now)
                };
                store.users.push(user);
                return user;
            },
            update: async ({ where, data }: any) => {
                const user = store.users.find((u) => u.id === where.id);
                if (!user) throw new Error("User not found");
                Object.assign(user, data);
                return user;
            },
            findMany: async ({ where }: any) => {
                let users = [...store.users];
                if (where?.registrationStatus)
                    users = users.filter((u) => u.registrationStatus === where.registrationStatus);
                return users;
            }
        },
        messageLog: {
            create: async ({ data }: any) => {
                const row = { id: `msg_${store.idCounter++}`, ...data };
                store.messageLogs.push(row);
                return row;
            },
            findMany: async ({ where, orderBy, take }: any) => {
                let rows = [...store.messageLogs];
                if (where?.userId) rows = rows.filter((r) => r.userId === where.userId);
                if (where?.id?.not) rows = rows.filter((r) => r.id !== where.id.not);
                if (orderBy?.sentAt === "desc")
                    rows = rows.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
                if (typeof take === "number") rows = rows.slice(0, take);
                return rows;
            }
        },
        aIAnalysisLog: {
            create: async ({ data }: any) => {
                const row = { id: `ailog_${store.idCounter++}`, ...data, createdAt: new Date(store.now) };
                store.aiLogs.push(row);
                return row;
            },
            findMany: async ({ where, orderBy, take }: any) => {
                let rows = [...store.aiLogs];
                if (where?.userId) rows = rows.filter((r) => r.userId === where.userId);
                if (orderBy?.createdAt === "desc")
                    rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
                if (typeof take === "number") rows = rows.slice(0, take);
                return rows;
            }
        },
        budget: {
            findUnique: async () => null,
            findMany: async () => [],
            upsert: async ({ create }: any) => ({ id: `budget_${store.idCounter++}`, ...create })
        },
        savingsGoal: {
            findUnique: async () => null,
            upsert: async ({ create }: any) => ({ id: `goal_${store.idCounter++}`, ...create })
        },
        reminderPreference: {
            findUnique: async () => null,
            upsert: async ({ create }: any) => ({ id: `pref_${store.idCounter++}`, ...create })
        },
        transaction: {
            findMany: async ({ where }: any) => {
                let rows = [...store.transactions];
                if (where?.userId) rows = rows.filter((r) => r.userId === where.userId);
                return rows;
            },
            aggregate: async () => ({ _sum: { amount: 0 } }),
            create: async ({ data }: any) => {
                const row = { id: `tx_${store.idCounter++}`, ...data, createdAt: new Date(store.now) };
                store.transactions.push(row);
                return row;
            },
            update: async ({ where, data }: any) => {
                const row = store.transactions.find((r) => r.id === where.id);
                if (!row) throw new Error("Not found");
                Object.assign(row, data);
                return row;
            },
            delete: async ({ where }: any) => {
                const i = store.transactions.findIndex((r) => r.id === where.id);
                if (i === -1) throw new Error("Not found");
                return store.transactions.splice(i, 1)[0];
            },
            groupBy: async () => []
        },
        outboundMessage: {
            create: async ({ data }: any) => {
                const row = { id: `out_${store.idCounter++}`, ...data, createdAt: new Date(store.now) };
                store.outboundMessages.push(row);
                return row;
            },
            findMany: async () => [],
            findFirst: async () => null,
            updateMany: async () => ({ count: 0 }),
            update: async () => ({})
        },
        reminderEvent: {
            findFirst: async () => null,
            count: async () => 0,
            create: async ({ data }: any) => ({ id: `re_${store.idCounter++}`, ...data })
        }
    };

    prismaMock.$transaction = async (fn: any) => fn(prismaMock);

    return { store, prismaMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: hoisted.prismaMock }));

vi.mock("@/lib/services/ai/image-ocr", () => ({
    extractTextFromImage: vi.fn(async () => {
        if (hoisted.store.ocrShouldThrow) throw new Error("Vision API unavailable");
        if (!hoisted.store.ocrResult || hoisted.store.ocrResult.trim() === "")
            throw new Error("No OCR text detected");
        return hoisted.store.ocrResult;
    })
}));

vi.mock("@/lib/services/ai/transaction-understanding", () => ({
    extractIntentAndTransaction: vi.fn(async () => {
        if (hoisted.store.geminiShouldThrow) throw new Error("Gemini service error");
        return hoisted.store.extractionResult;
    })
}));

vi.mock("@/lib/services/ai/message-normalization", () => ({
    canonicalizeSupportedFinanceMessage: vi.fn(async () => null)
}));

import { processInboundBody } from "@/lib/inbound/pipeline/process-inbound";

const store = hoisted.store;
const seedUser = () => {
    store.users = [
        {
            id: "user_1",
            waNumber: "6281110001",
            name: "Test User",
            currency: "IDR",
            salaryDate: 25,
            monthlyBudget: null,
            registrationStatus: "COMPLETED",
            onboardingStatus: "COMPLETED",
            onboardingStep: "COMPLETED",
            onboardingCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z")
        }
    ];
    store.transactions = [];
    store.messageLogs = [];
    store.aiLogs = [];
    store.outboundMessages = [];
    store.idCounter = 100;
    store.now = new Date("2026-05-21T10:00:00.000Z");
    store.ocrResult = "Warung Makan Bahagia\nNASI GORENG x1  Rp 22.000\nES TEH x1       Rp 5.000\nTOTAL           Rp 27.000\nTERIMA KASIH";
    store.ocrShouldThrow = false;
    store.geminiShouldThrow = false;
    store.extractionResult = {
        intent: "RECORD_TRANSACTION",
        type: "EXPENSE",
        amount: 27000,
        category: "makan",
        merchant: "Warung Makan Bahagia",
        note: null,
        occurredAt: "2026-05-21T10:00:00.000Z",
        reportPeriod: null
    };
};

describe("Image OCR Tests (TC-166 – TC-170)", () => {
    beforeEach(() => {
        global.__waRateLimitBuckets?.clear();
        vi.useFakeTimers();
        vi.setSystemTime(store.now);
        seedUser();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("TC-166: struk valid → OCR dinormalisasi → transaksi langsung tersimpan", async () => {
        const result = await processInboundBody({
            waNumber: "6281110001",
            messageType: "IMAGE",
            imageBase64: "base64ImageContent==",
            sentAt: "2026-05-21T10:00:00.000Z"
        });

        expect(result.status).toBe(200);
        expect(result.body.replyText).toContain("Transaksi berhasil dicatat");
        expect(result.body.replyText).toContain("EXPENSE");
        expect(result.body.replyText).toContain("27.000");
        expect(store.transactions).toHaveLength(1);
        expect(store.transactions[0]?.amount).toBe(27000);
        expect(store.transactions[0]?.type).toBe("EXPENSE");
    });

    it("TC-167: caption makan malam → kategori mempertimbangkan caption", async () => {
        const result = await processInboundBody({
            waNumber: "6281110001",
            messageType: "IMAGE",
            imageBase64: "base64ImageContent==",
            caption: "makan malam",
            sentAt: "2026-05-21T10:00:00.000Z"
        });

        expect(result.status).toBe(200);
        expect(result.body.replyText).toContain("Transaksi berhasil dicatat");
        expect(result.body.replyText).toMatch(/makan|Food|Drink|Meals/i);
        expect(result.body.replyText).toContain("Warung Makan Bahagia");
        expect(store.transactions).toHaveLength(1);
        expect(store.transactions[0]?.amount).toBe(27000);
    });

    it("TC-168: OCR kosong → tidak insert → reply minta foto lebih jelas", async () => {
        store.ocrResult = "";

        const result = await processInboundBody({
            waNumber: "6281110001",
            messageType: "IMAGE",
            imageBase64: "blurryOrEmptyImage==",
            sentAt: "2026-05-21T10:00:00.000Z"
        });

        expect(result.status).toBe(200);
        expect(store.transactions).toHaveLength(0);
        expect(result.body.replyText).toMatch(/lebih jelas|foto|gambar/i);
        expect(result.body.replyText).not.toContain("berhasil dicatat");
    });

    it("TC-169: Vision API throw → reply fallback OCR gagal", async () => {
        store.ocrShouldThrow = true;

        const result = await processInboundBody({
            waNumber: "6281110001",
            messageType: "IMAGE",
            imageBase64: "anyImage==",
            sentAt: "2026-05-21T10:00:00.000Z"
        });

        expect(result.status).toBe(200);
        expect(store.transactions).toHaveLength(0);
        expect(result.body.replyText).toMatch(/Gagal membaca|teks.*gambar|foto.*jelas/i);
    });

    it("TC-170: Gemini normalizer throw → tidak insert parsial", async () => {
        store.ocrResult = "TOTAL Rp 45.000";
        store.geminiShouldThrow = true;

        const result = await processInboundBody({
            waNumber: "6281110001",
            messageType: "IMAGE",
            imageBase64: "anyImage==",
            sentAt: "2026-05-21T10:00:00.000Z"
        });

        expect(result.status).toBe(200);
        expect(store.transactions).toHaveLength(0);
        expect(result.body.replyText).toMatch(/analisis.*gangguan|AI.*gangguan|layanan AI/i);
    });
});