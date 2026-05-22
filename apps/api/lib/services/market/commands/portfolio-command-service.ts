import { PortfolioAssetType } from "@prisma/client";
import { formatMoney } from "@/lib/services/shared/money";
import { getPortfolioNewsContext } from "@/lib/services/market/portfolio/portfolio-news-context";
import { normalizeSpaces, toNumber } from "@/lib/services/market/commands/portfolio-formatters";
import { tryResolveGoldAdd } from "@/lib/services/market/commands/gold-add-resolver";
import { buildGoldSuccessReply } from "@/lib/services/market/commands/gold-reply-builder";
import { tryResolveStockAdd } from "@/lib/services/market/commands/stock-add-resolver";
import { buildStockSuccessReply } from "@/lib/services/market/commands/stock-reply-builder";
import { createOrUpdateAsset, getPortfolioCommandModel } from "@/lib/services/market/commands/portfolio-asset-writer";
import {
  isPortfolioDiversificationCommand,
  isPortfolioDominanceCommand,
  isPortfolioPerformanceCommand,
  isPortfolioRiskCommand,
  isPortfolioSummaryCommand
} from "@/lib/services/market/commands/portfolio-command-parser";
import {
  buildPortfolioDiversificationReply,
  buildPortfolioDominanceReply,
  buildPortfolioPerformanceReply,
  buildPortfolioRiskReply,
  buildPortfolioSummary
} from "@/lib/services/market/commands/portfolio-reply-builder";
import { parseAddAssetCommand } from "@/lib/services/market/commands/simple-asset-parser";
import type { PortfolioReplyPayload } from "@/lib/services/market/commands/portfolio-summary-reply";

export { getPortfolioNewsContext };
export type { PortfolioNewsContextItem } from "@/lib/services/market/portfolio/portfolio-news-context";

const PORTFOLIO_NOT_READY_REPLY =
  "Fitur portfolio butuh migrasi DB + `prisma generate` sebelum dipakai.";

const ensurePortfolioReady = () => Boolean(getPortfolioCommandModel());

type PortfolioCommandResult =
  | { handled: false }
  | ({
      handled: true;
    } & PortfolioReplyPayload);

type PortfolioReplyBuilder = (userId: string) => Promise<string | PortfolioReplyPayload>;

const normalizePortfolioReply = (reply: string | PortfolioReplyPayload): PortfolioReplyPayload =>
  typeof reply === "string" ? { replyText: reply } : reply;

const buildSavedAssetReply = (saved: {
  assetType: PortfolioAssetType;
  displayName: string;
  quantity: unknown;
  unit: string;
  averageBuyPrice: unknown;
}) => {
  const amountLabel =
    saved.assetType === PortfolioAssetType.DEPOSIT
      ? "Saldo"
      : saved.assetType === PortfolioAssetType.PROPERTY ||
          saved.assetType === PortfolioAssetType.BUSINESS ||
          saved.assetType === PortfolioAssetType.OTHER
        ? "Nilai"
        : "Harga rata-rata";

  return [
    `Aset berhasil dicatat: ${saved.displayName}`,
    `- Qty: ${toNumber(saved.quantity).toFixed(4)} ${saved.unit}`,
    `- ${amountLabel}: ${formatMoney(toNumber(saved.averageBuyPrice))}`,
    "Ketik `portfolio aku` untuk lihat nilai aset dan komposisinya."
  ].join("\n");
};

export const tryHandlePortfolioCommand = async (params: {
  userId: string;
  text: string;
  currentMessageId?: string;
}): Promise<PortfolioCommandResult> => {
  const text = normalizeSpaces(params.text);
  const portfolioModelReady = ensurePortfolioReady();

  const analysisReply = await tryBuildPortfolioAnalysisReply(params.userId, text, portfolioModelReady);
  if (analysisReply) return analysisReply;

  const stockAdd = await tryResolveStockAdd({
    userId: params.userId,
    text,
    currentMessageId: params.currentMessageId
  });
  if (stockAdd?.handled) {
    if (!portfolioModelReady) return { handled: true as const, replyText: PORTFOLIO_NOT_READY_REPLY };
    if ("input" in stockAdd) {
      await createOrUpdateAsset({ userId: params.userId, input: stockAdd.input });
      return { handled: true as const, replyText: buildStockSuccessReply(stockAdd.draft) };
    }
    return stockAdd;
  }

  const goldAdd = await tryResolveGoldAdd({
    userId: params.userId,
    text,
    currentMessageId: params.currentMessageId
  });
  if (goldAdd?.handled) {
    if (!portfolioModelReady) return { handled: true as const, replyText: PORTFOLIO_NOT_READY_REPLY };
    if ("input" in goldAdd) {
      await createOrUpdateAsset({ userId: params.userId, input: goldAdd.input });
      return { handled: true as const, replyText: buildGoldSuccessReply(goldAdd.draft) };
    }
    return goldAdd;
  }

  const addCommand = parseAddAssetCommand(text);
  if (!addCommand) return { handled: false as const };
  if (!portfolioModelReady) return { handled: true as const, replyText: PORTFOLIO_NOT_READY_REPLY };

  const saved = await createOrUpdateAsset({ userId: params.userId, input: addCommand });
  return { handled: true as const, replyText: buildSavedAssetReply(saved) };
};

const tryBuildPortfolioAnalysisReply = async (
  userId: string,
  text: string,
  portfolioModelReady: boolean
) => {
  const buildReply = async (builder: PortfolioReplyBuilder): Promise<PortfolioCommandResult> => {
    if (!portfolioModelReady) return { handled: true as const, replyText: PORTFOLIO_NOT_READY_REPLY };
    return { handled: true as const, ...normalizePortfolioReply(await builder(userId)) };
  };

  if (isPortfolioSummaryCommand(text)) return buildReply(buildPortfolioSummary);
  if (isPortfolioRiskCommand(text)) return buildReply(buildPortfolioRiskReply);
  if (isPortfolioPerformanceCommand(text)) return buildReply(buildPortfolioPerformanceReply);
  if (isPortfolioDiversificationCommand(text)) return buildReply(buildPortfolioDiversificationReply);
  if (isPortfolioDominanceCommand(text)) return buildReply(buildPortfolioDominanceReply);
  return null;
};
