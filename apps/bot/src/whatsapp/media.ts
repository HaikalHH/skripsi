import { downloadMediaMessage } from "@whiskeysockets/baileys";
import pino from "pino";
import type { BotSocket } from "./types";

export const downloadImageAsBase64 = async (sock: BotSocket, message: any) => {
  const mediaBuffer = (await downloadMediaMessage(
    message,
    "buffer",
    {},
    {
      logger: pino({ level: "silent" }),
      reuploadRequest: sock.updateMediaMessage
    }
  )) as Buffer;

  return mediaBuffer.toString("base64");
};
