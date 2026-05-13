import { prisma } from "@/lib/prisma";
import { queueOutboundMessage } from "@/lib/services/messaging/outbound";

const getReminderEventModel = () =>
  (
    prisma as typeof prisma & {
      reminderEvent?: {
        findFirst: (args: unknown) => Promise<{ id: string } | null>;
        count: (args: unknown) => Promise<number>;
        create: (args: unknown) => Promise<unknown>;
      };
    }
  ).reminderEvent;

export const hasReminderSentSince = async (params: {
  userId: string;
  marker: string;
  since: Date;
}): Promise<boolean> => {
  const reminderEvent = getReminderEventModel();
  if (reminderEvent) {
    const existingEvent = await reminderEvent.findFirst({
      where: {
        userId: params.userId,
        sentAt: { gte: params.since },
        marker: params.marker
      },
      select: { id: true }
    });
    if (existingEvent) return true;
  }

  const existing = await prisma.outboundMessage.findFirst({
    where: {
      userId: params.userId,
      createdAt: { gte: params.since },
      messageText: { startsWith: params.marker }
    },
    select: { id: true }
  });

  return Boolean(existing);
};

export const getReminderCountSentToday = async (params: {
  userId: string;
  dayStart: Date;
  dayEnd: Date;
}): Promise<number> => {
  const reminderEvent = getReminderEventModel();
  if (reminderEvent) {
    return reminderEvent.count({
      where: {
        userId: params.userId,
        sentAt: {
          gte: params.dayStart,
          lte: params.dayEnd
        }
      }
    });
  }

  const outboundToday = await prisma.outboundMessage.findMany({
    where: {
      userId: params.userId,
      createdAt: {
        gte: params.dayStart,
        lte: params.dayEnd
      }
    }
  });
  return outboundToday.filter((item) => /^Reminder |^Review Mingguan|^Closing Bulanan|^Recap Harian/.test(item.messageText)).length;
};

export const queueReminderOnce = async (params: {
  userId: string;
  waNumber: string;
  reminderType: string;
  marker: string;
  message: string;
  since: Date;
  sentAt: Date;
}): Promise<boolean> => {
  const alreadySent = await hasReminderSentSince({
    userId: params.userId,
    marker: params.marker,
    since: params.since
  });
  if (alreadySent) return false;

  const messageText = `${params.marker}\n${params.message}`;
  await queueOutboundMessage({
    userId: params.userId,
    waNumber: params.waNumber,
    messageText
  });

  const reminderEvent = getReminderEventModel();
  if (reminderEvent) {
    await reminderEvent.create({
      data: {
        userId: params.userId,
        reminderType: params.reminderType,
        marker: params.marker,
        messageText,
        sentAt: params.sentAt
      }
    });
  }
  return true;
};
