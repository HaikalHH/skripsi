import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const store = {
    transactions: [] as any[]
  };

  const prismaMock = {
    transaction: {
      findMany: vi.fn(async ({ where }: any) =>
        store.transactions.filter((transaction) => {
          if (where?.userId && transaction.userId !== where.userId) return false;
          if (where?.type && transaction.type !== where.type) return false;
          if (where?.occurredAt?.gte && transaction.occurredAt < where.occurredAt.gte) return false;
          if (where?.occurredAt?.lte && transaction.occurredAt > where.occurredAt.lte) return false;
          return true;
        })
      )
    }
  };

  return { store, prismaMock };
});

vi.mock("@/lib/prisma", () => ({
  prisma: hoisted.prismaMock
}));

import { generateUserFinancialAdvice } from "@/lib/services/assistant/advice-service";

describe("advice service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T12:00:00.000Z"));
    hoisted.store.transactions = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds purchase advice from actual monthly transactions with whole-rupiah formatting", async () => {
    hoisted.store.transactions = [
      {
        id: "tx_income",
        userId: "user_1",
        type: "INCOME",
        amount: 10000000,
        category: "Salary",
        occurredAt: new Date("2026-03-01T09:00:00.000Z")
      },
      {
        id: "tx_food",
        userId: "user_1",
        type: "EXPENSE",
        amount: 1650000,
        category: "Food & Drink",
        occurredAt: new Date("2026-03-05T09:00:00.000Z")
      },
      {
        id: "tx_bills",
        userId: "user_1",
        type: "EXPENSE",
        amount: 1200000,
        category: "Bills",
        occurredAt: new Date("2026-03-07T09:00:00.000Z")
      },
      {
        id: "tx_entertainment",
        userId: "user_1",
        type: "EXPENSE",
        amount: 1450000,
        category: "Entertainment",
        occurredAt: new Date("2026-03-10T09:00:00.000Z")
      }
    ];

    const reply = await generateUserFinancialAdvice("user_1", "boleh beli hp 3000000 bulan ini?");

    expect(reply).toContain("Deskriptif: Bulan ini pemasukan kamu Rp. 10.000.000, pengeluaran Rp. 4.300.000, jadi saldo tersisa Rp. 5.700.000.");
    expect(reply).toContain(
      "Diagnostik: Pengeluaran terbesar ada di kategori Food & Drink sebesar Rp. 1.650.000"
    );
    expect(reply).toContain(
      "Estimasi kebutuhan wajib saat ini Rp. 2.850.000, dibaca dari transaksi aktual kategori Bills dan Food & Drink bulan ini."
    );
    expect(reply).toContain(
      "Preskriptif: Pembelian Rp. 3.000.000 sebaiknya ditunda. Ruang belanja aman kamu saat ini Rp. 2.850.000, dihitung dari sisa saldo Rp. 5.700.000 dikurangi estimasi kebutuhan wajib Rp. 2.850.000."
    );
    expect(reply).not.toMatch(/Rp\. [\d.]+,\d+/);
  });

  it("asks for more transaction data when current month data is incomplete", async () => {
    hoisted.store.transactions = [
      {
        id: "tx_expense",
        userId: "user_1",
        type: "EXPENSE",
        amount: 250000,
        category: "Entertainment",
        occurredAt: new Date("2026-03-08T09:00:00.000Z")
      }
    ];

    const reply = await generateUserFinancialAdvice("user_1", "aku boros gak bulan ini?");

    expect(reply).toBe(
      "Pemasukan bulan ini belum tercatat, jadi /advice belum bisa menghitung sisa saldo dan ruang belanja aman dengan akurat."
    );
  });
});
