import "dotenv/config";
import { resolve } from "node:path";
import { z } from "zod";

const envSchema = z.object({
  API_BASE_URL: z.string().url(),
  BAILEYS_AUTH_DIR: z.string().default(".baileys_auth"),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  OUTBOUND_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  REMINDER_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),
  BOT_INTERNAL_TOKEN: z.string().min(8)
});

export const env = envSchema.parse(process.env);
export const lidMapFilePath = resolve(env.BAILEYS_AUTH_DIR, "lid-phone-map.json");

export const inboundResponseSchema = z.object({
  replyText: z.string().optional(),
  replyTexts: z.array(z.string()).optional(),
  preserveReplyTextBubbles: z.boolean().optional(),
  imageBase64: z.string().optional(),
  imageMimeType: z.string().optional(),
  documentBase64: z.string().optional(),
  documentMimeType: z.string().optional(),
  documentFileName: z.string().optional()
});

export const outboundClaimSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      waNumber: z.string(),
      messageText: z.string()
    })
  )
});

export type InboundResponsePayload = z.infer<typeof inboundResponseSchema>;
