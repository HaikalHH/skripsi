import { formatMoney } from "@/lib/services/shared/money-format";
import { getMarketQuoteBySymbol } from "@/lib/services/market/market-price-service";

const MARKET_PATTERN =
  /(?:^|\s)(?:harga|price|cek harga|lihat harga|berapa)\s+([a-z]{2,10}|emas)\b|\b([a-z]{2,10})\s+(?:sekarang|hari ini)\s+(?:berapa|gimana)\b/i;

const parseMarketSymbol = (text: string) => {
  const match = text.match(MARKET_PATTERN);
  if (!match) return null;
  return (match[1] ?? match[2] ?? "").trim().toUpperCase();
};

export const tryHandleMarketCommand = async (text: string) => {
  const symbol = parseMarketSymbol(text);
  if (!symbol) return { handled: false as const };

  try {
    const quote = await getMarketQuoteBySymbol(symbol);
    return {
      handled: true as const,
      replyText: [
        `${quote.label}: ${formatMoney(quote.price)} (${quote.currency})`,
        `Sumber harga: ${quote.source}`
      ].join("\n")
    };
  } catch (error) {
    return {
      handled: true as const,
      replyText:
        error instanceof Error
          ? `Harga market belum tersedia saat ini (${error.message}).`
          : "Harga market belum tersedia saat ini."
    };
  }
};
