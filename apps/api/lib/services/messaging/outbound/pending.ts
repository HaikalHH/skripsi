import { OutboundMessageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
