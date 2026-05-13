import { env, inboundResponseSchema, type InboundResponsePayload } from "../config";
import type { BotSocket } from "../whatsapp/types";

export const forwardInboundMessage = async (payload: Record<string, unknown>) => {
  const response = await fetch(`${env.API_BASE_URL}/api/bot/inbound`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status,
      text: await response.text()
    };
  }

  return {
    ok: true as const,
    payload: inboundResponseSchema.parse(await response.json())
  };
};

export const sendInboundReplyPayload = async (
  sock: BotSocket,
  remoteJid: string,
  payload: InboundResponsePayload
) => {
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
    await sock.sendMessage(remoteJid, { text: replyText });
  }

  if (payload.imageBase64) {
    await sock.sendMessage(remoteJid, {
      image: Buffer.from(payload.imageBase64, "base64"),
      mimetype: payload.imageMimeType ?? "image/png",
      caption: "Report chart"
    });
  }

  if (payload.documentBase64) {
    await sock.sendMessage(remoteJid, {
      document: Buffer.from(payload.documentBase64, "base64"),
      mimetype: payload.documentMimeType ?? "application/pdf",
      fileName: payload.documentFileName ?? "report.pdf"
    });
  }
};
