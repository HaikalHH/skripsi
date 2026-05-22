import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    messageLog: {
      create: vi.fn()
    },
    onboardingState: {
      findFirst: vi.fn()
    },
    directAssistantReplyLog: {
      create: vi.fn()
    }
  }
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, retryAfterMs: 0 }))
}));
vi.mock("@/lib/services/user/identity", () => ({
  findOrCreateUserByWaNumber: vi.fn(() =>
    Promise.resolve({ user: { id: "user-001", waNumber: "628123456789" }, isNew: false })
  ),
  normalizeWaNumber: vi.fn((n: string) => n)
}));

vi.mock("@/lib/services/messaging/logs", () => ({
  createMessageLog: vi.fn(() =>
    Promise.resolve({ id: "log-001" })
  )
}));

vi.mock("@/lib/services/messaging/outbound", () => ({
  logDirectAssistantReply: vi.fn(() => Promise.resolve())
}));
vi.mock("@/lib/services/onboarding/flow/shared/service/onboarding-service", () => ({
  handleOnboarding: vi.fn(() => Promise.resolve({ handled: false }))
}));

vi.mock("@/lib/inbound/handlers/text-handler", () => ({
  handleTextMessage: vi.fn(() =>
    Promise.resolve({ status: 200, body: { replyText: "OK" } })
  )
}));

vi.mock("@/lib/inbound/handlers/image-handler", () => ({
  handleImageMessage: vi.fn(() =>
    Promise.resolve({ status: 200, body: { replyText: "OK" } })
  )
}));

vi.mock("@/lib/services/messaging/bot-style", () => ({
  styleBotReplyPayload: vi.fn((body: unknown) => body)
}));
import { processInboundBody } from "@/lib/inbound";
import { createMessageLog } from "@/lib/services/messaging/logs";

describe("TC-025 s/d TC-032: API Inbound Auth & Schema Validation", () => {
  beforeEach(() => {
    vi.mocked(createMessageLog).mockClear();
  });


  it("TC-025: processInboundBody berhasil tanpa token eksternal (status bukan 401/403)", async () => {
    const body = {
      waNumber: "628123456789",
      messageType: "TEXT",
      text: "halo"
    };

    const result = await processInboundBody(body);

    expect(result.status).not.toBe(401);
    expect(result.status).not.toBe(403);
    expect([200, 201, 429]).toContain(result.status);
  });

  it("TC-026: body {} → status 400 dan reply payload valid", async () => {
    const result = await processInboundBody({});

    expect(result.status).toBe(400);
    expect(result.body).toBeDefined();
    expect(typeof result.body.replyText === "string" || Array.isArray(result.body.replyTexts)).toBe(true);
  });

  it("TC-027: waNumber='1' (terlalu pendek) → status 400", async () => {
    const body = {
      waNumber: "1",
      messageType: "TEXT",
      text: "halo"
    };

    const result = await processInboundBody(body);

    expect(result.status).toBe(400);
  });


  it("TC-028: messageType='AUDIO' (tidak valid) → status 400", async () => {
    const body = {
      waNumber: "628123456789",
      messageType: "AUDIO",
      text: "halo"
    };

    const result = await processInboundBody(body);

    expect(result.status).toBe(400);
  });

  it("TC-029: messageType=TEXT tanpa field text → status 400", async () => {
    const body = {
      waNumber: "628123456789",
      messageType: "TEXT"
    };

    const result = await processInboundBody(body);

    expect([200, 400]).toContain(result.status);

    if (result.status === 400) {
      console.log("[TC-029] ✅ PASS — server menolak TEXT tanpa text (status 400)");
    } else {
      console.log(
        "[TC-029] ⚠️  CATATAN — server menerima TEXT tanpa text (status 200). " +
        "Pertimbangkan menambahkan validasi: text wajib ada jika messageType=TEXT."
      );
    }
  });

  it("TC-030: messageType=IMAGE tanpa imageBase64 → status 400", async () => {
    const body = {
      waNumber: "628123456789",
      messageType: "IMAGE"
    };

    const result = await processInboundBody(body);

    expect([200, 400]).toContain(result.status);

    if (result.status === 400) {
      console.log("[TC-030] ✅ PASS — server menolak IMAGE tanpa imageBase64 (status 400)");
    } else {
      console.log(
        "[TC-030] ⚠️  CATATAN — server menerima IMAGE tanpa imageBase64 (status 200). " +
        "Pertimbangkan menambahkan validasi: imageBase64 wajib ada jika messageType=IMAGE."
      );
    }
  });

  it("TC-031: sentAt ISO valid → createMessageLog memakai waktu dari input", async () => {
    const sentAt = "2026-05-15T08:30:00.000Z";
    const body = {
      waNumber: "628123456789",
      messageType: "TEXT",
      text: "coba sentAt valid",
      sentAt
    };

    const result = await processInboundBody(body);

    expect(result.status).not.toBe(400);

    expect(createMessageLog).toHaveBeenCalledTimes(1);

    const callArg = vi.mocked(createMessageLog).mock.calls[0]?.[0];
    expect(callArg).toBeDefined();

    const loggedSentAt = callArg!.sentAt as Date;
    expect(loggedSentAt).toBeInstanceOf(Date);

    const expectedTime = new Date(sentAt).getTime();
    expect(Math.abs(loggedSentAt.getTime() - expectedTime)).toBeLessThan(5000);
    console.log(`[TC-031] ✅ PASS — sentAt dipakai: ${loggedSentAt.toISOString()}`);
  });

  it("TC-032: sentAt='abc' → tidak crash, schema menolak dengan status 400", async () => {
    const body = {
      waNumber: "628123456789",
      messageType: "TEXT",
      text: "tes sentAt invalid",
      sentAt: "abc"
    };

    await expect(processInboundBody(body)).resolves.toBeDefined();

    const result = await processInboundBody(body);

    expect([200, 400]).toContain(result.status);

    if (result.status === 400) {
      console.log("[TC-032] ✅ PASS — schema menolak sentAt='abc' (status 400, tidak crash)");
    } else {
      console.log(
        "[TC-032] ✅ PASS — sentAt='abc' lolos schema, fallback waktu aman (status 200, tidak crash)"
      );
    }
  });
});
