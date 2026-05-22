import { parsePositiveAmount } from "@/lib/services/transactions/amount";
import type {
  ParsedAddAsset,
  SupportedPortfolioAssetType
} from "@/lib/services/market/commands/portfolio-command.types";
import {
  normalizeSpaces
} from "@/lib/services/market/commands/portfolio-formatters";

const parseDirectAmountAsset = (text: string) => {
  const directAmountMatch = text.match(/^(?:tambah|catat|punya)\s+(tabungan|cash|kas|deposito)\s+(.+)$/i);
  if (!directAmountMatch) return null;

  const price = parsePositiveAmount(directAmountMatch[2]);
  if (!price) return null;
  const directTypeMap: Record<string, ParsedAddAsset> = {
    tabungan: { assetType: "DEPOSIT", symbol: "TABUNGAN", displayName: "Tabungan", quantity: 1, unit: "unit", pricePerUnit: price },
    cash: { assetType: "DEPOSIT", symbol: "CASH", displayName: "Cash", quantity: 1, unit: "unit", pricePerUnit: price },
    kas: { assetType: "DEPOSIT", symbol: "KAS", displayName: "Kas", quantity: 1, unit: "unit", pricePerUnit: price },
    deposito: { assetType: "DEPOSIT", symbol: "DEPOSITO", displayName: "Deposito", quantity: 1, unit: "unit", pricePerUnit: price }
  };

  return directTypeMap[directAmountMatch[1].toLowerCase()] ?? null;
};

const parseNamedAsset = (text: string): ParsedAddAsset | null => {
  const match = text.match(
    /^(?:tambah|catat|punya)\s+(tabungan|cash|kas|deposito|properti|bisnis)(?:\s+(.+?))?\s+(?:senilai|sebesar|harga|nilai)\s+(.+)$/i
  );
  if (!match) return null;

  const rawType = match[1].toLowerCase();
  const defaultNameMap: Record<string, string> = {
    tabungan: "Tabungan",
    cash: "Cash",
    kas: "Kas",
    deposito: "Deposito",
    properti: "Properti",
    bisnis: "Bisnis"
  };
  const name = normalizeSpaces(match[2] ?? defaultNameMap[rawType] ?? "Aset");
  const price = parsePositiveAmount(match[3]);
  if (!name || !price) return null;

  const typeMap: Record<string, SupportedPortfolioAssetType> = {
    tabungan: "DEPOSIT",
    cash: "DEPOSIT",
    kas: "DEPOSIT",
    deposito: "DEPOSIT",
    properti: "PROPERTY",
    bisnis: "BUSINESS"
  };

  return {
    assetType: typeMap[rawType] ?? "OTHER",
    symbol: name.toUpperCase().slice(0, 24),
    displayName: name,
    quantity: 1,
    unit: "unit",
    pricePerUnit: price
  };
};

export const parseAddAssetCommand = (text: string): ParsedAddAsset | null =>
  parseDirectAmountAsset(text) ?? parseNamedAsset(text);
