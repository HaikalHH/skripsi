import { forwardInboundMessage, sendInboundReplyPayload } from "../api/inbound";
import { logger } from "../logger";
import {
  checkWhatsAppRegistration,
  parseJidParts,
  parsePhoneCandidateFromText,
  normalizeWaNumber,
  rememberLidMapping,
  resolveInboundIdentity
} from "./lid-map";
import { downloadImageAsBase64 } from "./media";
import type { BotSocket } from "./types";

const extractTextMessage = (message: any): string | undefined =>
  message?.conversation ?? message?.extendedTextMessage?.text;

const extractPhoneFromMessageMetadata = (msg: any): string | null => {
  const candidates = [
    msg?.key?.participant,
    msg?.participant,
    msg?.message?.protocolMessage?.key?.participant,
    msg?.message?.protocolMessage?.key?.remoteJid,
    msg?.message?.extendedTextMessage?.contextInfo?.participant,
    msg?.message?.extendedTextMessage?.contextInfo?.remoteJid
  ];

  for (const candidate of candidates) {
    const normalized = normalizeWaNumber(candidate ?? "");
    if (normalized && normalized.startsWith("62")) {
      return normalized;
    }
  }

  return null;
};

export const processIncomingMessage = async (sock: BotSocket, msg: any) => {
  const remoteJid = msg.key?.remoteJid as string | undefined;
  if (!remoteJid) return;
  if (remoteJid.endsWith("@g.us")) return;
  if (msg.key?.fromMe) return;

  const plainText = extractTextMessage(msg.message);
  const imageMessage = msg.message?.imageMessage;

  const remote = parseJidParts(remoteJid);
  const phoneFromText = plainText ? parsePhoneCandidateFromText(plainText) : null;
  if (remote?.server === "lid" && phoneFromText?.startsWith("62")) {
    rememberLidMapping(`${remote.user}@lid`, `${phoneFromText}@s.whatsapp.net`);
  }
  const fallbackPhone = extractPhoneFromMessageMetadata(msg);
  if (remote?.server === "lid" && fallbackPhone) {
    rememberLidMapping(`${remote.user}@lid`, `${fallbackPhone}@s.whatsapp.net`);
  }

  const identity = await resolveInboundIdentity(sock, remoteJid);
  const waNumber = identity.waNumber;
  if (!waNumber) return;

  if (!plainText && !imageMessage) return;

  try {
    const payload: Record<string, unknown> = {
      waNumber,
      sentAt: new Date().toISOString()
    };
    if (identity.waLid) {
      payload.waLid = identity.waLid;
    }
    if (phoneFromText) {
      payload.phoneInput = phoneFromText;
      const registered = await checkWhatsAppRegistration(sock, phoneFromText);
      if (typeof registered === "boolean") {
        payload.phoneInputRegistered = registered;
      }
    }

    if (plainText) {
      payload.messageType = "TEXT";
      payload.text = plainText;
    } else if (imageMessage) {
      payload.messageType = "IMAGE";
      payload.caption = imageMessage.caption ?? "";
      payload.mimeType = imageMessage.mimetype;
      payload.imageBase64 = await downloadImageAsBase64(sock, msg);
    }

    const response = await forwardInboundMessage(payload);
    if (!response.ok) {
      logger.error({ status: response.status, text: response.text }, "Inbound API failed");
      await sock.sendMessage(remoteJid, {
        text: "Maaf, layanan sedang gangguan. Coba lagi beberapa saat."
      });
      return;
    }

    await sendInboundReplyPayload(sock, remoteJid, response.payload);
  } catch (error) {
    logger.error({ err: error }, "Failed to process incoming message");
    await sock.sendMessage(remoteJid, {
      text: "Terjadi error saat memproses pesan. Coba ketik /help."
    });
  }
};
