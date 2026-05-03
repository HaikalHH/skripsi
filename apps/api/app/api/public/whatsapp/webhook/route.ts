import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processInboundBody } from "@/lib/features/inbound";
import { logger } from "@/lib/logger";
import {
  downloadWhatsAppMediaAsBase64,
  isWhatsAppPairRateLimitError,
  sendWhatsAppReplyPayload,
  sendWhatsAppTextMessage,
  verifyWhatsAppWebhookSignature
} from "@/lib/services/whatsapp/meta-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_TEXT =
  "Maaf, saya belum bisa memproses pesan Anda sekarang. Coba lagi beberapa saat lagi atau ketik /help.";

type WhatsAppWebhookMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: {
    body?: string;
  };
  image?: {
    id?: string;
    caption?: string;
    mime_type?: string;
  };
};

type WhatsAppWebhookChange = {
  field?: string;
  value?: {
    metadata?: {
      phone_number_id?: string;
    };
    messages?: WhatsAppWebhookMessage[];
  };
};

type WhatsAppWebhookEntry = {
  id?: string;
  changes?: WhatsAppWebhookChange[];
};

type WhatsAppWebhookPayload = {
  object?: string;
  entry?: WhatsAppWebhookEntry[];
};

const toIsoString = (timestamp: string | undefined) => {
  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return new Date().toISOString();
  }

  return new Date(parsed * 1000).toISOString();
};

const shouldHandleEntry = (entryId: string | undefined) => {
  const expectedWabaId = env.WHATSAPP_BUSINESS_ACCOUNT_ID.trim();
  return !expectedWabaId || !entryId || entryId === expectedWabaId;
};

const shouldHandleChange = (phoneNumberId: string | undefined) => {
  const expectedPhoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID.trim();
  return !expectedPhoneNumberId || !phoneNumberId || phoneNumberId === expectedPhoneNumberId;
};

const processWebhookMessage = async (message: WhatsAppWebhookMessage) => {
  const from = message.from?.trim();
  if (!from) {
    return;
  }

  try {
    if (message.type === "text") {
      const result = await processInboundBody({
        waNumber: from,
        messageType: "TEXT",
        text: message.text?.body ?? "",
        sentAt: toIsoString(message.timestamp)
      });

      await sendWhatsAppReplyPayload({
        to: from,
        payload: result.body,
        replyToMessageId: message.id
      });
      return;
    }

    if (message.type === "image" && message.image?.id) {
      const media = await downloadWhatsAppMediaAsBase64(message.image.id);
      const result = await processInboundBody({
        waNumber: from,
        messageType: "IMAGE",
        caption: message.image.caption ?? "",
        mimeType: media.mimeType || message.image.mime_type,
        imageBase64: media.base64,
        sentAt: toIsoString(message.timestamp)
      });

      await sendWhatsAppReplyPayload({
        to: from,
        payload: result.body,
        replyToMessageId: message.id
      });
      return;
    }

    logger.info({ messageType: message.type, from }, "Ignoring unsupported WhatsApp message type");
  } catch (error) {
    if (isWhatsAppPairRateLimitError(error)) {
      logger.warn(
        { err: error, from, messageType: message.type },
        "WhatsApp reply throttled by pair rate limit"
      );
      return;
    }

    const errorMessage =
      error instanceof Error ? error.message : typeof error === "string" ? error : "";
    const isOutboundSendFailure = /WhatsApp (?:send message|upload media)/i.test(errorMessage);

    logger.error(
      { err: error, from, messageType: message.type },
      isOutboundSendFailure
        ? "Failed to send WhatsApp reply payload"
        : "WhatsApp webhook processing failed"
    );

    if (isOutboundSendFailure) {
      return;
    }

    await sendWhatsAppTextMessage({
      to: from,
      body: FALLBACK_TEXT,
      replyToMessageId: message.id
    }).catch((sendError) => {
      logger.error({ err: sendError, from }, "Failed to send WhatsApp fallback reply");
    });
  }
};

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge") ?? "";

  if (mode === "subscribe" && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }

  return NextResponse.json({ ok: false, error: "Webhook verification failed" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyWhatsAppWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ ok: false, error: "Invalid webhook signature" }, { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  if (payload.object !== "whatsapp_business_account") {
    return NextResponse.json({ ok: false, error: "Unsupported webhook object" }, { status: 400 });
  }

  for (const entry of payload.entry ?? []) {
    if (!shouldHandleEntry(entry.id)) {
      continue;
    }

    for (const change of entry.changes ?? []) {
      if (change.field !== "messages" || !shouldHandleChange(change.value?.metadata?.phone_number_id)) {
        continue;
      }

      for (const message of change.value?.messages ?? []) {
        await processWebhookMessage(message);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
