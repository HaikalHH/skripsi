import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { applyBossFinanceEmojiStyle, styleBotReplyPayload } from "@/lib/services/messaging/bot-text-style-service";

export const WHATSAPP_WEBHOOK_PATH = "/api/public/whatsapp/webhook";

export type WhatsAppReplyPayload = {
  replyText?: string;
  replyTexts?: string[];
  preserveReplyTextBubbles?: boolean;
  imageBase64?: string;
  imageMimeType?: string;
  documentBase64?: string;
  documentMimeType?: string;
  documentFileName?: string;
};

const WHATSAPP_PAIR_RATE_LIMIT_CODE = 131056;

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");

const getWhatsAppAccessToken = () => {
  const token = env.WHATSAPP_ACCESS_TOKEN.trim();
  if (!token) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is not configured.");
  }

  return token;
};

const getWhatsAppPhoneNumberId = () => {
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID.trim();
  if (!phoneNumberId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID is not configured.");
  }

  return phoneNumberId;
};

const buildGraphUrl = (path: string) =>
  `${normalizeBaseUrl(env.WHATSAPP_GRAPH_API_BASE_URL)}/${env.WHATSAPP_API_VERSION}/${path.replace(/^\/+/, "")}`;

const createTimeoutSignal = (timeoutMs: number) => AbortSignal.timeout(timeoutMs);

const createAuthHeaders = () => ({
  Authorization: `Bearer ${getWhatsAppAccessToken()}`
});

const parseJsonResponse = async <T>(response: Response) => {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  return JSON.parse(text) as T;
};

const assertOkResponse = async (response: Response, label: string) => {
  if (response.ok) {
    return;
  }

  const text = await response.text();
  throw new Error(`${label} failed with status ${response.status}: ${text}`);
};

const extractWhatsAppErrorCode = (message: string) => {
  const jsonCodeMatch = message.match(/"code":\s*(\d+)/);
  if (jsonCodeMatch) {
    return Number(jsonCodeMatch[1]);
  }

  const prefixedCodeMatch = message.match(/\(#(\d+)\)/);
  if (prefixedCodeMatch) {
    return Number(prefixedCodeMatch[1]);
  }

  return null;
};

export const isWhatsAppPairRateLimitError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message;
  return (
    extractWhatsAppErrorCode(message) === WHATSAPP_PAIR_RATE_LIMIT_CODE ||
    /pair rate limit hit/i.test(message) ||
    /too many messages sent from this phone number to the same phone number/i.test(message)
  );
};

export const getWhatsAppWebhookCallbackUrl = () =>
  env.PUBLIC_API_BASE_URL
    ? `${normalizeBaseUrl(env.PUBLIC_API_BASE_URL)}${WHATSAPP_WEBHOOK_PATH}`
    : WHATSAPP_WEBHOOK_PATH;

export const verifyWhatsAppWebhookSignature = (
  rawBody: string,
  signatureHeader: string | null
) => {
  const appSecret = env.WHATSAPP_APP_SECRET.trim();
  if (!appSecret) {
    return true;
  }

  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expected = Buffer.from(
    `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`,
    "utf8"
  );
  const actual = Buffer.from(signatureHeader, "utf8");

  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

const sendWhatsAppMessage = async (body: Record<string, unknown>) => {
  const response = await fetch(buildGraphUrl(`${getWhatsAppPhoneNumberId()}/messages`), {
    method: "POST",
    headers: {
      ...createAuthHeaders(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      ...body
    }),
    signal: createTimeoutSignal(env.WHATSAPP_API_TIMEOUT_MS)
  });

  await assertOkResponse(response, "WhatsApp send message");
  return parseJsonResponse<Record<string, unknown>>(response);
};

export const sendWhatsAppTextMessage = async (params: {
  to: string;
  body: string;
  replyToMessageId?: string;
}) => {
  const body = applyBossFinanceEmojiStyle(params.body).trim();
  if (!body) {
    return null;
  }

  return sendWhatsAppMessage({
    to: params.to,
    type: "text",
    context: params.replyToMessageId ? { message_id: params.replyToMessageId } : undefined,
    text: {
      body,
      preview_url: false
    }
  });
};

const uploadWhatsAppMedia = async (params: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}) => {
  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append(
    "file",
    new Blob([Uint8Array.from(params.buffer)], { type: params.mimeType }),
    params.fileName
  );

  const response = await fetch(buildGraphUrl(`${getWhatsAppPhoneNumberId()}/media`), {
    method: "POST",
    headers: createAuthHeaders(),
    body: formData,
    signal: createTimeoutSignal(env.WHATSAPP_API_TIMEOUT_MS)
  });

  await assertOkResponse(response, "WhatsApp upload media");
  const payload = await parseJsonResponse<{ id?: string }>(response);
  if (!payload.id) {
    throw new Error("WhatsApp upload media did not return a media id.");
  }

  return payload.id;
};

export const sendWhatsAppImageMessage = async (params: {
  to: string;
  imageBase64: string;
  mimeType?: string;
  caption?: string;
  replyToMessageId?: string;
}) => {
  const mediaId = await uploadWhatsAppMedia({
    buffer: Buffer.from(params.imageBase64, "base64"),
    mimeType: params.mimeType ?? "image/png",
    fileName: "report.png"
  });

  return sendWhatsAppMessage({
    to: params.to,
    type: "image",
    context: params.replyToMessageId ? { message_id: params.replyToMessageId } : undefined,
    image: {
      id: mediaId,
      caption: params.caption ? applyBossFinanceEmojiStyle(params.caption).trim() : undefined
    }
  });
};

export const sendWhatsAppDocumentMessage = async (params: {
  to: string;
  documentBase64: string;
  mimeType?: string;
  fileName?: string;
  replyToMessageId?: string;
}) => {
  const fileName = params.fileName?.trim() || "report.pdf";
  const mediaId = await uploadWhatsAppMedia({
    buffer: Buffer.from(params.documentBase64, "base64"),
    mimeType: params.mimeType ?? "application/pdf",
    fileName
  });

  return sendWhatsAppMessage({
    to: params.to,
    type: "document",
    context: params.replyToMessageId ? { message_id: params.replyToMessageId } : undefined,
    document: {
      id: mediaId,
      filename: fileName
    }
  });
};

export const sendWhatsAppReplyPayload = async (params: {
  to: string;
  payload: WhatsAppReplyPayload;
  replyToMessageId?: string;
}) => {
  const payload = styleBotReplyPayload(params.payload);
  let remainingReplyToMessageId = params.replyToMessageId;
  const takeReplyToMessageId = () => {
    const replyToMessageId = remainingReplyToMessageId;
    remainingReplyToMessageId = undefined;
    return replyToMessageId;
  };

  const replyTexts =
    payload.replyTexts?.map((item) => item.trim()).filter(Boolean) ??
    (payload.replyText?.trim() ? [payload.replyText.trim()] : []);
  const outboundReplyTexts =
    payload.preserveReplyTextBubbles === true
      ? replyTexts
      : replyTexts.length > 1
        ? [replyTexts.join("\n\n")]
        : replyTexts;

  for (const replyText of outboundReplyTexts) {
    await sendWhatsAppTextMessage({
      to: params.to,
      body: replyText,
      replyToMessageId: takeReplyToMessageId()
    });
  }

  if (payload.imageBase64) {
    await sendWhatsAppImageMessage({
      to: params.to,
      imageBase64: payload.imageBase64,
      mimeType: payload.imageMimeType,
      caption: "Report chart",
      replyToMessageId: takeReplyToMessageId()
    });
  }

  if (payload.documentBase64) {
    await sendWhatsAppDocumentMessage({
      to: params.to,
      documentBase64: payload.documentBase64,
      mimeType: payload.documentMimeType,
      fileName: payload.documentFileName,
      replyToMessageId: takeReplyToMessageId()
    });
  }
};

export const downloadWhatsAppMediaAsBase64 = async (mediaId: string) => {
  const metadataResponse = await fetch(buildGraphUrl(mediaId), {
    headers: createAuthHeaders(),
    signal: createTimeoutSignal(env.WHATSAPP_MEDIA_DOWNLOAD_TIMEOUT_MS)
  });

  await assertOkResponse(metadataResponse, "WhatsApp get media metadata");
  const metadata = await parseJsonResponse<{ url?: string; mime_type?: string }>(metadataResponse);
  if (!metadata.url) {
    throw new Error("WhatsApp media metadata did not include a download URL.");
  }

  const mediaResponse = await fetch(metadata.url, {
    headers: createAuthHeaders(),
    signal: createTimeoutSignal(env.WHATSAPP_MEDIA_DOWNLOAD_TIMEOUT_MS)
  });

  await assertOkResponse(mediaResponse, "WhatsApp download media");
  const buffer = Buffer.from(await mediaResponse.arrayBuffer());

  return {
    base64: buffer.toString("base64"),
    mimeType:
      metadata.mime_type ??
      mediaResponse.headers.get("content-type") ??
      "application/octet-stream"
  };
};
