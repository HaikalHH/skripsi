import { AnalysisType, FinancialGoalType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAIAnalysisLog } from "@/lib/services/ai/ai-log-service";
import { buildGoalIntentDetails } from "@/lib/services/planning/goal-intent-service";
import {
  addGoalContributionAndRecordSaving,
  getSavingsGoalStatus
} from "@/lib/services/planning/goal-service";
import { tryHandlePortfolioCommand } from "@/lib/services/market/portfolio-command-service";
import { parsePositiveAmount } from "@/lib/services/transactions/amount-parser";
import { normalizeExpenseBucketCategory } from "@/lib/services/transactions/category-override-service";
import { formatMoney } from "@/lib/services/shared/money-format";
import {
  buildGoalContributionText,
  buildGoalStatusText
} from "@/lib/features/inbound/formatters";
import { ok, type InboundHandlerResult } from "@/lib/features/inbound/result";
import {
  stageBudgetAndBuildReply,
  stageGoalAndBuildReply
} from "@/lib/services/assistant/pending-action-service";

type CommandFlowName =
  | "SET_GOAL"
  | "GOAL_ADD"
  | "GOAL_STATUS"
  | "BUDGET_SET"
  | "ASSET_ADD";

type SetGoalFlowPayload = {
  kind: "COMMAND_FLOW";
  flow: "SET_GOAL";
  step: "ASK_NAME" | "ASK_AMOUNT" | "ASK_DUE";
  data: {
    goalName?: string | null;
    goalQuery?: string | null;
    goalType?: FinancialGoalType | null;
    targetAmount?: number | null;
  };
  sourceMessageId: string;
};

type GoalAddFlowPayload = {
  kind: "COMMAND_FLOW";
  flow: "GOAL_ADD";
  step: "ASK_GOAL" | "ASK_AMOUNT";
  data: {
    goalQuery?: string | null;
    goalType?: FinancialGoalType | null;
  };
  sourceMessageId: string;
};

type GoalStatusFlowPayload = {
  kind: "COMMAND_FLOW";
  flow: "GOAL_STATUS";
  step: "ASK_GOAL";
  data: Record<string, never>;
  sourceMessageId: string;
};

type BudgetSetFlowPayload = {
  kind: "COMMAND_FLOW";
  flow: "BUDGET_SET";
  step: "ASK_CATEGORY" | "ASK_AMOUNT";
  data: {
    category?: string | null;
  };
  sourceMessageId: string;
};

type AssetAddFlowPayload = {
  kind: "COMMAND_FLOW";
  flow: "ASSET_ADD";
  step:
    | "ASK_TYPE"
    | "ASK_NAME"
    | "ASK_VALUE"
    | "ASK_CRYPTO_SYMBOL"
    | "ASK_CRYPTO_QUANTITY"
    | "ASK_CRYPTO_PRICE";
  data: {
    assetKind?: "DEPOSIT" | "PROPERTY" | "BUSINESS" | "OTHER" | "CRYPTO" | null;
    rawType?: string | null;
    displayName?: string | null;
    symbol?: string | null;
    quantity?: number | null;
  };
  sourceMessageId: string;
};

type CommandFlowPayload =
  | SetGoalFlowPayload
  | GoalAddFlowPayload
  | GoalStatusFlowPayload
  | BudgetSetFlowPayload
  | AssetAddFlowPayload;

type CommandFlowResolutionPayload = {
  kind: "COMMAND_FLOW_RESOLUTION";
  flowId: string;
  action: "COMPLETED" | "CANCELLED" | "REPLACED";
  sourceMessageId: string;
};

type ActiveCommandFlow = {
  id: string;
  payload: CommandFlowPayload;
};

const FLOW_START_PROMPTS: Record<CommandFlowName, string> = {
  SET_GOAL: "Nama goal-nya apa Boss?",
  GOAL_ADD: "Mau masukin setoran ke goal yang mana Boss?",
  GOAL_STATUS: "Mau cek goal yang mana Boss?",
  BUDGET_SET: "Budget kategori apa Boss?",
  ASSET_ADD:
    "Mau tambah aset apa Boss?\n\nPilih salah satu: emas, saham, crypto, tabungan/kas, deposito, properti, bisnis, atau lainnya."
};

const MONTH_ALIASES: Array<{ month: number; aliases: string[] }> = [
  { month: 1, aliases: ["januari", "jan", "january"] },
  { month: 2, aliases: ["februari", "feb", "february"] },
  { month: 3, aliases: ["maret", "mar", "march"] },
  { month: 4, aliases: ["april", "apr"] },
  { month: 5, aliases: ["mei", "may"] },
  { month: 6, aliases: ["juni", "jun", "june", "uni"] },
  { month: 7, aliases: ["juli", "jul", "july"] },
  { month: 8, aliases: ["agustus", "agu", "agt", "aug", "august"] },
  { month: 9, aliases: ["september", "sep", "sept"] },
  { month: 10, aliases: ["oktober", "okt", "october", "oct"] },
  { month: 11, aliases: ["november", "nov"] },
  { month: 12, aliases: ["desember", "des", "december", "dec"] }
];

const MONTH_LOOKUP = new Map<string, number>();
for (const entry of MONTH_ALIASES) {
  for (const alias of entry.aliases) {
    MONTH_LOOKUP.set(alias, entry.month);
  }
}

const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric"
});

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

const titleCase = (value: string) =>
  normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

const formatMonthYearLabel = (month: number, year: number) =>
  MONTH_YEAR_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)));

const parseMonthYear = (rawText: string) => {
  const text = normalizeText(rawText).toLowerCase();
  const numeric = text.match(/\b(0?[1-9]|1[0-2])\s*[\/-]\s*(\d{2}|\d{4})\b/);
  if (numeric) {
    const month = Number(numeric[1]);
    const yearRaw = Number(numeric[2]);
    return {
      month,
      year: yearRaw < 100 ? 2000 + yearRaw : yearRaw
    };
  }

  const monthNamePattern = Array.from(MONTH_LOOKUP.keys())
    .sort((left, right) => right.length - left.length)
    .map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const named = text.match(new RegExp(`\\b(${monthNamePattern})\\b\\s+(\\d{2}|\\d{4})\\b`, "i"));
  if (!named) return null;

  const yearRaw = Number(named[2]);
  return {
    month: MONTH_LOOKUP.get(named[1].toLowerCase()) ?? null,
    year: yearRaw < 100 ? 2000 + yearRaw : yearRaw
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isCommandFlowPayload = (value: unknown): value is CommandFlowPayload =>
  isRecord(value) &&
  value.kind === "COMMAND_FLOW" &&
  typeof value.flow === "string" &&
  typeof value.step === "string" &&
  isRecord(value.data) &&
  typeof value.sourceMessageId === "string";

const isFlowResolutionPayload = (value: unknown): value is CommandFlowResolutionPayload =>
  isRecord(value) &&
  value.kind === "COMMAND_FLOW_RESOLUTION" &&
  typeof value.flowId === "string";

const getAnalysisLogModel = () => (prisma as { aIAnalysisLog?: any }).aIAnalysisLog;

const createFlow = async (params: {
  userId: string;
  messageId: string;
  payload: CommandFlowPayload;
}) =>
  createAIAnalysisLog({
    userId: params.userId,
    messageId: params.messageId,
    analysisType: AnalysisType.INSIGHT,
    payload: params.payload
  });

const markFlowResolved = async (params: {
  userId: string;
  messageId: string;
  flowId: string;
  action: CommandFlowResolutionPayload["action"];
}) =>
  createAIAnalysisLog({
    userId: params.userId,
    messageId: params.messageId,
    analysisType: AnalysisType.INSIGHT,
    payload: {
      kind: "COMMAND_FLOW_RESOLUTION",
      flowId: params.flowId,
      action: params.action,
      sourceMessageId: params.messageId
    } satisfies CommandFlowResolutionPayload
  });

const findLatestActiveFlow = async (userId: string): Promise<ActiveCommandFlow | null> => {
  const model = getAnalysisLogModel();
  if (!model?.findMany) return null;

  const rows = await model.findMany({
    where: {
      userId,
      analysisType: AnalysisType.INSIGHT
    },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  const resolvedFlowIds = new Set<string>();
  for (const row of rows) {
    const payload = row.payloadJson;
    if (isFlowResolutionPayload(payload)) {
      resolvedFlowIds.add(payload.flowId);
      continue;
    }
    if (isCommandFlowPayload(payload) && !resolvedFlowIds.has(row.id)) {
      return {
        id: row.id,
        payload
      };
    }
  }

  return null;
};

const replaceFlow = async (params: {
  userId: string;
  messageId: string;
  currentFlowId: string;
  payload: CommandFlowPayload;
}) => {
  await markFlowResolved({
    userId: params.userId,
    messageId: params.messageId,
    flowId: params.currentFlowId,
    action: "REPLACED"
  });
  await createFlow({
    userId: params.userId,
    messageId: params.messageId,
    payload: params.payload
  });
};

const cancelPattern = /^(batal|cancel|buang|stop|udah|selesai)$/i;

const parseGoalNameAnswer = (text: string) => {
  const goalIntent = buildGoalIntentDetails(text);
  const goalName = goalIntent.goalName ?? titleCase(text);
  return {
    goalName,
    goalQuery: goalIntent.goalQuery ?? goalName,
    goalType: goalIntent.goalType ?? FinancialGoalType.CUSTOM
  };
};

const parseGoalSelectionAnswer = (text: string) => {
  const goalIntent = buildGoalIntentDetails(text);
  return {
    goalQuery: goalIntent.goalQuery ?? goalIntent.goalName ?? titleCase(text),
    goalType: goalIntent.goalType
  };
};

const parseAssetType = (text: string) => {
  const normalized = normalizeText(text).toLowerCase();
  if (/\bemas|gold\b/i.test(normalized)) return { kind: "GOLD" as const };
  if (/\bsaham|stock\b/i.test(normalized)) return { kind: "STOCK" as const };
  if (/\bcrypto|kripto|coin\b/i.test(normalized)) return { kind: "CRYPTO" as const, rawType: "crypto" };
  if (/\b(tabungan|kas|cash)\b/i.test(normalized)) return { kind: "DEPOSIT" as const, rawType: "tabungan" };
  if (/\bdeposito\b/i.test(normalized)) return { kind: "DEPOSIT" as const, rawType: "deposito" };
  if (/\bproperti|property\b/i.test(normalized)) return { kind: "PROPERTY" as const, rawType: "properti" };
  if (/\bbisnis|business\b/i.test(normalized)) return { kind: "BUSINESS" as const, rawType: "bisnis" };
  if (/\blain|lainnya|other\b/i.test(normalized)) return { kind: "OTHER" as const, rawType: "aset" };
  return null;
};

const runPortfolioSyntheticCommand = async (params: {
  userId: string;
  messageId: string;
  text: string;
}) => {
  const portfolio = await tryHandlePortfolioCommand({
    userId: params.userId,
    text: params.text,
    currentMessageId: params.messageId
  });
  if (portfolio.handled) return ok({ replyText: portfolio.replyText });

  return ok({
    replyText:
      "Saya belum bisa menyimpan aset dari jawaban itu. Coba ulangi dari `/tambah aset` dan isi datanya satu per satu."
  });
};

export const startCommandFlow = async (params: {
  userId: string;
  messageId: string;
  flow: CommandFlowName;
}): Promise<InboundHandlerResult> => {
  const basePayload = {
    kind: "COMMAND_FLOW" as const,
    flow: params.flow,
    step:
      params.flow === "SET_GOAL"
        ? "ASK_NAME"
        : params.flow === "GOAL_ADD"
          ? "ASK_GOAL"
          : params.flow === "GOAL_STATUS"
            ? "ASK_GOAL"
            : params.flow === "BUDGET_SET"
              ? "ASK_CATEGORY"
              : "ASK_TYPE",
    data: {},
    sourceMessageId: params.messageId
  } as CommandFlowPayload;

  await createFlow({
    userId: params.userId,
    messageId: params.messageId,
    payload: basePayload
  });

  return ok({ replyText: FLOW_START_PROMPTS[params.flow] });
};

export const tryHandleCommandFlowAnswer = async (params: {
  userId: string;
  messageId: string;
  text: string;
}): Promise<InboundHandlerResult | null> => {
  const text = normalizeText(params.text);
  if (!text || text.startsWith("/")) return null;

  const activeFlow = await findLatestActiveFlow(params.userId);
  if (!activeFlow) return null;

  if (cancelPattern.test(text)) {
    await markFlowResolved({
      userId: params.userId,
      messageId: params.messageId,
      flowId: activeFlow.id,
      action: "CANCELLED"
    });
    return ok({ replyText: "Oke, flow ini saya batalkan. Tidak ada data yang disimpan." });
  }

  const { payload } = activeFlow;

  if (payload.flow === "SET_GOAL") {
    if (payload.step === "ASK_NAME") {
      const goal = parseGoalNameAnswer(text);
      await replaceFlow({
        userId: params.userId,
        messageId: params.messageId,
        currentFlowId: activeFlow.id,
        payload: {
          ...payload,
          step: "ASK_AMOUNT",
          data: goal
        }
      });
      return ok({ replyText: `Target ${goal.goalName} jumlahnya berapa Boss?` });
    }

    if (payload.step === "ASK_AMOUNT") {
      const amount = parsePositiveAmount(text);
      if (!amount) {
        return ok({ replyText: "Nominalnya belum kebaca. Tulis misalnya `20jt` atau `Rp20.000.000`." });
      }
      await replaceFlow({
        userId: params.userId,
        messageId: params.messageId,
        currentFlowId: activeFlow.id,
        payload: {
          ...payload,
          step: "ASK_DUE",
          data: {
            ...payload.data,
            targetAmount: amount
          }
        }
      });
      return ok({ replyText: "Mau dicapai kapan Boss? Contoh: `06/2030` atau `Juni 2030`." });
    }

    const due = parseMonthYear(text);
    if (!due?.month || !due.year) {
      return ok({ replyText: "Target waktunya belum kebaca. Tulis bulan dan tahun, contoh `Juni 2030`." });
    }

    await markFlowResolved({
      userId: params.userId,
      messageId: params.messageId,
      flowId: activeFlow.id,
      action: "COMPLETED"
    });
    return stageGoalAndBuildReply({
      userId: params.userId,
      messageId: params.messageId,
      targetAmount: payload.data.targetAmount ?? 0,
      goalName: payload.data.goalName ?? null,
      goalType: payload.data.goalType ?? null,
      goalQuery: payload.data.goalQuery ?? payload.data.goalName ?? null,
      targetMonth: due.month,
      targetYear: due.year
    });
  }

  if (payload.flow === "GOAL_ADD") {
    if (payload.step === "ASK_GOAL") {
      const goal = parseGoalSelectionAnswer(text);
      await replaceFlow({
        userId: params.userId,
        messageId: params.messageId,
        currentFlowId: activeFlow.id,
        payload: {
          ...payload,
          step: "ASK_AMOUNT",
          data: goal
        }
      });
      return ok({ replyText: `Mau masukin berapa ke ${goal.goalQuery ?? "goal itu"} Boss?` });
    }

    const amount = parsePositiveAmount(text);
    if (!amount) {
      return ok({ replyText: "Nominal setorannya belum kebaca. Tulis misalnya `500rb` atau `Rp500.000`." });
    }
    await markFlowResolved({
      userId: params.userId,
      messageId: params.messageId,
      flowId: activeFlow.id,
      action: "COMPLETED"
    });
    const contribution = await addGoalContributionAndRecordSaving(params.userId, amount, {
      goalQuery: payload.data.goalQuery ?? null,
      goalType: payload.data.goalType ?? null
    });
    return ok({ replyText: buildGoalContributionText(contribution) });
  }

  if (payload.flow === "GOAL_STATUS") {
    await markFlowResolved({
      userId: params.userId,
      messageId: params.messageId,
      flowId: activeFlow.id,
      action: "COMPLETED"
    });
    const goal = parseGoalSelectionAnswer(text);
    const status = await getSavingsGoalStatus(params.userId, goal);
    return ok({ replyText: buildGoalStatusText(status) });
  }

  if (payload.flow === "BUDGET_SET") {
    if (payload.step === "ASK_CATEGORY") {
      const category = normalizeExpenseBucketCategory(text);
      await replaceFlow({
        userId: params.userId,
        messageId: params.messageId,
        currentFlowId: activeFlow.id,
        payload: {
          ...payload,
          step: "ASK_AMOUNT",
          data: { category }
        }
      });
      return ok({ replyText: `Limit bulanan untuk ${category} berapa Boss?` });
    }

    const amount = parsePositiveAmount(text);
    if (!amount) {
      return ok({ replyText: "Nominal budget belum kebaca. Tulis misalnya `2jt` atau `Rp2.000.000`." });
    }
    await markFlowResolved({
      userId: params.userId,
      messageId: params.messageId,
      flowId: activeFlow.id,
      action: "COMPLETED"
    });
    return stageBudgetAndBuildReply({
      userId: params.userId,
      messageId: params.messageId,
      category: payload.data.category ?? "Others",
      monthlyLimit: amount
    });
  }

  if (payload.flow === "ASSET_ADD") {
    if (payload.step === "ASK_TYPE") {
      const assetType = parseAssetType(text);
      if (!assetType) {
        return ok({
          replyText:
            "Jenis asetnya belum kebaca. Pilih salah satu: emas, saham, crypto, tabungan/kas, deposito, properti, bisnis, atau lainnya."
        });
      }

      if (assetType.kind === "GOLD" || assetType.kind === "STOCK") {
        await markFlowResolved({
          userId: params.userId,
          messageId: params.messageId,
          flowId: activeFlow.id,
          action: "COMPLETED"
        });
        return runPortfolioSyntheticCommand({
          userId: params.userId,
          messageId: params.messageId,
          text: assetType.kind === "GOLD" ? "tambah emas" : "tambah saham"
        });
      }

      if (assetType.kind === "CRYPTO") {
        await replaceFlow({
          userId: params.userId,
          messageId: params.messageId,
          currentFlowId: activeFlow.id,
          payload: {
            ...payload,
            step: "ASK_CRYPTO_SYMBOL",
            data: { assetKind: "CRYPTO", rawType: "crypto" }
          }
        });
        return ok({ replyText: "Kode crypto-nya apa Boss? Contoh: BTC, ETH, SOL." });
      }

      const needsName = assetType.kind !== "DEPOSIT";
      await replaceFlow({
        userId: params.userId,
        messageId: params.messageId,
        currentFlowId: activeFlow.id,
        payload: {
          ...payload,
          step: needsName ? "ASK_NAME" : "ASK_VALUE",
          data: {
            assetKind: assetType.kind,
            rawType: assetType.rawType,
            displayName: needsName ? null : titleCase(assetType.rawType)
          }
        }
      });
      return ok({
        replyText: needsName ? "Nama asetnya apa Boss?" : `Nilai ${titleCase(assetType.rawType)} sekarang berapa Boss?`
      });
    }

    if (payload.step === "ASK_NAME") {
      await replaceFlow({
        userId: params.userId,
        messageId: params.messageId,
        currentFlowId: activeFlow.id,
        payload: {
          ...payload,
          step: "ASK_VALUE",
          data: {
            ...payload.data,
            displayName: titleCase(text)
          }
        }
      });
      return ok({ replyText: `Nilai ${titleCase(text)} sekarang berapa Boss?` });
    }

    if (payload.step === "ASK_VALUE") {
      const amount = parsePositiveAmount(text);
      if (!amount) {
        return ok({ replyText: "Nilainya belum kebaca. Tulis misalnya `5jt` atau `Rp5.000.000`." });
      }
      await markFlowResolved({
        userId: params.userId,
        messageId: params.messageId,
        flowId: activeFlow.id,
        action: "COMPLETED"
      });

      const rawType = payload.data.rawType ?? "aset";
      const displayName = payload.data.displayName ?? titleCase(rawType);
      const syntheticText =
        payload.data.assetKind === "DEPOSIT"
          ? `tambah ${rawType} ${formatMoney(amount)}`
          : `tambah ${rawType} ${displayName} senilai ${formatMoney(amount)}`;
      return runPortfolioSyntheticCommand({
        userId: params.userId,
        messageId: params.messageId,
        text: syntheticText
      });
    }

    if (payload.step === "ASK_CRYPTO_SYMBOL") {
      await replaceFlow({
        userId: params.userId,
        messageId: params.messageId,
        currentFlowId: activeFlow.id,
        payload: {
          ...payload,
          step: "ASK_CRYPTO_QUANTITY",
          data: {
            ...payload.data,
            symbol: text.toUpperCase().replace(/[^A-Z0-9]/g, "")
          }
        }
      });
      return ok({ replyText: `Jumlah ${text.toUpperCase()} yang kamu punya berapa Boss?` });
    }

    if (payload.step === "ASK_CRYPTO_QUANTITY") {
      const quantity = Number(text.replace(",", ".").replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return ok({ replyText: "Jumlah crypto-nya belum kebaca. Contoh: `0.05` atau `1,5`." });
      }
      await replaceFlow({
        userId: params.userId,
        messageId: params.messageId,
        currentFlowId: activeFlow.id,
        payload: {
          ...payload,
          step: "ASK_CRYPTO_PRICE",
          data: {
            ...payload.data,
            quantity
          }
        }
      });
      return ok({ replyText: "Harga beli per unitnya berapa Boss?" });
    }

    const price = parsePositiveAmount(text);
    if (!price) {
      return ok({ replyText: "Harga belinya belum kebaca. Tulis misalnya `900jt` atau `Rp900.000.000`." });
    }
    await markFlowResolved({
      userId: params.userId,
      messageId: params.messageId,
      flowId: activeFlow.id,
      action: "COMPLETED"
    });
    return runPortfolioSyntheticCommand({
      userId: params.userId,
      messageId: params.messageId,
      text: `tambah crypto ${payload.data.symbol ?? ""} ${payload.data.quantity ?? ""} harga ${formatMoney(price)}`
    });
  }

  return null;
};
