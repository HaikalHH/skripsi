import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  transactions: [] as Array<{
    id: string;
    userId: string;
    amount: number;
    category: string;
    merchant: string | null;
    rawText: string | null;
    occurredAt: Date;
    createdAt: Date;
  }>
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: {
      findMany: vi.fn(async ({ where, take }: any) => {
        let rows = hoisted.transactions.filter((row) => row.userId === where.userId);
        rows = rows.sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
        if (typeof take === "number") rows = rows.slice(0, take);
        return rows;
      }),
      delete: vi.fn(async ({ where }: any) => {
        const index = hoisted.transactions.findIndex((row) => row.id === where.id);
        if (index === -1) throw new Error("Transaction not found");
        const [deleted] = hoisted.transactions.splice(index, 1);
        return deleted;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = hoisted.transactions.find((item) => item.id === where.id);
        if (!row) throw new Error("Transaction not found");
        Object.assign(row, data);
        return row;
      })
    }
  }
}));

vi.mock("@/lib/services/planning/goal-service", () => ({
  refreshSavingsGoalProgress: vi.fn(async () => null)
}));

import {
  parseMutationCommand,
  tryHandleTransactionMutationCommand
} from "@/lib/services/transactions/transaction-mutation-command-service";

describe("transaction mutation command service", () => {
  beforeEach(() => {
    hoisted.transactions = [
      {
        id: "tx_1",
        userId: "user_1",
        amount: 50000,
        category: "Entertainment",
        merchant: "Spotify",
        rawText: "bayar spotify premium 50rb",
        occurredAt: new Date("2026-03-10T09:00:00.000Z"),
        createdAt: new Date("2026-03-10T09:00:00.000Z")
      },
      {
        id: "tx_2",
        userId: "user_1",
        amount: 75000,
        category: "Entertainment",
        merchant: "Spotify",
        rawText: "bayar spotify family 75rb",
        occurredAt: new Date("2026-03-08T09:00:00.000Z"),
        createdAt: new Date("2026-03-08T09:00:00.000Z")
      }
    ];
  });

  it("parses edit and delete mutation commands", () => {
    expect(parseMutationCommand("hapus transaksi spotify")).toEqual({
      kind: "DELETE",
      hint: "spotify"
    });
    expect(parseMutationCommand("ubah spotify jadi 20rb")).toEqual({
      kind: "EDIT",
      hint: "spotify",
      amount: 20000
    });
  });

  it("asks for clarification when the hint is ambiguous", async () => {
    const result = await tryHandleTransactionMutationCommand({
      userId: "user_1",
      text: "hapus transaksi spotify"
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toContain("beberapa transaksi yang mirip");
      expect(result.replyText).toContain("1. 10 Mar | Rp. 50.000,00 | Entertainment (Spotify)");
      expect(result.replyText).toContain("2. 8 Mar | Rp. 75.000,00 | Entertainment (Spotify)");
      expect(result.replyText).toContain("Balas nomor transaksi yang dimaksud");
    }
  });

  it("resolves a specific candidate when the hint carries amount and date context", async () => {
    const result = await tryHandleTransactionMutationCommand({
      userId: "user_1",
      text: "hapus transaksi 8 Mar | Rp. 75.000,00 | Entertainment (Spotify)"
    });

    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toContain("berhasil dihapus");
      expect(hoisted.transactions).toHaveLength(1);
      expect(hoisted.transactions[0]?.id).toBe("tx_1");
    }
  });
});

