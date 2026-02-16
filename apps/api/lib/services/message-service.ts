import { MessageType } from "@prisma/client";
import { prisma } from "../prisma";

type CreateMessageLogInput = {
  userId: string;
  messageType: MessageType;
  contentOrCaption: string;
  mediaUrlOrLocalPath?: string;
  sentAt?: Date;
};

export const createMessageLog = async (input: CreateMessageLogInput) =>
  prisma.messageLog.create({
    data: {
      userId: input.userId,
      messageType: input.messageType,
      contentOrCaption: input.contentOrCaption,
      mediaUrlOrLocalPath: input.mediaUrlOrLocalPath,
      sentAt: input.sentAt ?? new Date()
    }
  });
