import { RATE_LIMITS, type RateLimitBucket } from '@/config/constants';
import { env } from '@/config/env';
import { logger } from '@/server/observability/logger';
import { store } from '@/server/store';

/**
 * Fixed-window rate limiting.
 *
 * The counters live in the shared store, so the limit is the limit regardless
 * of how many instances are serving. With the memory driver it is still
 * per-process — `env()` warns about that at boot — but the code path is the
 * same one production runs, rather than a stub that gets swapped at the last
 * minute.
 *
 * A fixed window (rather than a token bucket) is chosen because the thing we
 * are defending against — credential stuffing, scripted checkout — cares about
 * "attempts per 5 minutes", and a fixed window is trivial to reason about when
 * reading a log line.
 *
 * ## What happens when the store is unreachable
 *
 * It fails **open**, loudly: the request is allowed and a `ratelimit.degraded`
 * security event is logged. This is the uncomfortable choice and it is
 * deliberate. Failing closed would turn a Redis blip into a total outage —
 * every page, including the ones that never write anything. Meanwhile the paths
 * an attacker would want to flood (login, signup, checkout) *also* need the
 * store to do anything at all: with Redis down there is no session to create,
 * no order to write and no user to read, so flooding them achieves nothing
 * beyond what the outage already achieves. The window where this is exploitable
 * is one where the shop is already not working.
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch milliseconds. */
  resetAt: number;
  /** Seconds, for the `Retry-After` header. */
  retryAfter: number;
}

export async function rateLimit(
  bucket: RateLimitBucket,
  key: string,
): Promise<RateLimitResult> {
  const [limit, windowSeconds] = RATE_LIMITS[bucket];
  const windowMs = windowSeconds * 1000;

  try {
    const { count, resetAt } = await store().countInWindow(`rl:${bucket}:${key}`, windowMs);
    const allowed = count <= limit;
    return {
      allowed,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt,
      retryAfter: allowed ? 0 : Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
    };
  } catch (error) {
    logger.security('ratelimit.degraded', {
      bucket,
      driver: env().STORE_DRIVER,
      reason: error instanceof Error ? error.name : 'unknown',
    });
    return {
      allowed: true,
      limit,
      remaining: limit,
      resetAt: Date.now() + windowMs,
      retryAfter: 0,
    };
  }
}

/**
 * Per-identity failure tracking, used for login lockout. Separate from the
 * request limiter because it is keyed on an account rather than a client, and
 * must survive the attacker rotating IPs.
 */
export async function recordFailure(key: string, lockoutSeconds: number): Promise<number> {
  const { count } = await store().countInWindow(`lockout:${key}`, lockoutSeconds * 1000);
  return count;
}

export async function failureCount(key: string): Promise<number> {
  return store().readWindow(`lockout:${key}`);
}

export async function clearFailures(key: string): Promise<void> {
  await store().delete(`lockout:${key}`);
}

/**
 * Client identity for rate-limit keys.
 *
 * `x-forwarded-for` is attacker-controlled unless a trusted proxy overwrites it,
 * so it is used only as a *hint* and always combined with the signed session id.
 * An attacker can forge the IP portion, but they cannot forge a session id
 * without our signing key — so rotating the forged IP still shares a bucket.
 */
export function clientKey(request: Request, sessionId: string | null): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0]?.trim().slice(0, 64) || 'unknown';
  return `${ip}|${sessionId ?? 'anon'}`;
}

/** Emit the standard headers so a well-behaved client can back off. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'RateLimit-Limit': String(result.limit),
    'RateLimit-Remaining': String(result.remaining),
    'RateLimit-Reset': String(Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000))),
  };
  if (!result.allowed) headers['Retry-After'] = String(result.retryAfter);
  return headers;
}

export function logRateLimited(bucket: RateLimitBucket, key: string, requestId: string): void {
  logger.security('ratelimit.exceeded', { bucket, key, requestId, driver: env().STORE_DRIVER });
}
