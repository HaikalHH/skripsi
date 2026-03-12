import { prisma } from "@/lib/prisma";

export type IntentObservationInput = {
  userId: string;
  messageId?: string | null;
  rawText: string;
  effectiveText: string;
  commandKind: string;
  topModule?: string | null;
  moduleOrder?: string[] | null;
  resolutionKind?: string | null;
  resolutionSource?: string | null;
  semanticNormalizedText?: string | null;
  handledBy: string;
  fallbackStage?: string | null;
  ambiguityFlag?: boolean;
};

const getIntentObservationModel = () =>
  (prisma as unknown as {
    intentObservation?: {
      create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
      findMany: (args: {
        where?: Record<string, unknown>;
        orderBy?: Record<string, "asc" | "desc">;
        take?: number;
        select?: Record<string, boolean>;
      }) => Promise<Array<Record<string, unknown>>>;
      count: (args?: { where?: Record<string, unknown> }) => Promise<number>;
    };
  }).intentObservation;

const toNumber = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

export const recordIntentObservation = async (input: IntentObservationInput) => {
  const model = getIntentObservationModel();
  if (!model) return;

  try {
    await model.create({
      data: {
        userId: input.userId,
        ...(input.messageId ? { messageId: input.messageId } : {}),
        rawText: input.rawText,
        effectiveText: input.effectiveText,
        commandKind: input.commandKind,
        topModule: input.topModule ?? null,
        moduleOrderJson: input.moduleOrder ?? [],
        resolutionKind: input.resolutionKind ?? "none",
        resolutionSource: input.resolutionSource ?? null,
        semanticNormalizedText: input.semanticNormalizedText ?? null,
        handledBy: input.handledBy,
        fallbackStage: input.fallbackStage ?? null,
        ambiguityFlag: Boolean(input.ambiguityFlag)
      }
    });
  } catch {
    // Swallow observability failures so chat handling never fails because of analytics logging.
  }
};

const summarizeCounts = (rows: Array<Record<string, unknown>>, field: string, take: number) =>
  Array.from(
    rows.reduce((map, row) => {
      const key = String(row[field] ?? "UNKNOWN");
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  )
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
    .slice(0, take);

export const getIntentObservabilitySummary = async (days = 7) => {
  const model = getIntentObservationModel();
  const safeDays = Math.max(1, Math.min(30, Math.round(days)));
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
  const emptySummary = {
    days: safeDays,
    since: since.toISOString(),
    totalObserved: 0,
    ambiguityCount: 0,
    semanticRewriteCount: 0,
    fallbackCount: 0,
    topCommands: [] as Array<{ value: string; count: number }>,
    topHandlers: [] as Array<{ value: string; count: number }>,
    topFallbackStages: [] as Array<{ value: string; count: number }>,
    latestAmbiguous: [] as Array<Record<string, unknown>>
  };

  if (!model) {
    return emptySummary;
  }

  try {
    const rows = await model.findMany({
      where: {
        createdAt: {
          gte: since
        }
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        rawText: true,
        effectiveText: true,
        commandKind: true,
        topModule: true,
        resolutionKind: true,
        resolutionSource: true,
        semanticNormalizedText: true,
        handledBy: true,
        fallbackStage: true,
        ambiguityFlag: true,
        createdAt: true
      }
    });

    const ambiguityCount = rows.filter((row) => Boolean(row.ambiguityFlag)).length;
    const semanticRewriteCount = rows.filter((row) => row.semanticNormalizedText).length;
    const fallbackCount = rows.filter((row) => row.fallbackStage).length;

    return {
      days: safeDays,
      since: since.toISOString(),
      totalObserved: rows.length,
      ambiguityCount,
      semanticRewriteCount,
      fallbackCount,
      topCommands: summarizeCounts(rows, "commandKind", 8),
      topHandlers: summarizeCounts(rows, "handledBy", 8),
      topFallbackStages: summarizeCounts(
        rows.filter((row) => row.fallbackStage),
        "fallbackStage",
        6
      ),
      latestAmbiguous: rows
        .filter((row) => Boolean(row.ambiguityFlag))
        .slice(0, 12)
        .map((row) => ({
          id: String(row.id),
          rawText: String(row.rawText ?? ""),
          effectiveText: String(row.effectiveText ?? ""),
          commandKind: String(row.commandKind ?? "NONE"),
          topModule: row.topModule ? String(row.topModule) : null,
          resolutionKind: String(row.resolutionKind ?? "none"),
          resolutionSource: row.resolutionSource ? String(row.resolutionSource) : null,
          handledBy: String(row.handledBy ?? "unknown"),
          fallbackStage: row.fallbackStage ? String(row.fallbackStage) : null,
          createdAt:
            row.createdAt instanceof Date
              ? row.createdAt.toISOString()
              : new Date(String(row.createdAt)).toISOString()
        }))
    };
  } catch {
    return emptySummary;
  }
};
