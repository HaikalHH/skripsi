export type MemoryCacheState = "fresh" | "loaded" | "stale";

type CacheEntry<T> = {
  value: T;
  cachedAt: number;
  expiresAt: number;
};

type CacheReadResult<T> = {
  value: T;
  state: MemoryCacheState;
  cachedAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inFlightCache = new Map<string, Promise<CacheReadResult<unknown>>>();

export const resetMarketMemoryCache = () => {
  memoryCache.clear();
  inFlightCache.clear();
};

export const readMarketMemoryCache = <T>(key: string) => {
  const entry = memoryCache.get(key);
  if (!entry) return null;

  return {
    value: entry.value as T,
    cachedAt: entry.cachedAt,
    expiresAt: entry.expiresAt,
    isFresh: entry.expiresAt > Date.now()
  };
};

export const loadWithMarketMemoryCache = async <T>(params: {
  key: string;
  ttlMs: number;
  shouldUseStaleOnError?: (error: unknown) => boolean;
  load: () => Promise<T>;
}): Promise<CacheReadResult<T>> => {
  const existing = readMarketMemoryCache<T>(params.key);
  if (existing?.isFresh) {
    return {
      value: existing.value,
      state: "fresh",
      cachedAt: existing.cachedAt
    };
  }

  const inFlight = inFlightCache.get(params.key) as Promise<CacheReadResult<T>> | undefined;
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    try {
      const value = await params.load();
      const cachedAt = Date.now();
      memoryCache.set(params.key, {
        value,
        cachedAt,
        expiresAt: cachedAt + params.ttlMs
      });
      return {
        value,
        state: "loaded" as const,
        cachedAt
      };
    } catch (error) {
      if (existing && params.shouldUseStaleOnError?.(error)) {
        return {
          value: existing.value,
          state: "stale" as const,
          cachedAt: existing.cachedAt
        };
      }
      throw error;
    } finally {
      inFlightCache.delete(params.key);
    }
  })();

  inFlightCache.set(params.key, request as Promise<CacheReadResult<unknown>>);
  return request;
};
