import "dotenv/config";
import { Boom } from "@hapi/boom";
import {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { z } from "zod";
import { logger } from "./logger";

const envSchema = z.object({
  API_BASE_URL: z.string().url(),
  BAILEYS_AUTH_DIR: z.string().default(".baileys_auth"),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  OUTBOUND_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  BOT_INTERNAL_TOKEN: z.string().min(8)
});

const env = envSchema.parse(process.env);

const inboundResponseSchema = z.object({
  replyText: z.string(),
  imageBase64: z.string().optional(),
  imageMimeType: z.string().optional()
});

const outboundClaimSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      waNumber: z.string(),
      messageText: z.string()
    })
  )
});

let heartbeatTimer: NodeJS.Timeout | null = null;
let outboundPollTimer: NodeJS.Timeout | null = null;

const sendHeartbeat = async () => {
  try {
    await fetch(`${env.API_BASE_URL}/api/bot/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceName: "bot" })
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to send heartbeat");
  }
};

const startHeartbeat = () => {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(sendHeartbeat, env.HEARTBEAT_INTERVAL_MS);
  void sendHeartbeat();
};

const ackOutboundMessage = async (
  id: string,
  status: "SENT" | "FAILED",
  errorMessage?: string
) => {
  try {
    await fetch(`${env.API_BASE_URL}/api/bot/outbound/ack`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-token": env.BOT_INTERNAL_TOKEN
      },
      body: JSON.stringify({ id, status, errorMessage })
    });
  } catch (error) {
    logger.warn({ err: error, id }, "Failed to ack outbound message");
  }
};

const pollOutboundMessages = async (sock: ReturnType<typeof makeWASocket>) => {
  try {
    const response = await fetch(`${env.API_BASE_URL}/api/bot/outbound?limit=5`, {
      headers: {
        "x-bot-token": env.BOT_INTERNAL_TOKEN
      }
    });

    if (!response.ok) {
      const text = await response.text();
      logger.warn({ status: response.status, text }, "Outbound polling failed");
      return;
    }

    const payload = outboundClaimSchema.parse(await response.json());
    for (const message of payload.messages) {
      const jid = `${message.waNumber}@s.whatsapp.net`;
      try {
        await sock.sendMessage(jid, { text: message.messageText });
        await ackOutboundMessage(message.id, "SENT");
      } catch (error) {
        await ackOutboundMessage(
          message.id,
          "FAILED",
          error instanceof Error ? error.message.slice(0, 180) : "Unknown send failure"
        );
      }
    }
  } catch (error) {
    logger.warn({ err: error }, "Failed to poll outbound messages");
  }
};

const startOutboundPolling = (sock: ReturnType<typeof makeWASocket>) => {
  if (outboundPollTimer) clearInterval(outboundPollTimer);
  outboundPollTimer = setInterval(() => {
    void pollOutboundMessages(sock);
  }, env.OUTBOUND_POLL_INTERVAL_MS);
  void pollOutboundMessages(sock);
};

const extractTextMessage = (message: any): string | undefined =>
  message?.conversation ?? message?.extendedTextMessage?.text;

const processIncomingMessage = async (sock: ReturnType<typeof makeWASocket>, msg: any) => {
  const remoteJid = msg.key?.remoteJid as string | undefined;
  if (!remoteJid) return;
  if (remoteJid.endsWith("@g.us")) return;
  if (msg.key?.fromMe) return;

  const waNumber = remoteJid.split("@")[0];
  const plainText = extractTextMessage(msg.message);
  const imageMessage = msg.message?.imageMessage;

  if (!plainText && !imageMessage) return;

  try {
    const payload: Record<string, unknown> = {
      waNumber,
      sentAt: new Date().toISOString()
    };

    if (plainText) {
      payload.messageType = "TEXT";
      payload.text = plainText;
    } else if (imageMessage) {
      payload.messageType = "IMAGE";
      payload.caption = imageMessage.caption ?? "";
      payload.mimeType = imageMessage.mimetype;

      const mediaBuffer = (await downloadMediaMessage(
        msg,
        "buffer",
        {},
        {
          logger: pino({ level: "silent" }),
          reuploadRequest: sock.updateMediaMessage
        }
      )) as Buffer;
      payload.imageBase64 = mediaBuffer.toString("base64");
    }

    const response = await fetch(`${env.API_BASE_URL}/api/bot/inbound`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error({ status: response.status, text }, "Inbound API failed");
      await sock.sendMessage(remoteJid, {
        text: "Maaf, layanan sedang gangguan. Coba lagi beberapa saat."
      });
      return;
    }

    const parsed = inboundResponseSchema.parse(await response.json());
    await sock.sendMessage(remoteJid, { text: parsed.replyText });

    if (parsed.imageBase64) {
      await sock.sendMessage(remoteJid, {
        image: Buffer.from(parsed.imageBase64, "base64"),
        mimetype: parsed.imageMimeType ?? "image/png",
        caption: "Report chart"
      });
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to process incoming message");
    await sock.sendMessage(remoteJid, {
      text: "Terjadi error saat memproses pesan. Coba ketik /help."
    });
  }
};

const startBot = async () => {
  const { state, saveCreds } = await useMultiFileAuthState(env.BAILEYS_AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      qrcode.generate(qr, { small: true });
      logger.info("Scan QR code above with WhatsApp Linked Devices");
    }

    if (connection === "open") {
      logger.info("WhatsApp bot connected");
      startHeartbeat();
      startOutboundPolling(sock);
    }

    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error as Boom | undefined)?.output?.statusCode !==
        DisconnectReason.loggedOut;
      logger.warn({ shouldReconnect }, "WhatsApp connection closed");
      if (outboundPollTimer) {
        clearInterval(outboundPollTimer);
        outboundPollTimer = null;
      }
      if (shouldReconnect) {
        setTimeout(() => {
          void startBot();
        }, 2000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      await processIncomingMessage(sock, msg);
    }
  });
};

void startBot();
