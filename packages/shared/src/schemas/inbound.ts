import { z } from "zod";
import { isoDateLikeSchema, messageTypeSchema } from "./common";

export const inboundMessageSchema = z.object({
  waNumber: z.string().min(6).max(30),
  waLid: z.string().min(6).max(40).optional(),
  phoneInput: z.string().min(6).max(30).optional(),
  phoneInputRegistered: z.boolean().optional(),
  messageType: messageTypeSchema,
  text: z.string().max(4000).optional(),
  caption: z.string().max(4000).optional(),
  imageBase64: z.string().optional(),
  mimeType: z.string().optional(),
  sentAt: isoDateLikeSchema.optional()
});
