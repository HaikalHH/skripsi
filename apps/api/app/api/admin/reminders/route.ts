import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { queueOutboundMessage } from "@/lib/services/messaging/outbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("resend-failed-outbound"),
    outboundMessageId: z.string().min(1)
  }),
  z.object({
    action: z.literal("update-reminder-template"),
    reminderTemplateId: z.string().min(1),
    title: z.string().trim().min(1).max(191),
    reminderType: z.string().trim().min(1).max(191),
    messageText: z.string().trim().min(1).max(1000),
    entities: z
      .array(
        z.object({
          token: z.string().regex(/^\(\{\d+\}\)$/),
          source: z.string().trim().min(1).max(80)
        })
      )
      .max(20)
  })
]);

type ReminderTemplateRow = {
  id: string;
  templateKey: string;
  reminderType: string;
  title: string;
  marker: string;
  messageText: string;
  entitiesJson: unknown;
  isActive: boolean | number;
  updatedAt: Date;
};

const buildMarker = (title: string, entities: Array<{ token: string }>) => {
  const firstToken = entities[0]?.token;
  return firstToken ? `${title} ${firstToken}` : title;
};

const normalizeEntities = (value: unknown) => {
  if (!value) return [];
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (item): item is { token: string; source: string } =>
        item &&
        typeof item === "object" &&
        "token" in item &&
        "source" in item &&
        typeof item.token === "string" &&
        typeof item.source === "string"
    )
    .map((item) => ({ token: item.token, source: item.source }));
};

const getReminderTemplates = () =>
  prisma.$queryRaw<ReminderTemplateRow[]>`
    SELECT
      id,
      templateKey,
      reminderType,
      title,
      marker,
      messageText,
      entitiesJson,
      isActive,
      updatedAt
    FROM ReminderTemplate
    ORDER BY isActive DESC, reminderType ASC, title ASC
  `;

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [sentOutboundCount, failedOutboundCount, reminderTemplates, recentFailures] =
    await Promise.all([
      prisma.outboundMessage.count({ where: { status: "SENT" } }),
      prisma.outboundMessage.count({ where: { status: "FAILED" } }),
      getReminderTemplates(),
      prisma.outboundMessage.findMany({
        where: { status: "FAILED" },
        orderBy: { updatedAt: "desc" },
        take: 50,
        select: {
          id: true,
          userId: true,
          waNumber: true,
          messageText: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              name: true
            }
          }
        }
      })
    ]);

  return NextResponse.json({
    summary: {
      sentOutboundMessages: sentOutboundCount,
      failedOutboundMessages: failedOutboundCount,
      reminderTemplates: reminderTemplates.length
    },
    recentFailures: recentFailures.map((message) => ({
      id: message.id,
      userId: message.userId,
      userName: message.user.name,
      waNumber: message.waNumber,
      messageText: message.messageText,
      errorMessage: message.errorMessage,
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString()
    })),
    reminders: reminderTemplates.map((template) => ({
      id: template.id,
      templateKey: template.templateKey,
      title: template.title,
      reminderType: template.reminderType,
      marker: template.marker,
      messageText: template.messageText,
      entities: normalizeEntities(template.entitiesJson),
      isActive: Boolean(template.isActive),
      updatedAt: template.updatedAt.toISOString()
    }))
  });
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ error: "Adding reminder templates is disabled" }, { status: 405 });
}

export async function PATCH(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  if (parsed.data.action === "resend-failed-outbound") {
    const failedMessage = await prisma.outboundMessage.findUnique({
      where: { id: parsed.data.outboundMessageId },
      select: {
        userId: true,
        waNumber: true,
        messageText: true,
        status: true
      }
    });

    if (!failedMessage) {
      return NextResponse.json({ error: "Outbound message not found" }, { status: 404 });
    }

    if (failedMessage.status !== "FAILED") {
      return NextResponse.json(
        { error: "Only failed outbound messages can be resent" },
        { status: 400 }
      );
    }

    const retry = await queueOutboundMessage({
      userId: failedMessage.userId,
      waNumber: failedMessage.waNumber,
      messageText: failedMessage.messageText
    });

    return NextResponse.json({ success: true, retryId: retry.id });
  }

  const entitiesJson = JSON.stringify(parsed.data.entities);
  const marker = buildMarker(parsed.data.title, parsed.data.entities);

  await prisma.$executeRaw`
    UPDATE ReminderTemplate
    SET
      title = ${parsed.data.title},
      reminderType = ${parsed.data.reminderType},
      marker = ${marker},
      messageText = ${parsed.data.messageText},
      entitiesJson = ${entitiesJson},
      updatedAt = NOW(3)
    WHERE id = ${parsed.data.reminderTemplateId}
  `;

  return NextResponse.json({
    success: true,
    reminderTemplateId: parsed.data.reminderTemplateId
  });
}
