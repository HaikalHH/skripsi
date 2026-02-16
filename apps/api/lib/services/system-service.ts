import { prisma } from "../prisma";

export const upsertHeartbeat = async (serviceName: string) =>
  prisma.systemHeartbeat.upsert({
    where: { serviceName },
    update: { lastSeenAt: new Date() },
    create: { serviceName, lastSeenAt: new Date() }
  });

export const getHeartbeatStatus = async (staleAfterSeconds: number) => {
  const heartbeat = await prisma.systemHeartbeat.findUnique({
    where: { serviceName: "bot" }
  });

  if (!heartbeat) {
    return { status: "down", lastSeenAt: null as string | null };
  }

  const staleAt = heartbeat.lastSeenAt.getTime() + staleAfterSeconds * 1000;
  const status = Date.now() > staleAt ? "stale" : "healthy";
  return { status, lastSeenAt: heartbeat.lastSeenAt.toISOString() };
};
