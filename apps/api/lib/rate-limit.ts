type Bucket = {
  count: number;
  resetAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __waRateLimitBuckets: Map<string, Bucket> | undefined;
}

const buckets = global.__waRateLimitBuckets ?? new Map<string, Bucket>();

if (!global.__waRateLimitBuckets) {
  global.__waRateLimitBuckets = buckets;
}

export const checkRateLimit = (
  key: string,
  max: number,
  windowMs: number
): { allowed: boolean; retryAfterMs: number } => {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || now > current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (current.count >= max) {
    return { allowed: false, retryAfterMs: Math.max(0, current.resetAt - now) };
  }

  current.count += 1;
  buckets.set(key, current);
  return { allowed: true, retryAfterMs: 0 };
};
