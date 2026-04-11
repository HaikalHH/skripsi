import { logger } from "@/lib/logger";

export type MarketObservationReason = "timeout" | "5xx" | "network" | "rate-limit" | "no-key" | "no-data";
export type MarketObservationOperation = "quote" | "fx" | "news";

type ProviderStats = {
  requestCount: number;
  errorCount: number;
  totalLatencyMs: number;
  lastLatencyMs: number;
};

const providerStats = new Map<string, ProviderStats>();
const cacheCounters = {
  hit: 0,
  miss: 0,
  stale: 0
};
const fallbackCounters = new Map<string, number>();
const finalProviderCounters = new Map<string, number>();
const recentEvents: Array<Record<string, unknown>> = [];

const appendEvent = (event: Record<string, unknown>) => {
  recentEvents.push({
    ...event,
    recordedAt: new Date().toISOString()
  });
  if (recentEvents.length > 200) {
    recentEvents.shift();
  }
};

const getProviderStats = (providerId: string) => {
  const existing = providerStats.get(providerId);
  if (existing) return existing;

  const created: ProviderStats = {
    requestCount: 0,
    errorCount: 0,
    totalLatencyMs: 0,
    lastLatencyMs: 0
  };
  providerStats.set(providerId, created);
  return created;
};

export const resetMarketObservabilityState = () => {
  providerStats.clear();
  fallbackCounters.clear();
  finalProviderCounters.clear();
  cacheCounters.hit = 0;
  cacheCounters.miss = 0;
  cacheCounters.stale = 0;
  recentEvents.splice(0, recentEvents.length);
};

export const recordMarketProviderLatency = (params: {
  providerId: string;
  operation: MarketObservationOperation;
  latencyMs: number;
}) => {
  const stats = getProviderStats(params.providerId);
  stats.requestCount += 1;
  stats.totalLatencyMs += params.latencyMs;
  stats.lastLatencyMs = params.latencyMs;

  appendEvent({
    metric: "provider_latency_ms",
    providerId: params.providerId,
    operation: params.operation,
    value: params.latencyMs
  });
};

export const recordMarketProviderError = (params: {
  providerId: string;
  operation: MarketObservationOperation;
  reason: MarketObservationReason;
}) => {
  const stats = getProviderStats(params.providerId);
  stats.errorCount += 1;
  const errorRate = stats.requestCount > 0 ? stats.errorCount / stats.requestCount : 1;

  appendEvent({
    metric: "provider_error_rate",
    providerId: params.providerId,
    operation: params.operation,
    reason: params.reason,
    value: Number(errorRate.toFixed(4))
  });
};

export const recordMarketCacheOutcome = (state: "hit" | "miss" | "stale", cacheKey: string) => {
  if (state === "hit") cacheCounters.hit += 1;
  if (state === "miss") cacheCounters.miss += 1;
  if (state === "stale") cacheCounters.stale += 1;

  appendEvent({
    metric: state === "hit" ? "cache_hit" : "cache_miss",
    cacheKey,
    cacheState: state
  });
};

export const recordMarketFallback = (params: {
  providerId: string;
  operation: MarketObservationOperation;
  reason: MarketObservationReason;
}) => {
  const key = `${params.operation}:${params.providerId}:${params.reason}`;
  fallbackCounters.set(key, (fallbackCounters.get(key) ?? 0) + 1);

  appendEvent({
    metric: "fallback_triggered",
    providerId: params.providerId,
    operation: params.operation,
    reason: params.reason
  });
};

export const recordMarketProviderSelection = (params: {
  providerId: string;
  operation: MarketObservationOperation;
  cacheState: "live" | "stale";
}) => {
  const key = `${params.operation}:${params.providerId}:${params.cacheState}`;
  finalProviderCounters.set(key, (finalProviderCounters.get(key) ?? 0) + 1);

  appendEvent({
    metric: "provider_selected",
    providerId: params.providerId,
    operation: params.operation,
    cacheState: params.cacheState
  });
};

export const getMarketObservabilitySnapshot = () => ({
  providers: Array.from(providerStats.entries()).map(([providerId, stats]) => ({
    providerId,
    requestCount: stats.requestCount,
    errorCount: stats.errorCount,
    providerErrorRate: stats.requestCount > 0 ? stats.errorCount / stats.requestCount : 0,
    providerLatencyMs:
      stats.requestCount > 0 ? Number((stats.totalLatencyMs / stats.requestCount).toFixed(2)) : 0,
    lastLatencyMs: stats.lastLatencyMs
  })),
  cache: { ...cacheCounters },
  fallbackTriggered: Array.from(fallbackCounters.entries()).map(([key, count]) => ({ key, count })),
  providerSelected: Array.from(finalProviderCounters.entries()).map(([key, count]) => ({ key, count })),
  recentEvents: [...recentEvents]
});

export const logMarketObservabilitySummary = () => {
  logger.debug(getMarketObservabilitySnapshot(), "Market observability snapshot");
};
