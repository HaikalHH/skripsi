import { env } from "../config";
import { logger } from "../logger";

let heartbeatTimer: NodeJS.Timeout | null = null;

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

export const startHeartbeat = () => {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(sendHeartbeat, env.HEARTBEAT_INTERVAL_MS);
  void sendHeartbeat();
};
