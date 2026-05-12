import { parsePositiveAmount } from "@/lib/services/transactions/amount";
import type {
  ParsedAddAsset,
  SupportedPortfolioAssetType
} from "@/lib/services/market/commands/portfolio-command.types";
import {
  normalizePortfolioSymbol,
  normalizeSpaces,
  parseDecimal
} from "@/lib/services/market/commands/portfolio-formatters";

const parseCryptoAdd = (text: string): ParsedAddAsset | null => {
  const directSymbolFirst = text.match(
    /^(?:tambah|catat|punya)\s+([a-z0-9/]{2,12})\s+([\d.,]+)\s+harga\s+(.+)$/i
  );
  if (directSymbolFirst) {
    const normalizedSymbol = normalizePortfolioSymbol("crypto", directSymbolFirst[1].toUpperCase());
    if (/^(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|DOT|AVAX|USDT)$/i.test(normalizedSymbol)) {
      const quantity = parseDecimal(directSymbolFirst[2]);
      const pricePerUnit = parsePositiveAmount(directSymbolFirst[3]);
      if (quantity && pricePerUnit) {
        return {
          assetType: "CRYPTO",
          symbol: normalizedSymbol,
          displayName: normalizedSymbol,
          quantity,
          unit: "coin",
          pricePerUnit
        };
      }
    }
  }

  const match = text.match(
    /^(?:tambah|catat|punya)\s+(?:crypto\s+|kripto\s+)?([a-z0-9/]{2,12})\s+([\d.,]+)\s+harga\s+(.+)$/i
  );
  if (!match) return null;

  const symbol = normalizePortfolioSymbol("crypto", match[1]);
  if (!/^[A-Z]{2,10}$/.test(symbol)) return null;

  const quantity = parseDecimal(match[2]);
  const pricePerUnit = parsePositiveAmount(match[3]);
  if (!quantity || !pricePerUnit) return null;

  return {
    assetType: "CRYPTO",
    symbol,
    displayName: symbol,
    quantity,
    unit: "coin",
    pricePerUnit
  };
};

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
  parseCryptoAdd(text) ?? parseDirectAmountAsset(text) ?? parseNamedAsset(text);
