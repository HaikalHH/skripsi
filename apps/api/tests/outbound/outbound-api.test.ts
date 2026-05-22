import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const hoisted = vi.hoisted(() => {
  const store = {
    outboundMessages: [] as any[]
  };

  const prismaMock: any = {
    outboundMessage: {
      findMany: async ({ where, orderBy, take }: any) => {
        let rows = [...store.outboundMessages];
        if (where?.status) {
          rows = rows.filter((item) => item.status === where.status);
        }
        if (orderBy?.createdAt === "asc") {
          rows = rows.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
        }
        if (typeof take === "number") rows = rows.slice(0, take);
        return rows;
      },
      updateMany: async ({ where, data }: any) => {
        const ids = new Set(where?.id?.in ?? []);
        let count = 0;
        for (const row of store.outboundMessages) {
          if (!ids.has(row.id)) continue;
          Object.assign(row, data, { updatedAt: new Date("2026-02-24T12:00:00.000Z") });
          count += 1;
        }
        return { count };
      },
      update: async ({ where, data }: any) => {
        const row = store.outboundMessages.find((item) => item.id === where.id);
        if (!row) throw new Error("Outbound message not found");
        Object.assign(row, data, { updatedAt: new Date("2026-02-24T12:00:00.000Z") });
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

vi.mock("@/lib/env", () => ({
  env: {
    BOT_INTERNAL_TOKEN: "test-bot-token"
  }
}));

vi.mock("@/lib/prisma", () => ({
  prisma: hoisted.prismaMock
}));

import { GET } from "@/lib/http/bot/outbound/route-handlers";
import { POST as ACK_POST } from "@/lib/http/bot/outbound/ack/route-handlers";

const store = hoisted.store;

const seedPendingOutboundMessages = (count: number) => {
  store.outboundMessages = Array.from({ length: count }, (_, index) => ({
    id: `out_${index + 1}`,
    userId: "user_1",
    waNumber: "6281110001",
    messageText: `Reminder test ${index + 1}`,
    status: "PENDING",
    errorMessage: null,
    sentAt: null,
    createdAt: new Date(`2026-02-24T12:${String(index).padStart(2, "0")}:00.000Z`),
    updatedAt: new Date(`2026-02-24T12:${String(index).padStart(2, "0")}:00.000Z`)
  }));
};

const buildOutboundMessage = (params: {
  id: string;
  status: "PENDING" | "PROCESSING" | "SENT" | "FAILED";
  createdAt: Date;
  errorMessage?: string | null;
  sentAt?: Date | null;
}) => ({
  id: params.id,
  userId: "user_1",
  waNumber: "6281110001",
  messageText: `Reminder test ${params.id}`,
  status: params.status,
  errorMessage: params.errorMessage ?? null,
  sentAt: params.sentAt ?? null,
  createdAt: params.createdAt,
  updatedAt: params.createdAt
});

describe("outbound API", () => {
  beforeEach(() => {
    store.outboundMessages = [];
  });

  it("TC-252 claims max 5 pending messages when poll limit is omitted", async () => {
    seedPendingOutboundMessages(6);

    const request = new NextRequest("http://localhost/api/bot/outbound", {
      headers: {
        "x-bot-token": "test-bot-token"
      }
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.messages).toHaveLength(5);
    expect(body.messages.map((item: { id: string }) => item.id)).toEqual([
      "out_1",
      "out_2",
      "out_3",
      "out_4",
      "out_5"
    ]);
    expect(store.outboundMessages.filter((item) => item.status === "PROCESSING")).toHaveLength(5);
    expect(store.outboundMessages.find((item) => item.id === "out_6")?.status).toBe("PENDING");
  });
});


describe("outbound API", () => {
  beforeEach(() => {
    store.outboundMessages = [];
  });

  it("TC-253 claims max 20 pending messages when poll limit is 20", async () => {
    seedPendingOutboundMessages(21);

    const request = new NextRequest("http://localhost:3001/api/bot/outbound?limit=20", {
      headers: {
        "x-bot-token": "test-bot-token"
      }
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.messages).toHaveLength(20);
    expect(body.messages.map((item: { id: string }) => item.id)).toEqual([
      "out_1",
      "out_2",
      "out_3",
      "out_4",
      "out_5",
      "out_6",
      "out_7",
      "out_8",
      "out_9",
      "out_10",
      "out_11",
      "out_12",
      "out_13",
      "out_14",
      "out_15",
      "out_16",
      "out_17",
      "out_18",
      "out_19",
      "out_20"
    ]);
    expect(store.outboundMessages.filter((item) => item.status === "PROCESSING")).toHaveLength(20);
    expect(store.outboundMessages.find((item) => item.id === "out_21")?.status).toBe("PENDING");
  });

  it("TC-254 rejects poll limit greater than 20", async () => {
    seedPendingOutboundMessages(1);

    const request = new NextRequest("http://localhost:3001/api/bot/outbound?limit=100", {
      headers: {
        "x-bot-token": "test-bot-token"
      }
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid query");
    expect(body.issues[0]?.path).toEqual(["limit"]);
    expect(store.outboundMessages[0]?.status).toBe("PENDING");
  });

  it("TC-255 claims 3 pending messages and marks them processing", async () => {
    seedPendingOutboundMessages(3);

    const request = new NextRequest("http://localhost:3001/api/bot/outbound", {
      headers: {
        "x-bot-token": "test-bot-token"
      }
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.messages).toHaveLength(3);
    expect(body.messages.map((item: { id: string }) => item.id)).toEqual(["out_1", "out_2", "out_3"]);
    expect(store.outboundMessages.every((item) => item.status === "PROCESSING")).toBe(true);
  });

  it("TC-256 does not claim sent outbound messages", async () => {
    store.outboundMessages = [
      buildOutboundMessage({
        id: "out_sent",
        status: "SENT",
        sentAt: new Date("2026-02-24T11:00:00.000Z"),
        createdAt: new Date("2026-02-24T11:00:00.000Z")
      }),
      buildOutboundMessage({
        id: "out_pending_1",
        status: "PENDING",
        createdAt: new Date("2026-02-24T12:00:00.000Z")
      }),
      buildOutboundMessage({
        id: "out_pending_2",
        status: "PENDING",
        createdAt: new Date("2026-02-24T12:01:00.000Z")
      })
    ];

    const request = new NextRequest("http://localhost:3001/api/bot/outbound", {
      headers: {
        "x-bot-token": "test-bot-token"
      }
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.messages.map((item: { id: string }) => item.id)).toEqual([
      "out_pending_1",
      "out_pending_2"
    ]);
    expect(store.outboundMessages.find((item) => item.id === "out_sent")?.status).toBe("SENT");
    expect(store.outboundMessages.find((item) => item.id === "out_pending_1")?.status).toBe("PROCESSING");
    expect(store.outboundMessages.find((item) => item.id === "out_pending_2")?.status).toBe("PROCESSING");
  });

  it("TC-257 rejects outbound ACK without token", async () => {
    store.outboundMessages = [
      buildOutboundMessage({
        id: "out_ack",
        status: "PROCESSING",
        createdAt: new Date("2026-02-24T12:00:00.000Z")
      })
    ];

    const request = new NextRequest("http://localhost:3001/api/bot/outbound/ack", {
      method: "POST",
      body: JSON.stringify({
        id: "out_ack",
        status: "SENT"
      })
    });

    const response = await ACK_POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(store.outboundMessages[0]?.status).toBe("PROCESSING");
    expect(store.outboundMessages[0]?.sentAt).toBeNull();
  });

  it("TC-258 marks outbound ACK as sent and fills sentAt", async () => {
    store.outboundMessages = [
      buildOutboundMessage({
        id: "out_ack_sent",
        status: "PROCESSING",
        createdAt: new Date("2026-02-24T12:00:00.000Z")
      })
    ];

    const request = new NextRequest("http://localhost:3001/api/bot/outbound/ack", {
      method: "POST",
      headers: {
        "x-bot-token": "test-bot-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        id: "out_ack_sent",
        status: "SENT"
      })
    });

    const response = await ACK_POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(store.outboundMessages[0]?.status).toBe("SENT");
    expect(store.outboundMessages[0]?.sentAt).toBeInstanceOf(Date);
    expect(store.outboundMessages[0]?.errorMessage).toBeNull();
  });

  it("TC-259 marks outbound ACK as failed and stores error message", async () => {
    store.outboundMessages = [
      buildOutboundMessage({
        id: "out_ack_failed",
        status: "PROCESSING",
        createdAt: new Date("2026-02-24T12:00:00.000Z")
      })
    ];

    const request = new NextRequest("http://localhost:3001/api/bot/outbound/ack", {
      method: "POST",
      headers: {
        "x-bot-token": "test-bot-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        id: "out_ack_failed",
        status: "FAILED",
        errorMessage: "WA send failed"
      })
    });

    const response = await ACK_POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(store.outboundMessages[0]?.status).toBe("FAILED");
    expect(store.outboundMessages[0]?.sentAt).toBeNull();
    expect(store.outboundMessages[0]?.errorMessage).toBe("WA send failed");
  });

  it("TC-260 rejects outbound ACK invalid status", async () => {
    store.outboundMessages = [
      buildOutboundMessage({
        id: "out_ack_invalid",
        status: "PROCESSING",
        createdAt: new Date("2026-02-24T12:00:00.000Z")
      })
    ];

    const request = new NextRequest("http://localhost:3001/api/bot/outbound/ack", {
      method: "POST",
      headers: {
        "x-bot-token": "test-bot-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        id: "out_ack_invalid",
        status: "DONE"
      })
    });

    const response = await ACK_POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid payload");
    expect(body.issues[0]?.path).toEqual(["status"]);
    expect(store.outboundMessages[0]?.status).toBe("PROCESSING");
  });
});
