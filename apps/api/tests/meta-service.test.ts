import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  fetchMock: vi.fn()
}));

vi.mock("@/lib/env", () => ({
  env: {
    WHATSAPP_GRAPH_API_BASE_URL: "https://graph.facebook.com",
    WHATSAPP_API_VERSION: "v23.0",
    WHATSAPP_ACCESS_TOKEN: "test_token",
    WHATSAPP_PHONE_NUMBER_ID: "1234567890",
    WHATSAPP_APP_SECRET: "",
    WHATSAPP_API_TIMEOUT_MS: 15_000,
    WHATSAPP_MEDIA_DOWNLOAD_TIMEOUT_MS: 30_000,
    PUBLIC_API_BASE_URL: ""
  }
}));

import {
  isWhatsAppPairRateLimitError,
  sendWhatsAppReplyPayload
} from "@/lib/services/whatsapp/meta-service";

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });

describe("WhatsApp reply payload", () => {
  beforeEach(() => {
    hoisted.fetchMock.mockReset();
    vi.stubGlobal("fetch", hoisted.fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("coalesces multiple text replies into one outbound message", async () => {
    hoisted.fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ messages: [{ id: "wamid.sent" }] })));

    await sendWhatsAppReplyPayload({
      to: "6281234567890",
      payload: {
        replyTexts: ["Bubble pertama", "Bubble kedua", "Bubble ketiga"]
      },
      replyToMessageId: "wamid.inbound.1"
    });

    expect(hoisted.fetchMock).toHaveBeenCalledTimes(1);

    const outboundBody = JSON.parse(String(hoisted.fetchMock.mock.calls[0]?.[1]?.body));

    expect(outboundBody.context).toEqual({ message_id: "wamid.inbound.1" });
    expect(outboundBody.text?.body).toContain("Bubble pertama");
    expect(outboundBody.text?.body).toContain("Bubble kedua");
    expect(outboundBody.text?.body).toContain("Bubble ketiga");
  });

  it("preserves separate text bubbles when the payload explicitly asks for it", async () => {
    hoisted.fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ messages: [{ id: "wamid.sent" }] })));

    await sendWhatsAppReplyPayload({
      to: "6281234567890",
      payload: {
        replyTexts: ["Bubble pertama", "Bubble kedua"],
        preserveReplyTextBubbles: true
      },
      replyToMessageId: "wamid.inbound.1"
    });

    expect(hoisted.fetchMock).toHaveBeenCalledTimes(2);

    const firstOutboundBody = JSON.parse(String(hoisted.fetchMock.mock.calls[0]?.[1]?.body));
    const secondOutboundBody = JSON.parse(String(hoisted.fetchMock.mock.calls[1]?.[1]?.body));

    expect(firstOutboundBody.context).toEqual({ message_id: "wamid.inbound.1" });
    expect(firstOutboundBody.text?.body).toContain("Bubble pertama");
    expect(secondOutboundBody.context).toBeUndefined();
    expect(secondOutboundBody.text?.body).toContain("Bubble kedua");
  });

  it("keeps reply context on the first outbound item when the payload starts with media", async () => {
    hoisted.fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "media_1" }))
      .mockResolvedValueOnce(jsonResponse({ messages: [{ id: "wamid.sent" }] }));

    await sendWhatsAppReplyPayload({
      to: "6281234567890",
      payload: {
        imageBase64: "aGVsbG8=",
        imageMimeType: "image/png"
      },
      replyToMessageId: "wamid.inbound.2"
    });

    expect(hoisted.fetchMock).toHaveBeenCalledTimes(2);

    const sendImageBody = JSON.parse(String(hoisted.fetchMock.mock.calls[1]?.[1]?.body));
    expect(sendImageBody.context).toEqual({ message_id: "wamid.inbound.2" });
  });

  it("detects pair-rate-limit transport errors from Meta", () => {
    const error = new Error(
      'WhatsApp send message failed with status 400: {"error":{"message":"(#131056) (Business Account, Consumer Account) pair rate limit hit","code":131056,"type":"OAuthException","error_data":{"details":"Message failed to send because there were too many messages sent from this phone number to the same phone number in a short period of time."}}}'
    );

    expect(isWhatsAppPairRateLimitError(error)).toBe(true);
  });
});
