import { OutboundMessageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toSafeOutboundMessageText } from "./message-text";

export const queueOutboundMessage = async (params: {
  userId: string;
  waNumber: string;
  messageText: string;
}) =>
  prisma.outboundMessage.create({
    data: {
      userId: params.userId,
      waNumber: params.waNumber,
      messageText: toSafeOutboundMessageText(params.messageText)
    }
  });

export const logDirectAssistantReply = async (params: {
  userId: string;
  waNumber: string;
  messageText: string;
}) =>
  prisma.outboundMessage.create({
    data: {
      userId: params.userId,
      waNumber: params.waNumber,
      messageText: toSafeOutboundMessageText(params.messageText),
      status: OutboundMessageStatus.SENT,
      sentAt: new Date()
    }
  });
