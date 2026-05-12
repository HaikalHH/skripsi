export type JsonRecord = Record<string, unknown>;

export const toRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" ? (value as JsonRecord) : null;

export const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return NaN;
};

export const toIsoTimestamp = (value?: string | number | null) => {
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const normalized = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(normalized).toISOString();
  }

  return new Date().toISOString();
};

export const readYahooRegularPrice = (payload: unknown): number | null => {
  const chart = toRecord(payload)?.chart;
  const results = toRecord(chart)?.result;
  const result = Array.isArray(results) ? results[0] : null;
  const resultRecord = toRecord(result);
  const metaPrice = toNumber(toRecord(resultRecord?.meta)?.regularMarketPrice);
  if (Number.isFinite(metaPrice) && metaPrice > 0) return metaPrice;

  const indicators = toRecord(resultRecord?.indicators);
  const quote = Array.isArray(indicators?.quote) ? indicators.quote[0] : null;
  const closes = toRecord(quote)?.close;
  if (Array.isArray(closes)) {
    for (let index = closes.length - 1; index >= 0; index -= 1) {
      const candidate = toNumber(closes[index]);
      if (Number.isFinite(candidate) && candidate > 0) return candidate;
    }
  }

  return null;
};

export const readYahooTimestamp = (payload: unknown) => {
  const results = toRecord(toRecord(payload)?.chart)?.result;
  const result = Array.isArray(results) ? results[0] : null;
  const resultRecord = toRecord(result);
  const metaTime = toRecord(resultRecord?.meta)?.regularMarketTime;
  if (typeof metaTime === "number" || typeof metaTime === "string") return metaTime;

  const timestamps = resultRecord?.timestamp;
  if (!Array.isArray(timestamps)) return null;
  const lastTimestamp = timestamps.at(-1);
  return typeof lastTimestamp === "number" || typeof lastTimestamp === "string"
    ? lastTimestamp
    : null;
};

export const readYahooCurrency = (payload: unknown) => {
  const results = toRecord(toRecord(payload)?.chart)?.result;
  const result = Array.isArray(results) ? results[0] : null;
  const currency = toRecord(toRecord(result)?.meta)?.currency;
  return typeof currency === "string" ? currency : null;
};
