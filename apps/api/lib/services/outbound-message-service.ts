import { OutboundMessageStatus } from "@prisma/client";
import { prisma } from "../prisma";

export const queueOutboundMessage = async (params: {
  userId: string;
  waNumber: string;
  messageText: string;
}) =>
  prisma.outboundMessage.create({
    data: {
      userId: params.userId,
      waNumber: params.waNumber,
      messageText: params.messageText
    }
  });

export const claimPendingOutboundMessages = async (limit: number) => {
  const size = Math.max(1, Math.min(20, limit));
  return prisma.$transaction(async (tx) => {
    const pending = await tx.outboundMessage.findMany({
      where: { status: OutboundMessageStatus.PENDING },
      orderBy: { createdAt: "asc" },
      take: size
    });

    if (!pending.length) {
      return [];
    }

    await tx.outboundMessage.updateMany({
      where: {
        id: { in: pending.map((item) => item.id) }
      },
      data: {
        status: OutboundMessageStatus.PROCESSING
      }
    });

    return pending;
  });
};

export const ackOutboundMessage = async (params: {
  id: string;
  status: "SENT" | "FAILED";
  errorMessage?: string;
}) =>
  prisma.outboundMessage.update({
    where: { id: params.id },
    data: {
      status: params.status === "SENT" ? OutboundMessageStatus.SENT : OutboundMessageStatus.FAILED,
      sentAt: params.status === "SENT" ? new Date() : null,
      errorMessage: params.status === "FAILED" ? params.errorMessage ?? "Unknown send error" : null
    }
  });
