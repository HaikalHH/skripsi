import { formatMoney } from "@/lib/services/shared/money-format";
import type {
  ParsedAddAsset,
  StockDraft,
  StockQuestion
} from "@/lib/services/market/commands/portfolio-command.types";
import {
  STOCK_CONFIRM_QUESTION,
  STOCK_CORRECTION_QUESTION,
  STOCK_PRICE_QUESTION,
  STOCK_QUANTITY_QUESTION,
  STOCK_SYMBOL_QUESTION
} from "@/lib/services/market/commands/stock-command-constants";
import { STOCK_COUNT_FORMATTER } from "@/lib/services/market/commands/portfolio-formatters";

export const getStockQuestionText = (question: Exclude<StockQuestion, "CONFIRM">) => {
  switch (question) {
    case "SYMBOL":
      return STOCK_SYMBOL_QUESTION;
    case "QUANTITY":
      return STOCK_QUANTITY_QUESTION;
    case "PRICE":
      return STOCK_PRICE_QUESTION;
    case "CORRECTION":
      return STOCK_CORRECTION_QUESTION;
  }
};

export const formatStockQuantityLabel = (draft: StockDraft) => {
  if (!draft.quantityAmount || !draft.quantityUnit || !draft.quantityShares) return "-";
  if (draft.quantityUnit === "lot") {
    return `${STOCK_COUNT_FORMATTER.format(draft.quantityAmount)} lot (${STOCK_COUNT_FORMATTER.format(
      draft.quantityShares
    )} lembar)`;
  }

  return `${STOCK_COUNT_FORMATTER.format(draft.quantityShares)} lembar`;
};

export const buildStockSummaryReply = (draft: StockDraft) => {
  const totalValue = (draft.quantityShares ?? 0) * (draft.pricePerUnit ?? 0);
  return [
    "Berikut catatan saham kamu:",
    `- Kode saham : ${draft.symbol ?? "-"}`,
    `- Jumlah     : ${formatStockQuantityLabel(draft)}`,
    `- Harga beli : ${formatMoney(draft.pricePerUnit ?? 0)}/lembar`,
    `- Total nilai: ${formatMoney(totalValue)}`,
    "",
    STOCK_CONFIRM_QUESTION
  ].join("\n");
};

export const buildStockAddInput = (draft: StockDraft): ParsedAddAsset | null => {
  if (!draft.symbol || !draft.quantityShares || !draft.pricePerUnit) return null;

  return {
    assetType: "STOCK",
    symbol: draft.symbol,
    displayName: draft.symbol,
    quantity: draft.quantityShares,
    unit: "share",
    pricePerUnit: draft.pricePerUnit
  };
};

export const buildStockSuccessReply = (draft: StockDraft) => {
  const totalValue = (draft.quantityShares ?? 0) * (draft.pricePerUnit ?? 0);
  return [
    `\u2705 Saham berhasil dicatat: ${draft.symbol ?? "Saham"}`,
    `- Jumlah: ${formatStockQuantityLabel(draft)}`,
    `- Harga beli: ${formatMoney(draft.pricePerUnit ?? 0)}/lembar`,
    `- Total nilai: ${formatMoney(totalValue)}`,
    "",
    "Ketik *portfolio aku* untuk lihat nilai aset dan komposisinya."
  ].join("\n");
};
