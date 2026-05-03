import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Boom } from "@hapi/boom";
import {
  DisconnectReason,
  USyncQuery,
  USyncUser,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  jidDecode,
  jidNormalizedUser,
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
  REMINDER_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),
  BOT_INTERNAL_TOKEN: z.string().min(8)
});

const env = envSchema.parse(process.env);
const lidMapFilePath = resolve(env.BAILEYS_AUTH_DIR, "lid-phone-map.json");

const inboundResponseSchema = z.object({
  replyText: z.string().optional(),
  replyTexts: z.array(z.string()).optional(),
  preserveReplyTextBubbles: z.boolean().optional(),
  imageBase64: z.string().optional(),
  imageMimeType: z.string().optional(),
  documentBase64: z.string().optional(),
  documentMimeType: z.string().optional(),
  documentFileName: z.string().optional()
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

type InboundResponsePayload = z.infer<typeof inboundResponseSchema>;

let heartbeatTimer: NodeJS.Timeout | null = null;
let outboundPollTimer: NodeJS.Timeout | null = null;
let reminderSweepTimer: NodeJS.Timeout | null = null;
const lidToPhoneMap = new Map<string, string>();
const phoneToLidMap = new Map<string, string>();
const lidLookupCooldownMap = new Map<string, number>();
const LID_LOOKUP_COOLDOWN_MS = 60_000;
const lidNoPhoneAttrLogged = new Set<string>();
const waRegistrationCache = new Map<string, { exists: boolean; checkedAt: number }>();
const WA_REGISTRATION_CACHE_TTL_MS = 10 * 60_000;

const persistLidPhoneMap = async () => {
  try {
    await mkdir(env.BAILEYS_AUTH_DIR, { recursive: true });
    const entries = Array.from(lidToPhoneMap.entries()).map(([lid, phone]) => ({ lid, phone }));
    await writeFile(
      lidMapFilePath,
      JSON.stringify({ updatedAt: new Date().toISOString(), entries }, null, 2),
      "utf-8"
    );
  } catch (error) {
    logger.warn({ err: error }, "Failed to persist lid-phone map");
  }
};

const loadPersistedLidPhoneMap = async () => {
  try {
    const raw = await readFile(lidMapFilePath, "utf-8");
    const parsed = JSON.parse(raw) as { entries?: Array<{ lid?: string; phone?: string }> };
    for (const entry of parsed.entries ?? []) {
      const lid = (entry.lid ?? "").trim();
      const phone = normalizeWaNumber(entry.phone ?? "");
      if (!lid || !phone || !phone.startsWith("62")) continue;
      lidToPhoneMap.set(lid, phone);
      phoneToLidMap.set(phone, lid);
    }
    if (lidToPhoneMap.size > 0) {
      logger.info({ mappings: lidToPhoneMap.size }, "Loaded persisted lid-phone map");
    }
  } catch {
    // no-op if file not found or invalid
  }
};

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

const trySendOutboundMessage = async (
  sock: ReturnType<typeof makeWASocket>,
  waNumber: string,
  messageText: string
) => {
  const jids = buildOutboundJidCandidates(waNumber);
  let lastError: unknown = null;

  for (const jid of jids) {
    try {
      await sock.sendMessage(jid, { text: messageText });
      return { sent: true as const, jid, errorMessage: undefined };
    } catch (error) {
      lastError = error;
      logger.warn({ err: error, jid, waNumber }, "Outbound send failed on candidate jid");
    }
  }

  const errorMessage =
    lastError instanceof Error ? lastError.message.slice(0, 180) : "Unknown send failure";

  return { sent: false as const, jid: jids[0] ?? null, errorMessage };
};

const sendInboundReplyPayload = async (
  sock: ReturnType<typeof makeWASocket>,
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
      const sent = await trySendOutboundMessage(sock, message.waNumber, message.messageText);
      if (sent.sent) {
        await ackOutboundMessage(message.id, "SENT");
      } else {
        await ackOutboundMessage(message.id, "FAILED", sent.errorMessage);
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

const runReminderSweep = async () => {
  try {
    const response = await fetch(`${env.API_BASE_URL}/api/bot/reminders/run`, {
      method: "POST",
      headers: {
        "x-bot-token": env.BOT_INTERNAL_TOKEN
      }
    });

    if (!response.ok) {
      const text = await response.text();
      logger.warn({ status: response.status, text }, "Reminder sweep failed");
    }
  } catch (error) {
    logger.warn({ err: error }, "Failed to run reminder sweep");
  }
};

const startReminderSweep = () => {
  if (reminderSweepTimer) clearInterval(reminderSweepTimer);
  reminderSweepTimer = setInterval(() => {
    void runReminderSweep();
  }, env.REMINDER_SWEEP_INTERVAL_MS);
  void runReminderSweep();
};

const extractTextMessage = (message: any): string | undefined =>
  message?.conversation ?? message?.extendedTextMessage?.text;

const parsePhoneCandidateFromText = (text: string): string | null => {
  const trimmed = text.trim();
  if (!/^\+?[\d\s\-().]{8,25}$/.test(trimmed)) return null;

  const normalized = normalizeWaNumber(trimmed);
  if (!normalized || !normalized.startsWith("62")) return null;
  if (normalized.length < 10 || normalized.length > 16) return null;
  return normalized;
};

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

const parseJidParts = (value: string | undefined | null) => {
  if (!value) return null;
  const normalizedJid = value.includes("@") ? jidNormalizedUser(value) : value.trim();
  if (!normalizedJid) return null;

  const decoded = jidDecode(normalizedJid);
  if (decoded?.user && decoded?.server) {
    return {
      user: decoded.user.split(":")[0] ?? decoded.user,
      server: decoded.server
    };
  }

  const userPart = normalizedJid.split("@")[0] ?? normalizedJid;
  return {
    user: userPart.split(":")[0] ?? userPart,
    server: "s.whatsapp.net"
  };
};

const normalizeWaNumber = (value: string): string | null => {
  const jid = parseJidParts(value);
  const userPart = jid?.user ?? value.trim();
  const withoutDevice = userPart.split(":")[0] ?? userPart;
  const digits = withoutDevice.replace(/\D+/g, "");

  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  if (digits) return digits;

  const compact = withoutDevice.replace(/\s+/g, "");
  return compact || null;
};

const rememberLidMapping = (lidValue: string | undefined, phoneJidValue: string | undefined) => {
  const lid = parseJidParts(lidValue);
  if (!lid || lid.server !== "lid") return;

  const phone = normalizeWaNumber(phoneJidValue ?? "");
  if (!phone || !phone.startsWith("62")) return;

  const previous = lidToPhoneMap.get(lid.user);
  if (previous === phone && phoneToLidMap.get(phone) === lid.user) return;

  lidToPhoneMap.set(lid.user, phone);
  phoneToLidMap.set(phone, lid.user);
  void persistLidPhoneMap();
};

const rememberLidMappingFromRawNode = (node: any) => {
  const attrs = node?.attrs as Record<string, string | undefined> | undefined;
  if (!attrs) return;

  const lidCandidateKeys = ["from", "participant", "recipient", "author"];
  const phoneCandidateKeys = [
    "sender_pn",
    "participant_pn",
    "recipient_pn",
    "from_pn",
    "author_pn"
  ];

  const lidRaw =
    lidCandidateKeys
      .map((key) => attrs[key])
      .find((value) => typeof value === "string" && value.endsWith("@lid")) ?? undefined;

  const phoneRaw =
    phoneCandidateKeys
      .map((key) => attrs[key])
      .find((value) => {
        const normalized = normalizeWaNumber(value ?? "");
        return !!normalized && normalized.startsWith("62");
      }) ?? undefined;

  if (lidRaw && phoneRaw) {
    rememberLidMapping(lidRaw, phoneRaw);
    return;
  }

  const lid = parseJidParts(lidRaw);
  if (lid && !lidNoPhoneAttrLogged.has(lid.user)) {
    const pnKeys = Object.keys(attrs).filter((key) => key.includes("pn"));
    lidNoPhoneAttrLogged.add(lid.user);
    logger.warn({ lid: lid.user, pnKeys }, "Raw stanza has lid without phone attrs");
  }
};

const resolvePhoneFromLid = async (
  sock: ReturnType<typeof makeWASocket>,
  lidUser: string
): Promise<string | null> => {
  const cached = lidToPhoneMap.get(lidUser);
  if (cached) return cached;

  const now = Date.now();
  const lastTried = lidLookupCooldownMap.get(lidUser) ?? 0;
  if (now - lastTried < LID_LOOKUP_COOLDOWN_MS) {
    return null;
  }
  lidLookupCooldownMap.set(lidUser, now);

  try {
    const query = new USyncQuery()
      .withContactProtocol()
      .withUser(new USyncUser().withId(`${lidUser}@lid`));
    const result = await sock.executeUSyncQuery(query);

    for (const row of result?.list ?? []) {
      const normalized = normalizeWaNumber(row.id ?? "");
      if (!normalized || !normalized.startsWith("62")) continue;

      lidToPhoneMap.set(lidUser, normalized);
      phoneToLidMap.set(normalized, lidUser);
      logger.info({ lid: lidUser, waNumber: normalized }, "Resolved lid to phone via usync");
      return normalized;
    }
  } catch (error) {
    logger.warn({ err: error, lid: lidUser }, "Failed to resolve lid via usync");
  }

  return null;
};

const checkWhatsAppRegistration = async (
  sock: ReturnType<typeof makeWASocket>,
  phoneNumber: string
): Promise<boolean | undefined> => {
  const cached = waRegistrationCache.get(phoneNumber);
  const now = Date.now();
  if (cached && now - cached.checkedAt < WA_REGISTRATION_CACHE_TTL_MS) {
    return cached.exists;
  }

  try {
    const result = await sock.onWhatsApp(phoneNumber);
    const exists = Boolean(result?.[0]?.exists);
    waRegistrationCache.set(phoneNumber, { exists, checkedAt: now });
    return exists;
  } catch (error) {
    logger.warn({ err: error, phoneNumber }, "Failed to verify WhatsApp registration");
    return undefined;
  }
};

const resolveInboundIdentity = async (
  sock: ReturnType<typeof makeWASocket>,
  remoteJid: string
) => {
  const jid = parseJidParts(remoteJid);
  if (!jid) return { waNumber: null as string | null, waLid: undefined as string | undefined };

  if (jid.server === "lid") {
    const resolved = await resolvePhoneFromLid(sock, jid.user);
    if (resolved) {
      return { waNumber: resolved, waLid: jid.user };
    }

    const mappedPhone = lidToPhoneMap.get(jid.user);
    if (mappedPhone) {
      return { waNumber: mappedPhone, waLid: jid.user };
    }

    logger.warn({ remoteJid, lid: jid.user }, "No lid->phone mapping yet, using lid fallback");
    return {
      waNumber: normalizeWaNumber(jid.user),
      waLid: jid.user
    };
  }

  return { waNumber: normalizeWaNumber(remoteJid), waLid: undefined };
};

const buildOutboundJidCandidates = (waNumber: string) => {
  const parsed = waNumber.includes("@") ? parseJidParts(waNumber) : null;
  if (parsed && (parsed.server === "s.whatsapp.net" || parsed.server === "lid")) {
    return [`${parsed.user}@${parsed.server}`];
  }

  const normalized = normalizeWaNumber(waNumber);
  if (!normalized) return [`${waNumber}@s.whatsapp.net`];

  const candidates: string[] = [];
  const push = (jid: string) => {
    if (!jid || candidates.includes(jid)) return;
    candidates.push(jid);
  };

  if (normalized.startsWith("62")) {
    push(`${normalized}@s.whatsapp.net`);
    const lid = phoneToLidMap.get(normalized);
    if (lid) push(`${lid}@lid`);
    return candidates;
  }

  const mappedPhone = lidToPhoneMap.get(normalized);
  if (mappedPhone) {
    push(`${mappedPhone}@s.whatsapp.net`);
  }

  if (normalized.length >= 15) {
    push(`${normalized}@lid`);
  }

  push(`${normalized}@s.whatsapp.net`);
  return candidates;
};

const processIncomingMessage = async (sock: ReturnType<typeof makeWASocket>, msg: any) => {
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
    await sendInboundReplyPayload(sock, remoteJid, parsed);
  } catch (error) {
    logger.error({ err: error }, "Failed to process incoming message");
    await sock.sendMessage(remoteJid, {
      text: "Terjadi error saat memproses pesan. Coba ketik /help."
    });
  }
};

const startBot = async () => {
  await loadPersistedLidPhoneMap();
  const { state, saveCreds } = await useMultiFileAuthState(env.BAILEYS_AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("chats.phoneNumberShare", ({ lid, jid }) => {
    rememberLidMapping(lid, jid);
  });

  sock.ev.on("contacts.upsert", (contacts) => {
    for (const contact of contacts) {
      rememberLidMapping(contact.lid, contact.id);
    }
  });

  sock.ev.on("contacts.update", (contacts) => {
    for (const contact of contacts) {
      rememberLidMapping(contact.lid, contact.id);
    }
  });

  sock.ev.on("messaging-history.set", (payload) => {
    for (const contact of payload.contacts ?? []) {
      rememberLidMapping(contact.lid, contact.id);
    }
  });

  sock.ws.on("CB:message", (node: any) => {
    rememberLidMappingFromRawNode(node);
  });

  sock.ws.on("CB:notification", (node: any) => {
    rememberLidMappingFromRawNode(node);
  });

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
      startReminderSweep();
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
      if (reminderSweepTimer) {
        clearInterval(reminderSweepTimer);
        reminderSweepTimer = null;
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
