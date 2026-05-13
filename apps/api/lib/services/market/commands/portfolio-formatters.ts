import { formatMoney } from "@/lib/services/shared/money";
import { normalizeMarketSymbolForKind } from "@/lib/services/market/symbol";

export const normalizeSpaces = (value: string) => value.trim().replace(/\s+/g, " ");

export const normalizePortfolioSymbol = (kind: "stock" | "crypto" | "gold", value: string) =>
  normalizeMarketSymbolForKind(value, kind)?.canonicalSymbol ?? value.trim().toUpperCase();

export const GRAM_FORMATTER = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4
});

export const STOCK_COUNT_FORMATTER = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const PORTFOLIO_PERCENT_FORMATTER = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

export const formatPortfolioMoney = (amount: number) =>
  formatMoney(amount).replace(/^(-?)Rp/, "$1Rp ");

export const formatPortfolioSignedMoney = (amount: number, showPlusForPositive = false) => {
  const normalized = Math.abs(amount) < 0.5 ? 0 : amount;
  const absolute = formatPortfolioMoney(Math.abs(normalized));
  if (normalized < 0) return `-${absolute}`;
  if (normalized > 0 && showPlusForPositive) return `+${absolute}`;
  return absolute;
};

export const formatPortfolioPercent = (value: number) =>
  `${PORTFOLIO_PERCENT_FORMATTER.format(Math.round(value))}%`;

export const formatPortfolioScore = (value: number) =>
  PORTFOLIO_PERCENT_FORMATTER.format(Math.max(0, Math.round(value)));

export const allocatePortfolioShares = (values: number[]) => {
  if (!values.length) return [];
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);

  const ranked = values.map((value, index) => {
    const rawPercent = (value / total) * 100;
    const floored = Math.floor(rawPercent);
    return { index, value, floored, remainder: rawPercent - floored };
  });
  const shares = ranked.map((entry) => entry.floored);

  ranked
    .slice()
    .sort((left, right) => {
      if (right.remainder !== left.remainder) return right.remainder - left.remainder;
      if (right.value !== left.value) return right.value - left.value;
      return left.index - right.index;
    })
    .slice(0, Math.max(0, 100 - shares.reduce((sum, value) => sum + value, 0)))
    .forEach((entry) => {
      shares[entry.index] = (shares[entry.index] ?? 0) + 1;
    });

  return shares;
};

export const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
};

export const parseDecimal = (raw: string): number | null => {
  const parsed = Number(raw.trim().replace(/\s+/g, "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};
