import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  processInboundBody: vi.fn(),
  downloadWhatsAppMediaAsBase64: vi.fn(),
  sendWhatsAppReplyPayload: vi.fn(),
  sendWhatsAppTextMessage: vi.fn(),
  verifyWhatsAppWebhookSignature: vi.fn(),
  isWhatsAppPairRateLimitError: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn()
}));

vi.mock("@/lib/env", () => ({
  env: {
    WHATSAPP_BUSINESS_ACCOUNT_ID: "",
    WHATSAPP_PHONE_NUMBER_ID: "1234567890",
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: "verify-token"
  }
}));

vi.mock("@/lib/features/inbound", () => ({
  processInboundBody: hoisted.processInboundBody
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: hoisted.loggerError,
    warn: hoisted.loggerWarn,
    info: hoisted.loggerInfo
  }
}));

vi.mock("@/lib/services/whatsapp/meta-service", () => ({
  downloadWhatsAppMediaAsBase64: hoisted.downloadWhatsAppMediaAsBase64,
  isWhatsAppPairRateLimitError: hoisted.isWhatsAppPairRateLimitError,
  sendWhatsAppReplyPayload: hoisted.sendWhatsAppReplyPayload,
  sendWhatsAppTextMessage: hoisted.sendWhatsAppTextMessage,
  verifyWhatsAppWebhookSignature: hoisted.verifyWhatsAppWebhookSignature
}));

import { POST } from "@/app/api/public/whatsapp/webhook/route";

const buildWebhookPayload = () => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba_1",
      changes: [
        {
          field: "messages",
          value: {
            metadata: {
              phone_number_id: "1234567890"
            },
            messages: [
              {
                id: "wamid.inbound.1",
                from: "6281275167471",
                timestamp: "1713976189",
                type: "text",
                text: {
                  body: "benar"
                }
              }
            ]
          }
        }
      ]
    }
  ]
});

describe("WhatsApp webhook route", () => {
  beforeEach(() => {
    hoisted.processInboundBody.mockReset();
    hoisted.downloadWhatsAppMediaAsBase64.mockReset();
    hoisted.sendWhatsAppReplyPayload.mockReset();
    hoisted.sendWhatsAppTextMessage.mockReset();
    hoisted.verifyWhatsAppWebhookSignature.mockReset();
    hoisted.isWhatsAppPairRateLimitError.mockReset();
    hoisted.loggerError.mockReset();
    hoisted.loggerWarn.mockReset();
    hoisted.loggerInfo.mockReset();

    hoisted.verifyWhatsAppWebhookSignature.mockReturnValue(true);
  });

  it("does not send a fallback reply when outbound send is pair-rate-limited", async () => {
    hoisted.processInboundBody.mockResolvedValue({
      body: {
        replyText: "Masih ada pengeluaran lain lagi Boss?"
      }
    });
    hoisted.sendWhatsAppReplyPayload.mockRejectedValue(
      new Error(
        'WhatsApp send message failed with status 400: {"error":{"message":"(#131056) (Business Account, Consumer Account) pair rate limit hit","code":131056}}'
      )
    );
    hoisted.isWhatsAppPairRateLimitError.mockReturnValue(true);

    const response = await POST(
      new Request("http://localhost/api/public/whatsapp/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": "sha256=test"
        },
        body: JSON.stringify(buildWebhookPayload())
      }) as any
    );

    expect(response.status).toBe(200);
    expect(hoisted.sendWhatsAppTextMessage).not.toHaveBeenCalled();
    expect(hoisted.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "6281275167471",
        messageType: "text"
      }),
      "WhatsApp reply throttled by pair rate limit"
    );
  });

  it("still sends the fallback reply when inbound processing fails", async () => {
    hoisted.processInboundBody.mockRejectedValue(new Error("processing failed"));
    hoisted.isWhatsAppPairRateLimitError.mockReturnValue(false);
    hoisted.sendWhatsAppTextMessage.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/public/whatsapp/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": "sha256=test"
        },
        body: JSON.stringify(buildWebhookPayload())
      }) as any
    );

    expect(response.status).toBe(200);
    expect(hoisted.sendWhatsAppTextMessage).toHaveBeenCalledWith({
      to: "6281275167471",
      body:
        "Maaf, saya belum bisa memproses pesan Anda sekarang. Coba lagi beberapa saat lagi atau ketik /help.",
      replyToMessageId: "wamid.inbound.1"
    });
  });
});
