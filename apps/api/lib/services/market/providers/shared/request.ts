import {
  recordMarketProviderError,
  recordMarketProviderLatency,
  type MarketObservationOperation,
  type MarketObservationReason
} from "@/lib/services/observability/market-observability-service";
import {
  createProviderFailure,
  isProviderFailure
} from "@/lib/services/market/providers/shared/provider-failure";

const REQUEST_TIMEOUT_MS = 4_500;

export const requestProviderResource = async (params: {
  providerId: string;
  operation: MarketObservationOperation;
  url: string;
  headers?: Record<string, string>;
  responseType?: "json" | "text";
}) => {
  const startedAt = Date.now();

  try {
    const response = await fetch(params.url, {
      headers: {
        "User-Agent": "finance-bot/1.0",
        ...(params.headers ?? {})
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    recordMarketProviderLatency({
      providerId: params.providerId,
      operation: params.operation,
      latencyMs: Date.now() - startedAt
    });

    if (!response.ok) {
      const reason: MarketObservationReason =
        response.status === 429 ? "rate-limit" : response.status >= 500 ? "5xx" : "no-data";
      recordMarketProviderError({ providerId: params.providerId, operation: params.operation, reason });
      throw createProviderFailure({
        providerId: params.providerId,
        reason,
        message: `${params.providerId} request failed with status ${response.status}`,
        retriable: reason !== "no-data"
      });
    }

    return params.responseType === "text" ? response.text() : response.json();
  } catch (error) {
    if (isProviderFailure(error)) throw error;

    recordMarketProviderLatency({
      providerId: params.providerId,
      operation: params.operation,
      latencyMs: Date.now() - startedAt
    });

    const reason: MarketObservationReason =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        ? "timeout"
        : error instanceof Error && /timeout/i.test(error.message)
          ? "timeout"
          : error instanceof Error && /429/.test(error.message)
            ? "rate-limit"
            : "network";

    recordMarketProviderError({ providerId: params.providerId, operation: params.operation, reason });
    throw createProviderFailure({
      providerId: params.providerId,
      reason,
      message: error instanceof Error ? error.message : "Provider request failed"
    });
  }
};
