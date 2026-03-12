import { MessageType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  routeGlobalTextContext,
  type GlobalContextModule,
  type GlobalContextRoute
} from "@/lib/services/assistant/global-context-router-service";
import { parseMutationCommand } from "@/lib/services/transactions/transaction-mutation-command-service";

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
  "GOAL_STATUS",
  "CATEGORY_DETAIL_REPORT",
  "GENERAL_ANALYTICS_REPORT",
  "CASHFLOW_FORECAST",
  "GOAL_PLAN",
  "FINANCIAL_HEALTH"
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
const TOP_ONLY_PATTERN = /\b(tertinggi|terbesar|paling besar|paling gede|paling tinggi|top|teratas)\b/i;
const COUNT_ONLY_PATTERN = /\b(berapa kali|berapa transaksi|jumlah transaksi|count|frekuensi|seberapa sering)\b/i;
const TOTAL_ONLY_PATTERN = /\b(total|jumlah|habis berapa|keluar berapa|sisa berapa|berapa total)\b/i;
const SHARE_ONLY_PATTERN = /\b(kontribusi|proporsi|share|persen|nyumbang)\b/i;
const MERCHANT_ONLY_PATTERN = /\b(merchant|toko|tempat|vendor)\b/i;
const FREQUENCY_ONLY_PATTERN = /\b(paling sering|tersering|rutin|paling rutin)\b/i;
const COMPARE_ONLY_PATTERN = /\b(banding|dibanding|vs|versus|sebelumnya|periode lalu)\b/i;
const EXPLAIN_ONLY_PATTERN = /\b(kenapa|yang bikin|penyebab|ngedorong|pemicu)\b/i;
const PRIORITY_ONLY_PATTERN = /\b(prioritas|realistis|mana dulu)\b/i;
const SPLIT_ONLY_PATTERN = /\b(dibagi|bagiin|split|alokasi)\b/i;
const FOCUS_ONLY_PATTERN = /\b(fokus|focus|yang .* aja|yang .* dulu)\b/i;
const RATIO_PATTERN = /\b(\d{1,2})\s*[:/-]\s*(\d{1,2})\b/;
const EXPENSE_GROWTH_PATTERN = /\b(?:expense|pengeluaran)\b.*?\bnaik\b.*?(\d{1,2})(?:[.,]\d+)?\s*%\s*(?:per|tiap)\s*tahun\b/i;
const SCENARIO_EXPENSE_PATTERN = /\b(?:kalau|jika|misalnya|misal|andaikan)\b.*\d/i;

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

const buildPeriodPhrase = (period: "daily" | "weekly" | "monthly") => {
  if (period === "daily") return "hari ini";
  if (period === "weekly") return "minggu ini";
  return "bulan ini";
};

const buildPreviousPeriodPhrase = (period: "daily" | "weekly" | "monthly") => {
  if (period === "daily") return "hari sebelumnya";
  if (period === "weekly") return "minggu lalu";
  return "bulan lalu";
};

const sanitizeFollowUpFilterText = (value: string) =>
  normalizeText(
    value
      .replace(/\b(?:yang|buat|untuk|aja|saja|doang|dong|lah|nih|itu|ini|yang tadi|yang sama)\b/gi, " ")
      .replace(/[?.,!]+/g, " ")
  ).trim();

const extractFollowUpFilterText = (text: string) => {
  const normalized = normalizeText(text);
  const explicit =
    normalized.match(/\byang\s+(.+?)(?=\s+(?:aja|saja|doang)\b|$)/i)?.[1] ??
    normalized.match(/\b(?:buat|untuk)\s+(.+?)(?=\s+(?:aja|saja|doang)\b|$)/i)?.[1];
  if (explicit) {
    const sanitized = sanitizeFollowUpFilterText(explicit);
    return sanitized || null;
  }

  if (
    normalized.split(" ").length <= 3 &&
    !TOP_ONLY_PATTERN.test(normalized) &&
    !COUNT_ONLY_PATTERN.test(normalized) &&
    !TOTAL_ONLY_PATTERN.test(normalized) &&
    !COMPARE_ONLY_PATTERN.test(normalized) &&
    !EXPLAIN_ONLY_PATTERN.test(normalized) &&
    !PRIORITY_ONLY_PATTERN.test(normalized) &&
    !SPLIT_ONLY_PATTERN.test(normalized)
  ) {
    const sanitized = sanitizeFollowUpFilterText(normalized);
    return sanitized || null;
  }

  return null;
};

const buildCategoryPeriodPhrase = (command: Extract<GlobalContextRoute["command"], { kind: "CATEGORY_DETAIL_REPORT" }>, override?: "daily" | "weekly" | "monthly" | null) =>
  override ? buildPeriodPhrase(override) : command.dateRange?.label ?? buildPeriodPhrase(command.period);

const detectRequestedCashflowHorizon = (text: string) => {
  if (/\bweekend|akhir pekan|akhir minggu\b/i.test(text)) return "WEEKEND" as const;
  if (/\bbesok|tomorrow\b/i.test(text)) return "TOMORROW" as const;
  if (/\b(gajian|payday)\b/i.test(text)) return "PAYDAY" as const;
  if (/\b(7 hari|minggu depan|pekan depan|seminggu)\b/i.test(text)) return "NEXT_7_DAYS" as const;
  if (/\b(akhir bulan|ujung bulan|bulan habis)\b/i.test(text)) return "MONTH_END" as const;
  return null;
};

const buildCategoryPreviousPhrase = (command: Extract<GlobalContextRoute["command"], { kind: "CATEGORY_DETAIL_REPORT" }>) =>
  command.comparisonRange?.previous.label ?? buildPreviousPeriodPhrase(command.period);

const buildCategoryFollowUpText = (
  currentText: string,
  command: Extract<GlobalContextRoute["command"], { kind: "CATEGORY_DETAIL_REPORT" }>
) => {
  const periodOverride = detectRequestedReportPeriod(currentText);
  const category = command.category;
  const filterText = extractFollowUpFilterText(currentText) ?? command.filterText;
  const bucketPhrase = filterText ? `${category} yang ${filterText}` : category;
  const periodPhrase = buildCategoryPeriodPhrase(command, periodOverride);

  if (SHARE_ONLY_PATTERN.test(currentText)) {
    return filterText
      ? `${filterText} kontribusinya berapa persen dari ${category} ${periodPhrase}`
      : `total ${category} ${periodPhrase} berapa`;
  }
  if (MERCHANT_ONLY_PATTERN.test(currentText) && FREQUENCY_ONLY_PATTERN.test(currentText)) {
    return `merchant ${category} paling sering ${periodPhrase}`;
  }
  if (MERCHANT_ONLY_PATTERN.test(currentText) && TOP_ONLY_PATTERN.test(currentText)) {
    return `merchant ${category} terbesar ${periodPhrase}`;
  }
  if (EXPLAIN_ONLY_PATTERN.test(currentText) || (COMPARE_ONLY_PATTERN.test(currentText) && /naik|turun|lonjak/i.test(currentText))) {
    return filterText
      ? `kenapa ${filterText} naik dibanding ${buildCategoryPreviousPhrase(command)}`
      : `kenapa ${category.toLowerCase()} naik ${periodPhrase}`;
  }
  if (COMPARE_ONLY_PATTERN.test(currentText)) {
    return filterText
      ? `${filterText} naik dibanding ${buildCategoryPreviousPhrase(command)} gak`
      : `${category.toLowerCase()} naik dibanding ${buildCategoryPreviousPhrase(command)} gak`;
  }
  if (TOP_ONLY_PATTERN.test(currentText)) {
    return `${bucketPhrase} terbesar ${periodPhrase} apa`;
  }
  if (COUNT_ONLY_PATTERN.test(currentText)) {
    return `berapa transaksi ${bucketPhrase} ${periodPhrase}`;
  }
  if (TOTAL_ONLY_PATTERN.test(currentText)) {
    return `${bucketPhrase} ${periodPhrase} total berapa`;
  }
  if (periodOverride) {
    return `detail ${bucketPhrase} ${periodPhrase}`;
  }
  if (filterText && filterText !== command.filterText) {
    return `detail ${bucketPhrase} ${periodPhrase}`;
  }
  return null;
};

const buildGeneralAnalyticsFollowUpText = (
  currentText: string,
  command: Extract<GlobalContextRoute["command"], { kind: "GENERAL_ANALYTICS_REPORT" }>
) => {
  const periodPhrase = command.dateRange?.label ?? buildPeriodPhrase(command.period);
  if (/\b(recurring|langganan|subscription)\b/i.test(currentText)) {
    return `top recurring expense ${periodPhrase}`;
  }
  if (/\bmerchant\b/i.test(currentText)) {
    return `merchant apa yang paling ngedorong kenaikan spending ${periodPhrase}`;
  }
  if (/\bkategori|bucket\b/i.test(currentText)) {
    return `kategori mana yang paling naik dibanding ${buildPreviousPeriodPhrase(command.period)}`;
  }
  return null;
};

const buildCashflowFollowUpText = (
  currentText: string,
  command: Extract<GlobalContextRoute["command"], { kind: "CASHFLOW_FORECAST" }>
) => {
  const requestedHorizon = detectRequestedCashflowHorizon(currentText);
  const mode = TOTAL_ONLY_PATTERN.test(currentText) ? "REMAINING" : COUNT_ONLY_PATTERN.test(currentText) ? command.mode : command.mode;
  const horizon = requestedHorizon
    ? requestedHorizon
    : command.horizon;

  const baseQuestion =
    mode === "REMAINING"
      ? horizon === "PAYDAY"
        ? "sampai gajian sisa uang berapa"
        : horizon === "MONTH_END"
          ? "akhir bulan sisa uang berapa"
          : horizon === "NEXT_7_DAYS"
            ? "7 hari ke depan sisa uang berapa"
            : horizon === "WEEKEND"
              ? "weekend ini sisa uang berapa"
              : "besok sisa uang berapa"
      : horizon === "PAYDAY"
        ? "aman sampai gajian gak"
        : horizon === "MONTH_END"
          ? "akhir bulan masih aman gak"
          : horizon === "NEXT_7_DAYS"
            ? "7 hari ke depan masih aman gak"
            : horizon === "WEEKEND"
              ? "weekend ini masih aman gak"
              : "besok masih aman gak";

  if (SCENARIO_EXPENSE_PATTERN.test(currentText)) {
    const cleaned = normalizeText(currentText.replace(/\?+$/g, ""));
    if (/\b(?:besok|weekend|gajian|akhir bulan|bulan ini|7 hari|minggu depan|pekan depan)\b/i.test(cleaned)) {
      return cleaned;
    }
    return `${cleaned} ${baseQuestion}`;
  }

  if (TOTAL_ONLY_PATTERN.test(currentText) || /sisa uang/i.test(currentText)) {
    return baseQuestion.replace("masih aman gak", "sisa uang berapa");
  }
  if (requestedHorizon) {
    return baseQuestion;
  }
  return null;
};

const buildGoalPlanFollowUpText = (
  currentText: string,
  command: Extract<GlobalContextRoute["command"], { kind: "GOAL_PLAN" }>
) => {
  const goalLabel =
    command.goalQuery ??
    (command.goalType === "HOUSE"
      ? "rumah"
      : command.goalType === "VEHICLE"
        ? "kendaraan"
        : command.goalType === "VACATION"
          ? "liburan"
          : command.goalType === "EMERGENCY_FUND"
            ? "dana darurat"
            : command.goalType === "FINANCIAL_FREEDOM"
              ? "financial freedom"
              : null);
  const ratioMatch = currentText.match(RATIO_PATTERN);
  if (ratioMatch) {
    return `kalau tabungan dibagi ${ratioMatch[1]}:${ratioMatch[2]} hasilnya gimana`;
  }
  const growthMatch = currentText.match(EXPENSE_GROWTH_PATTERN);
  if (growthMatch) {
    return `kalau expense naik ${growthMatch[1]}% per tahun target mundur berapa`;
  }
  if (PRIORITY_ONLY_PATTERN.test(currentText)) {
    return "target mana yang paling realistis dulu";
  }
  if (SPLIT_ONLY_PATTERN.test(currentText)) {
    return "tabungan bulan ini dibagi ke target apa";
  }
  if (FOCUS_ONLY_PATTERN.test(currentText)) {
    const focusTarget = extractFollowUpFilterText(currentText) ?? goalLabel;
    if (!focusTarget) return "kalau fokus target utama dulu gimana";
    const monthMatch = currentText.match(/\b(\d{1,2})\s*(?:bulan|bln)\b/i);
    if (monthMatch) {
      return `kalau fokus ${focusTarget} ${monthMatch[1]} bulan dulu gimana`;
    }
    return `kalau fokus ${focusTarget} dulu gimana`;
  }
  return null;
};

const buildOptionClarificationReply = () =>
  "Saya belum yakin pilihan yang dimaksud. Balas nomor opsinya atau tulis ulang singkat nama pilihannya ya Boss.";

const buildAddMoreClarificationReply = () =>
  "Kalau masih mau tambah, balas `Ada`. Kalau sudah selesai, balas `Ga ada` ya Boss.";

const buildGenericClarificationReply = () =>
  "Saya belum yakin konteks `yang tadi` itu yang mana, jadi saya belum mau asumsi. Coba tulis ulang singkat, misalnya `laporan bulan ini`, `harga BTC`, atau `ga ada lagi`.";

const buildMutationOptionReplayText = (params: {
  previousText: string;
  selectedOption: string;
}) => {
  const command = parseMutationCommand(params.previousText);
  if (command.kind === "DELETE") {
    return `hapus transaksi ${params.selectedOption}`;
  }

  if (command.kind === "EDIT") {
    return `ubah ${params.selectedOption} jadi ${command.amount}`;
  }

  return null;
};

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

const getLastMutationUserTurn = (recentTurns: ConversationTurn[]) => {
  for (const turn of recentTurns) {
    if (turn.role !== "user") continue;
    if (parseMutationCommand(turn.text).kind !== "NONE") {
      return turn;
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
  const lastMutationTurn = getLastMutationUserTurn(recentTurns);

  if (assistantReferenceText) {
    const assistantOptions = extractAssistantOptions(assistantReferenceText);
    const selectedOptionIndex = detectSelectedOptionIndex(currentText);
    if (
      assistantOptions.length > 1 &&
      selectedOptionIndex !== null &&
      assistantOptions[selectedOptionIndex]
    ) {
      if (
        /balas nomor transaksi yang dimaksud/i.test(assistantReferenceText) &&
        lastMutationTurn
      ) {
        const mutationReplayText = buildMutationOptionReplayText({
          previousText: lastMutationTurn.text,
          selectedOption: assistantOptions[selectedOptionIndex]
        });

        if (mutationReplayText) {
          return {
            kind: "rewrite",
            effectiveText: mutationReplayText,
            source: "mutation_option_selection",
            referencedText: assistantReferenceText
          };
        }
      }

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

  if (lastSafeReplay?.route.command.kind === "CATEGORY_DETAIL_REPORT") {
    const followUpReplayText = buildCategoryFollowUpText(currentText, lastSafeReplay.route.command);
    if (followUpReplayText) {
      return {
        kind: "rewrite",
        effectiveText: followUpReplayText,
        source: "category_report_follow_up",
        referencedText: lastSafeReplay.turn.text
      };
    }
  }

  if (lastSafeReplay?.route.command.kind === "GENERAL_ANALYTICS_REPORT") {
    const followUpReplayText = buildGeneralAnalyticsFollowUpText(currentText, lastSafeReplay.route.command);
    if (followUpReplayText) {
      return {
        kind: "rewrite",
        effectiveText: followUpReplayText,
        source: "general_analytics_follow_up",
        referencedText: lastSafeReplay.turn.text
      };
    }
  }

  if (lastSafeReplay?.route.command.kind === "CASHFLOW_FORECAST") {
    const followUpReplayText = buildCashflowFollowUpText(currentText, lastSafeReplay.route.command);
    if (followUpReplayText) {
      return {
        kind: "rewrite",
        effectiveText: followUpReplayText,
        source: "cashflow_follow_up",
        referencedText: lastSafeReplay.turn.text
      };
    }
  }

  if (lastSafeReplay?.route.command.kind === "GOAL_PLAN") {
    const followUpReplayText = buildGoalPlanFollowUpText(currentText, lastSafeReplay.route.command);
    if (followUpReplayText) {
      return {
        kind: "rewrite",
        effectiveText: followUpReplayText,
        source: "goal_plan_follow_up",
        referencedText: lastSafeReplay.turn.text
      };
    }
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
