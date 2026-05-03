import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  inboundMessages: [] as Array<{
    id: string;
    userId: string;
    messageType: "TEXT";
    contentOrCaption: string;
    sentAt: Date;
  }>,
  outboundMessages: [] as Array<{
    id: string;
    userId: string;
    messageText: string;
    sentAt: Date | null;
    createdAt: Date;
  }>
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    messageLog: {
      findMany: vi.fn(async ({ where, take, select }: any) => {
        let rows = hoisted.inboundMessages.filter(
          (item) =>
            item.userId === where.userId &&
            item.messageType === where.messageType &&
            (!where.sentAt?.gte || item.sentAt >= where.sentAt.gte) &&
            (!where.id?.not || item.id !== where.id.not)
        );
        rows = rows.sort((left, right) => right.sentAt.getTime() - left.sentAt.getTime());
        if (typeof take === "number") rows = rows.slice(0, take);
        if (!select) return rows;
        return rows.map((row) => ({
          contentOrCaption: row.contentOrCaption,
          sentAt: row.sentAt
        }));
      })
    },
    outboundMessage: {
      findMany: vi.fn(async ({ where, take, select }: any) => {
        let rows = hoisted.outboundMessages.filter((item) => {
          if (item.userId !== where.userId) return false;
          if (!where.OR?.length) return true;

          return where.OR.some((condition: any) => {
            if (condition.sentAt?.gte) {
              return item.sentAt != null && item.sentAt >= condition.sentAt.gte;
            }

            if (condition.createdAt?.gte) {
              return item.createdAt >= condition.createdAt.gte;
            }

            return false;
          });
        });
        rows = rows.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
        if (typeof take === "number") rows = rows.slice(0, take);
        if (!select) return rows;
        return rows.map((row) => ({
          messageText: row.messageText,
          sentAt: row.sentAt,
          createdAt: row.createdAt
        }));
      })
    }
  }
}));

import { resolveConversationMemory } from "@/lib/services/assistant/conversation-memory-service";

describe("conversation memory service", () => {
  beforeEach(() => {
    hoisted.inboundMessages = [];
    hoisted.outboundMessages = [];
  });

  it("maps numeric option replies to the last assistant option label", async () => {
    const result = await resolveConversationMemory({
      userId: "user_1",
      text: "2",
      fallbackAssistantText: [
        "Apa tujuan utama kamu pakai AI Finance ini?",
        "",
        "Pilihan:",
        "1. Mengatur pengeluaran",
        "2. Nabung lebih disiplin"
      ].join("\n")
    });

    expect(result).toMatchObject({
      kind: "rewrite",
      effectiveText: "Nabung lebih disiplin"
    });
  });

  it("rebuilds transaction mutation intent when selecting an ambiguous transaction option", async () => {
    hoisted.inboundMessages = [
      {
        id: "msg_prev_mutation",
        userId: "user_1",
        messageType: "TEXT",
        contentOrCaption: "hapus transaksi spotify",
        sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
      }
    ];

    const result = await resolveConversationMemory({
      userId: "user_1",
      text: "2",
      fallbackAssistantText: [
        "Saya ketemu beberapa transaksi yang mirip untuk dihapus:",
        "1. 10 Mar | Rp50.000 | Entertainment (Spotify)",
        "2. 08 Mar | Rp75.000 | Entertainment (Spotify)",
        "Balas nomor transaksi yang dimaksud ya Boss."
      ].join("\n")
    });

    expect(result).toMatchObject({
      kind: "rewrite",
      effectiveText: "hapus transaksi 08 Mar | Rp75.000 | Entertainment (Spotify)"
    });
  });

  it("maps add-more follow up like 'yang itu aja' into a stop answer", async () => {
    const result = await resolveConversationMemory({
      userId: "user_1",
      text: "yang itu aja",
      fallbackAssistantText: "Ada lagi ga Boss?\n\nPilihan:\n1. Ada\n2. Ga ada"
    });

    expect(result).toMatchObject({
      kind: "rewrite",
      effectiveText: "Ga ada"
    });
  });

  it("rewrites short report follow-up using the previous safe user request", async () => {
    hoisted.inboundMessages = [
      {
        id: "msg_prev",
        userId: "user_1",
        messageType: "TEXT",
        contentOrCaption: "laporan minggu ini",
        sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
      }
    ];

    const result = await resolveConversationMemory({
      userId: "user_1",
      currentMessageId: "msg_current",
      text: "yang monthly juga"
    });

    expect(result).toMatchObject({
      kind: "rewrite",
      effectiveText: "laporan bulan ini"
    });
  });

  it("asks for clarification instead of replaying an unsafe transactional context", async () => {
    hoisted.inboundMessages = [
      {
        id: "msg_prev",
        userId: "user_1",
        messageType: "TEXT",
        contentOrCaption: "beli kopi 25 ribu",
        sentAt: new Date("2026-03-08T09:00:00.000Z")
      }
    ];

    const result = await resolveConversationMemory({
      userId: "user_1",
      currentMessageId: "msg_current",
      text: "yang tadi",
      fallbackAssistantText: "Transaksi berhasil dicatat - Tipe: EXPENSE - Amount: Rp25.000"
    });

    expect(result.kind).toBe("reply");
    if (result.kind === "reply") {
      expect(result.replyText.toLowerCase()).toContain("belum yakin konteks");
    }
  });

  it("ignores context older than 24 hours", async () => {
    hoisted.inboundMessages = [
      {
        id: "msg_old",
        userId: "user_1",
        messageType: "TEXT",
        contentOrCaption: "laporan minggu ini",
        sentAt: new Date(Date.now() - 48 * 60 * 60 * 1000)
      }
    ];

    const result = await resolveConversationMemory({
      userId: "user_1",
      currentMessageId: "msg_current",
      text: "yang monthly juga"
    });

    expect(result).toMatchObject({
      kind: "none",
      effectiveText: "yang monthly juga"
    });
  });

  it("rewrites category report follow-up using previous bucket context", async () => {
    hoisted.inboundMessages = [
      {
        id: "msg_prev_category",
        userId: "user_1",
        messageType: "TEXT",
        contentOrCaption: "detail entertainment bulan ini apa saja",
        sentAt: new Date(Date.now() - 60 * 60 * 1000)
      }
    ];

    const result = await resolveConversationMemory({
      userId: "user_1",
      currentMessageId: "msg_current",
      text: "yang spotify doang"
    });

    expect(result).toMatchObject({
      kind: "rewrite",
      effectiveText: "detail Entertainment yang spotify bulan ini"
    });
  });

  it("rewrites goal planner follow-up to priority mode", async () => {
    hoisted.inboundMessages = [
      {
        id: "msg_prev_goal_plan",
        userId: "user_1",
        messageType: "TEXT",
        contentOrCaption: "kalau fokus rumah dulu gimana",
        sentAt: new Date(Date.now() - 60 * 60 * 1000)
      }
    ];

    const result = await resolveConversationMemory({
      userId: "user_1",
      currentMessageId: "msg_current",
      text: "yang paling realistis aja"
    });

    expect(result).toMatchObject({
      kind: "rewrite",
      effectiveText: "target mana yang paling realistis dulu"
    });
  });

  it("rewrites cashflow follow-up while keeping the previous horizon", async () => {
    hoisted.inboundMessages = [
      {
        id: "msg_prev_cashflow",
        userId: "user_1",
        messageType: "TEXT",
        contentOrCaption: "aman sampai gajian gak",
        sentAt: new Date(Date.now() - 60 * 60 * 1000)
      }
    ];

    const result = await resolveConversationMemory({
      userId: "user_1",
      currentMessageId: "msg_current",
      text: "kalau bayar cicilan 1 juta?"
    });

    expect(result).toMatchObject({
      kind: "rewrite",
      effectiveText: "kalau bayar cicilan 1 juta aman sampai gajian gak"
    });
  });

  it("does not clarify explicit finance news requests just because there is prior assistant context", async () => {
    const result = await resolveConversationMemory({
      userId: "user_1",
      text: "berita finance hari ini",
      fallbackAssistantText:
        "Saya belum yakin konteks `yang tadi` itu yang mana, jadi saya belum mau asumsi."
    });

    expect(result).toMatchObject({
      kind: "none",
      effectiveText: "berita finance hari ini"
    });
  });
});

