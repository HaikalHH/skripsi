import { formatMoney } from "@/lib/services/shared/money-format";
import {
  getMarketQuoteBySymbol,
  isMarketDataError,
  type MarketQuote
} from "@/lib/services/market/market-price-service";

const MARKET_PATTERN =
  /(?:^|\s)(?:harga|price|cek harga|lihat harga|berapa)\s+([a-z0-9./:-]{2,16}|emas)\b|\b([a-z0-9./:-]{2,16})\s+(?:sekarang|hari ini)\s+(?:berapa|gimana)\b/i;

const formatJakartaTimestamp = (value: string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta"
  }).format(new Date(value));

const parseMarketSymbol = (text: string) => {
  const match = text.match(MARKET_PATTERN);
  if (!match) return null;
  return (match[1] ?? match[2] ?? "").trim().toUpperCase();
};

const buildLiveQuoteReply = (quote: MarketQuote) =>
  [
    `${quote.label}: ${formatMoney(quote.price)} (${quote.currency})`,
    `Sumber harga: ${quote.source}`
  ].join("\n");

const buildStaleQuoteReply = (quote: MarketQuote) =>
  [
    `Data harga saat ini tidak tersedia, menampilkan data terakhir dari ${formatJakartaTimestamp(quote.cachedAt)}.`,
    `${quote.label}: ${formatMoney(quote.price)} (${quote.currency})`,
    `Sumber terakhir: ${quote.source}`
  ].join("\n");

export const buildMarketCommandFailureReply = (error: unknown, symbol?: string) => {
  if (isMarketDataError(error)) {
    if (error.code === "SYMBOL_NOT_FOUND") {
      const suggestions = error.suggestions.filter((candidate) => candidate !== symbol).slice(0, 3);
      return suggestions.length
        ? `Simbol '${error.symbol}' tidak ditemukan. Maksud kamu salah satu dari: ${suggestions.join(", ")}?`
        : `Simbol '${error.symbol}' tidak ditemukan. Coba format seperti BBCA, BTC, atau XAU.`;
    }

    if (error.staleTimestamp) {
      return `Data harga saat ini tidak tersedia, menampilkan data terakhir dari ${formatJakartaTimestamp(error.staleTimestamp)}.`;
    }

    return "Maaf, layanan market sedang gangguan. Coba lagi dalam beberapa menit.";
  }

  return "Harga market belum tersedia saat ini.";
};

export const tryHandleMarketCommand = async (text: string) => {
  const symbol = parseMarketSymbol(text);
  if (!symbol) return { handled: false as const };

  try {
    const quote = await getMarketQuoteBySymbol(symbol);
    return {
      handled: true as const,
      replyText: quote.status === "stale" ? buildStaleQuoteReply(quote) : buildLiveQuoteReply(quote)
    };
  } catch (error) {
    return {
      handled: true as const,
      replyText: buildMarketCommandFailureReply(error, symbol)
    };
  }
};
