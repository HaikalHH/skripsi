import { getExchangeRate } from "@/lib/services/market/providers/fx/fx-rate.service";
import { toIsoTimestamp } from "@/lib/services/market/providers/shared/value-parsing";

export const convertUsdToIdr = async (
  usdPrice: number,
  source: string,
  asOf?: string | number | null
) => {
  const usdToIdr = await getExchangeRate("USD", "IDR");
  return {
    price: usdPrice * usdToIdr.rate,
    providerId: source,
    source: usdToIdr.source,
    asOf: toIsoTimestamp(asOf ?? usdToIdr.asOf)
  };
};

export const convertQuoteToIdr = async (
  price: number,
  rawCurrency: string | null | undefined,
  source: string,
  asOf?: string | number | null
) => {
  const normalizedCurrency = (rawCurrency ?? "IDR").toUpperCase();
  if (normalizedCurrency === "IDR") {
    return { price, source, asOf: toIsoTimestamp(asOf) };
  }

  if (normalizedCurrency === "USD") {
    const usdToIdr = await getExchangeRate("USD", "IDR");
    return {
      price: price * usdToIdr.rate,
      source: `${source} + ${usdToIdr.source}`,
      asOf: toIsoTimestamp(asOf ?? usdToIdr.asOf)
    };
  }

  return null;
};
