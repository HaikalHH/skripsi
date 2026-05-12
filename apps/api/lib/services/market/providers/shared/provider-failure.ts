import type {
  MarketObservationReason
} from "@/lib/services/observability/market-observability-service";
import { MarketDataError } from "@/lib/services/market/types/quote.types";
import type { ProviderFailure } from "@/lib/services/market/types/provider.types";

export const createProviderFailure = (params: {
  providerId: string;
  reason: MarketObservationReason;
  message: string;
  retriable?: boolean;
}) => ({
  providerId: params.providerId,
  reason: params.reason,
  message: params.message,
  retriable: params.retriable ?? params.reason !== "no-data"
});

export const isRetriableFailure = (failure: ProviderFailure) => failure.retriable;

export const isProviderFailure = (value: unknown): value is ProviderFailure =>
  Boolean(
    value &&
      typeof value === "object" &&
      "providerId" in value &&
      "reason" in value &&
      "message" in value
  );

export const classifyProviderFailure = (
  providerId: string,
  error: unknown
): ProviderFailure => {
  if (isProviderFailure(error)) return error;

  if (error instanceof MarketDataError) {
    return createProviderFailure({
      providerId,
      reason: error.code === "SYMBOL_NOT_FOUND" ? "no-data" : "network",
      message: error.message,
      retriable: error.code !== "SYMBOL_NOT_FOUND"
    });
  }

  if (error instanceof Error) {
    return createProviderFailure({
      providerId,
      reason: /timeout/i.test(error.message) ? "timeout" : "network",
      message: error.message
    });
  }

  return createProviderFailure({
    providerId,
    reason: "network",
    message: "Unknown provider failure"
  });
};

export const createDisabledProviderFailure = (providerId: string): ProviderFailure =>
  createProviderFailure({
    providerId,
    reason: "no-key",
    message: `Provider ${providerId} disabled because API key is missing`
  });
