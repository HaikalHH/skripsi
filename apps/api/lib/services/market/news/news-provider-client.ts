import {
  recordMarketProviderError,
  recordMarketProviderLatency,
  type MarketObservationReason
} from "@/lib/services/observability/market-observability-service";
import type { NewsProviderFailure } from "@/lib/services/market/news/news.types";
import { FinanceNewsError } from "@/lib/services/market/news/news.types";

const REQUEST_TIMEOUT_MS = 4_500;

export const createNewsProviderFailure = (params: {
  providerId: string;
  reason: MarketObservationReason;
  message: string;
  retriable?: boolean;
}) =>
  ({
    providerId: params.providerId,
    reason: params.reason,
    message: params.message,
    retriable: params.retriable ?? params.reason !== "no-data"
  }) satisfies NewsProviderFailure;

const isNewsProviderFailure = (value: unknown): value is NewsProviderFailure =>
  Boolean(value && typeof value === "object" && "providerId" in value && "reason" in value);

export const requestNewsResource = async (params: {
  providerId: string;
  url: string;
  headers?: Record<string, string>;
  responseType?: "json" | "text";
}) => {
  const startedAt = Date.now();

  try {
    const response = await fetch(params.url, {
      headers: { "User-Agent": "finance-bot/1.0", ...(params.headers ?? {}) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    recordMarketProviderLatency({
      providerId: params.providerId,
      operation: "news",
      latencyMs: Date.now() - startedAt
    });

    if (!response.ok) {
      const reason: MarketObservationReason =
        response.status === 429 ? "rate-limit" : response.status >= 500 ? "5xx" : "no-data";
      recordMarketProviderError({ providerId: params.providerId, operation: "news", reason });
      throw createNewsProviderFailure({
        providerId: params.providerId,
        reason,
        message: `${params.providerId} request failed with status ${response.status}`,
        retriable: reason !== "no-data"
      });
    }

    return params.responseType === "text" ? response.text() : response.json();
  } catch (error) {
    if (isNewsProviderFailure(error)) throw error;

    recordMarketProviderLatency({
      providerId: params.providerId,
      operation: "news",
      latencyMs: Date.now() - startedAt
    });
    const reason: MarketObservationReason =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        ? "timeout"
        : error instanceof Error && /timeout/i.test(error.message)
          ? "timeout"
          : "network";
    recordMarketProviderError({ providerId: params.providerId, operation: "news", reason });
    throw createNewsProviderFailure({
      providerId: params.providerId,
      reason,
      message: error instanceof Error ? error.message : "News provider request failed"
    });
  }
};

export const classifyNewsFailure = (
  providerId: string,
  error: unknown
): NewsProviderFailure => {
  if (isNewsProviderFailure(error)) return error;
  if (error instanceof FinanceNewsError) {
    return createNewsProviderFailure({
      providerId,
      reason: error.code === "NO_RELEVANT_NEWS" ? "no-data" : "network",
      message: error.message,
      retriable: error.code !== "NO_RELEVANT_NEWS"
    });
  }
  return createNewsProviderFailure({
    providerId,
    reason: error instanceof Error && /timeout/i.test(error.message) ? "timeout" : "network",
    message: error instanceof Error ? error.message : "Unknown news provider failure"
  });
};
