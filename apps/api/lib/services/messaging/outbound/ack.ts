import { OutboundMessageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
