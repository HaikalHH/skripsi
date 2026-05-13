import { env, outboundClaimSchema } from "../config";
import { logger } from "../logger";
import { buildOutboundJidCandidates } from "../whatsapp/lid-map";
import type { BotSocket } from "../whatsapp/types";

let outboundPollTimer: NodeJS.Timeout | null = null;

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
  sock: BotSocket,
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

const pollOutboundMessages = async (sock: BotSocket) => {
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

export const startOutboundPolling = (sock: BotSocket) => {
  stopOutboundPolling();
  outboundPollTimer = setInterval(() => {
    void pollOutboundMessages(sock);
  }, env.OUTBOUND_POLL_INTERVAL_MS);
  void pollOutboundMessages(sock);
};

export const stopOutboundPolling = () => {
  if (!outboundPollTimer) return;
  clearInterval(outboundPollTimer);
  outboundPollTimer = null;
};
