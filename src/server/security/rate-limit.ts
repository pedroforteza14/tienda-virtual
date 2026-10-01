import { RATE_LIMITS, type RateLimitBucket } from '@/config/constants';
import { env } from '@/config/env';
import { logger } from '@/server/observability/logger';

/**
 * Fixed-window rate limiting.
 *
 * **Known limitation, stated up front:** the in-memory driver counts per
 * process. Behind more than one replica, the effective limit is
 * `limit × replicas`. That is correct for a single-instance deployment and a
 * deliberate stub otherwise — `env()` warns about it at boot in production, and
 * `docs/SECURITY.md` lists the Redis swap as a pre-launch item. The interface is
 * shaped so that swap is a one-file change.
 *
 * A fixed window (rather than a token bucket) is chosen because the thing we are
 * defending against — credential stuffing, scripted checkout — cares about
 * "attempts per 5 minutes", and a fixed window is trivial to reason about when
 * reading a log line.
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

interface Counter {
  count: number;
  resetAt: number;
}

/** Bounded so a flood of distinct keys cannot exhaust memory. */
const MAX_ENTRIES = 20_000;
const store = new Map<string, Counter>();

function sweep(now: number): void {
  for (const [key, counter] of store) {
    if (counter.resetAt <= now) store.delete(key);
  }
  if (store.size <= MAX_ENTRIES) return;
  // Still too big: drop oldest-inserted entries. Map preserves insertion order.
  const excess = store.size - MAX_ENTRIES;
  let dropped = 0;
  for (const key of store.keys()) {
    store.delete(key);
    if (++dropped >= excess) break;
  }
}

export function rateLimit(
  bucket: RateLimitBucket,
  key: string,
  now = Date.now(),
): RateLimitResult {
  const [limit, windowSeconds] = RATE_LIMITS[bucket];
  const windowMs = windowSeconds * 1000;
  const composite = `${bucket}:${key}`;

  // Amortised cleanup: cheap, and avoids a timer that would keep a serverless
  // instance alive.
  if (store.size > 256 && Math.random() < 0.02) sweep(now);

  const existing = store.get(composite);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(composite, { count: 1, resetAt });
    return { allowed: true, limit, remaining: limit - 1, resetAt, retryAfter: 0 };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;

  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    retryAfter: allowed ? 0 : Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/**
 * Per-identity failure tracking, used for login lockout. Separate from the
 * request limiter because it is keyed on an account rather than a client, and
 * must survive the attacker rotating IPs.
 */
const failures = new Map<string, Counter>();

export function recordFailure(key: string, lockoutSeconds: number, now = Date.now()): number {
  const existing = failures.get(key);
  if (!existing || existing.resetAt <= now) {
    failures.set(key, { count: 1, resetAt: now + lockoutSeconds * 1000 });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

export function failureCount(key: string, now = Date.now()): number {
  const existing = failures.get(key);
  if (!existing || existing.resetAt <= now) return 0;
  return existing.count;
}

export function clearFailures(key: string): void {
  failures.delete(key);
}

/**
 * Test-only helpers.
 *
 * Deliberately **two** functions. The request limiter and the per-account failure
 * counter are different controls defending against different things, and a single
 * reset that clears both made it impossible to write the test that matters: "an
 * attacker rotates IP addresses (resetting the request limiter) — does the account
 * lockout still stop them?" With one combined reset, that test silently cleared the
 * very counter it was meant to exercise and passed for the wrong reason.
 */
export function resetRateLimits(): void {
  store.clear();
}

export function resetLoginFailures(): void {
  failures.clear();
}

/** Both, for a test's `beforeEach`. */
export function resetSecurityCounters(): void {
  resetRateLimits();
  resetLoginFailures();
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
  logger.security('ratelimit.exceeded', { bucket, key, requestId, driver: env().RATE_LIMIT_DRIVER });
}
