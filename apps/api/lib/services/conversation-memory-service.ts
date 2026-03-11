import { MessageType } from "@prisma/client";
import { prisma } from "../prisma";
import {
  routeGlobalTextContext,
  type GlobalContextModule,
  type GlobalContextRoute
} from "./global-context-router-service";

type ConversationRole = "user" | "assistant";

type ConversationTurn = {
  role: ConversationRole;
  text: string;
  occurredAt: Date;
};

export type ConversationMemoryResolution =
  | { kind: "none"; effectiveText: string }
  | {
      kind: "rewrite";
      effectiveText: string;
      source: string;
      referencedText?: string;
    }
  | { kind: "reply"; replyText: string; source: string };

const DEFAULT_RECENT_TURN_LIMIT = 10;
const MAX_RECENT_TURN_LIMIT = 12;
const MEMORY_WINDOW_HOURS = 24;

const SAFE_REPLAY_MODULES = new Set<GlobalContextModule>([
  "MARKET",
  "NEWS",
  "SMART_ALLOCATION",
  "FINANCIAL_FREEDOM",
  "WEALTH_PROJECTION",
  "PRIVACY"
]);

const SAFE_REPLAY_COMMANDS = new Set([
  "HELP",
  "REPORT",
  "INSIGHT",
  "ADVICE",
  "GOAL_STATUS"
]);

const CONTEXT_REFERENCE_PATTERN =
  /\b(yang tadi|yang itu|yang barusan|yang sama|yang ini|yang satu lagi|yang pertama|yang kedua|yang ketiga|yang keempat|yang kelima|lanjut|next|terus|itu aja|yang itu aja)\b/i;
const ACK_ONLY_PATTERN =
  /^(ok(?:e|ey)?|okay|sip|siap|baik|baiklah|noted|lanjut|next|terus|gas|ayo|mulai|start)$/i;
const END_MORE_PATTERN =
  /\b(ga ada lagi|gak ada lagi|nggak ada lagi|tidak ada lagi|udah cukup|sudah cukup|cukup|segitu aja|itu aja|yang itu aja|stop dulu)\b/i;
const CONTINUE_MORE_PATTERN =
  /\b(ada lagi|masih ada|tambah lagi|masih mau tambah|iya ada|ya ada)\b/i;
const READINESS_PATTERN = /^(ok(?:e|ey)?|siap|ayo|gas|lanjut|mulai|start)$/i;

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

const buildOptionClarificationReply = () =>
  "Saya belum yakin pilihan yang dimaksud. Balas nomor opsinya atau tulis ulang singkat nama pilihannya ya Boss.";

const buildAddMoreClarificationReply = () =>
  "Kalau masih mau tambah, balas `Ada`. Kalau sudah selesai, balas `Ga ada` ya Boss.";

const buildGenericClarificationReply = () =>
  "Saya belum yakin konteks `yang tadi` itu yang mana, jadi saya belum mau asumsi. Coba tulis ulang singkat, misalnya `laporan bulan ini`, `harga BTC`, atau `ga ada lagi`.";

const extractAssistantOptions = (text: string) => {
  const options: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\.\s*(.+?)\s*$/);
    if (match) {
      options.push(match[2].trim());
    }
  }

  if (options.length) return options;

  const inlineMatches = Array.from(
    text.matchAll(/(?:^|\s)(\d+)\.\s*(.+?)(?=(?:\s+\d+\.\s)|$)/g)
  );

  return inlineMatches.map((match) => match[2].trim()).filter(Boolean);
};

const detectSelectedOptionIndex = (text: string) => {
  const trimmed = text.trim().toLowerCase();

  const numericOnly = trimmed.match(/^([1-9])(?:\s*[.)-]?\s*)?$/);
  if (numericOnly) return Number(numericOnly[1]) - 1;

  const explicitNumeric = trimmed.match(/\b(?:pilih(?:an)?|opsi|nomor|yang)\s*([1-9])\b/);
  if (explicitNumeric) return Number(explicitNumeric[1]) - 1;

  const ordinalMap: Record<string, number> = {
    pertama: 0,
    kedua: 1,
    ketiga: 2,
    keempat: 3,
    kelima: 4
  };

  for (const [label, index] of Object.entries(ordinalMap)) {
    if (new RegExp(`\\b${label}\\b`, "i").test(trimmed)) {
      return index;
    }
  }

  return null;
};

const detectRequestedReportPeriod = (text: string) => {
  if (/\b(hari ini|harian|daily)\b/i.test(text)) return "daily";
  if (/\b(minggu ini|pekan ini|mingguan|weekly)\b/i.test(text)) return "weekly";
  if (/\b(bulan ini|bulanan|monthly)\b/i.test(text)) return "monthly";
  return null;
};

const buildReportFollowUpText = (period: "daily" | "weekly" | "monthly") => {
  if (period === "daily") return "laporan hari ini";
  if (period === "weekly") return "laporan minggu ini";
  return "laporan bulan ini";
};

const isSafeReplayRoute = (route: GlobalContextRoute) => {
  if (route.command.kind !== "NONE" && SAFE_REPLAY_COMMANDS.has(route.command.kind)) {
    return true;
  }

  return SAFE_REPLAY_MODULES.has(route.moduleOrder[0] ?? "TRANSACTION");
};

const isContextDependentText = (text: string) => {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (CONTEXT_REFERENCE_PATTERN.test(normalized)) return true;
  if (ACK_ONLY_PATTERN.test(normalized)) return true;
  return detectRequestedReportPeriod(normalized) !== null && normalized.split(" ").length <= 4;
};

export const loadRecentConversationTurns = async (params: {
  userId: string;
  currentMessageId?: string;
  limit?: number;
}) => {
  const limit = Math.max(1, Math.min(MAX_RECENT_TURN_LIMIT, params.limit ?? DEFAULT_RECENT_TURN_LIMIT));
  const cutoff = new Date(Date.now() - MEMORY_WINDOW_HOURS * 60 * 60 * 1000);

  const [inboundMessages, outboundMessages] = await Promise.all([
    prisma.messageLog.findMany({
      where: {
        userId: params.userId,
        messageType: MessageType.TEXT,
        sentAt: {
          gte: cutoff
        },
        ...(params.currentMessageId
          ? {
              id: {
                not: params.currentMessageId
              }
            }
          : {})
      },
      orderBy: { sentAt: "desc" },
      take: limit,
      select: {
        contentOrCaption: true,
        sentAt: true
      }
    }),
    prisma.outboundMessage.findMany({
      where: {
        userId: params.userId,
        OR: [
          {
            sentAt: {
              gte: cutoff
            }
          },
          {
            createdAt: {
              gte: cutoff
            }
          }
        ]
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        messageText: true,
        sentAt: true,
        createdAt: true
      }
    })
  ]);

  return [...inboundMessages, ...outboundMessages]
    .map((item) => {
      if ("contentOrCaption" in item) {
        return {
          role: "user" as const,
          text: normalizeText(item.contentOrCaption),
          occurredAt: item.sentAt
        };
      }

      return {
        role: "assistant" as const,
        text: normalizeText(item.messageText),
        occurredAt: item.sentAt ?? item.createdAt
      };
    })
    .filter((item) => item.text)
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
    .slice(0, limit);
};

const getAssistantReferenceText = (params: {
  fallbackAssistantText?: string | null;
  recentTurns: ConversationTurn[];
}) => {
  if (params.fallbackAssistantText?.trim()) {
    return params.fallbackAssistantText.trim();
  }

  return params.recentTurns.find((turn) => turn.role === "assistant")?.text ?? null;
};

const getLastSafeReplayUserTurn = (recentTurns: ConversationTurn[]) => {
  for (const turn of recentTurns) {
    if (turn.role !== "user") continue;
    if (!turn.text) continue;

    const route = routeGlobalTextContext(turn.text);
    if (isSafeReplayRoute(route)) {
      return { turn, route };
    }
  }

  return null;
};

export const resolveConversationMemory = async (params: {
  userId: string;
  currentMessageId?: string;
  text: string | undefined;
  fallbackAssistantText?: string | null;
}): Promise<ConversationMemoryResolution> => {
  const currentText = normalizeText(params.text ?? "");
  if (!currentText) {
    return { kind: "none", effectiveText: currentText };
  }

  const recentTurns = await loadRecentConversationTurns({
    userId: params.userId,
    currentMessageId: params.currentMessageId
  });
  const assistantReferenceText = getAssistantReferenceText({
    fallbackAssistantText: params.fallbackAssistantText,
    recentTurns
  });
  const lastSafeReplay = getLastSafeReplayUserTurn(recentTurns);

  if (assistantReferenceText) {
    const assistantOptions = extractAssistantOptions(assistantReferenceText);
    const selectedOptionIndex = detectSelectedOptionIndex(currentText);
    if (
      assistantOptions.length > 1 &&
      selectedOptionIndex !== null &&
      assistantOptions[selectedOptionIndex]
    ) {
      return {
        kind: "rewrite",
        effectiveText: assistantOptions[selectedOptionIndex],
        source: "assistant_option_selection",
        referencedText: assistantReferenceText
      };
    }

    if (/siap memulai|siap mulai|mulai onboarding/i.test(assistantReferenceText) && READINESS_PATTERN.test(currentText)) {
      return {
        kind: "rewrite",
        effectiveText: "Oke saya siap",
        source: "assistant_readiness",
        referencedText: assistantReferenceText
      };
    }

    if (/ada lagi ga boss|ada lagi gak boss|ada lagi ga/i.test(assistantReferenceText)) {
      if (END_MORE_PATTERN.test(currentText)) {
        return {
          kind: "rewrite",
          effectiveText: "Ga ada",
          source: "assistant_add_more_stop",
          referencedText: assistantReferenceText
        };
      }

      if (CONTINUE_MORE_PATTERN.test(currentText)) {
        return {
          kind: "rewrite",
          effectiveText: "Ada",
          source: "assistant_add_more_continue",
          referencedText: assistantReferenceText
        };
      }
    }
  }

  const requestedReportPeriod = detectRequestedReportPeriod(currentText);
  if (requestedReportPeriod && lastSafeReplay?.route.command.kind === "REPORT") {
    return {
      kind: "rewrite",
      effectiveText: buildReportFollowUpText(requestedReportPeriod),
      source: "report_period_follow_up",
      referencedText: lastSafeReplay.turn.text
    };
  }

  if (
    /\b(yang tadi|yang itu|yang barusan|yang sama|ulang yang tadi|yang itu lagi)\b/i.test(
      currentText
    ) &&
    lastSafeReplay
  ) {
    return {
      kind: "rewrite",
      effectiveText: lastSafeReplay.turn.text,
      source: "safe_replay_previous_context",
      referencedText: lastSafeReplay.turn.text
    };
  }

  if (isContextDependentText(currentText)) {
    if (assistantReferenceText) {
      if (extractAssistantOptions(assistantReferenceText).length > 1) {
        return { kind: "reply", replyText: buildOptionClarificationReply(), source: "option_clarify" };
      }

      if (/ada lagi ga boss|ada lagi gak boss|ada lagi ga/i.test(assistantReferenceText)) {
        return { kind: "reply", replyText: buildAddMoreClarificationReply(), source: "add_more_clarify" };
      }

      return { kind: "reply", replyText: buildGenericClarificationReply(), source: "assistant_context_clarify" };
    }

    if (lastSafeReplay) {
      return { kind: "reply", replyText: buildGenericClarificationReply(), source: "generic_clarify" };
    }
  }

  return { kind: "none", effectiveText: currentText };
};
