import { inboundMessageSchema } from "@finance/shared";
import type { z } from "zod";

export type InboundPayload = z.infer<typeof inboundMessageSchema>;

export type MessageContext = {
  userId: string;
  messageId: string;
};
