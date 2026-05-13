import { Boom } from "@hapi/boom";
import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import { startHeartbeat } from "../api/heartbeat";
import { startOutboundPolling, stopOutboundPolling } from "../api/outbound";
import { startReminderSweep, stopReminderSweep } from "../api/reminders";
import { env } from "../config";
import { logger } from "../logger";
import { processIncomingMessage } from "../whatsapp/incoming-message";
import {
  loadPersistedLidPhoneMap,
  rememberLidMapping,
  rememberLidMappingFromRawNode
} from "../whatsapp/lid-map";

export const startBot = async () => {
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
      stopOutboundPolling();
      stopReminderSweep();
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
