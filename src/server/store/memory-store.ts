import type {
  CommerceStore,
  ReservationResult,
  ScoredMember,
  SetOptions,
} from '@/server/store/types';

/**
 * In-process store.
 *
 * The default, and correct for exactly one deployment shape: a single server
 * process. That covers local development, the test suite, and a small VPS. It
 * is wrong behind more than one instance, and `env()` says so at boot.
 *
 * Atomicity here is free. JavaScript runs one task to completion before the
 * next, so any block of code without an `await` inside it cannot interleave
 * with another request. **The functions below that promise atomicity must
 * therefore never acquire an `await` between their check and their write** —
 * that single edit would reintroduce the oversell race the interface exists to
 * prevent. They are `async` only to satisfy the interface.
 */

interface Expiring {
  value: string;
  expiresAt: number | null;
}

/** Bounded so a flood of distinct keys cannot exhaust the heap. */
const MAX_ENTRIES = 50_000;

export function createMemoryStore(): CommerceStore {
  const values = new Map<string, Expiring>();
  const counters = new Map<string, { count: number; resetAt: number }>();
  const sets = new Map<string, { members: Set<string>; expiresAt: number | null }>();
  const ranked = new Map<string, Map<string, number>>();
  const reserved = new Map<string, number>();

  function live(key: string, now: number): Expiring | null {
    const entry = values.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= now) {
      values.delete(key);
      return null;
    }
    return entry;
  }

  function evictIfFull(map: Map<string, unknown>): void {
    if (map.size < MAX_ENTRIES) return;
    // Map preserves insertion order, so this sheds the oldest-written entry.
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }

  function write(key: string, value: string, options: SetOptions | undefined, now: number): void {
    evictIfFull(values);
    values.set(key, {
      value,
      expiresAt: options?.ttlSeconds ? now + options.ttlSeconds * 1000 : null,
    });
  }

  return {
    driver: 'memory',

    async get(key) {
      return live(key, Date.now())?.value ?? null;
    },

    async set(key, value, options) {
      const now = Date.now();
      if (options?.ifAbsent && live(key, now)) return false;
      write(key, value, options, now);
      return true;
    },

    async delete(...keys) {
      for (const key of keys) values.delete(key);
    },

    async compareAndSet(key, expected, next, options) {
      const now = Date.now();
      const current = live(key, now)?.value ?? null;
      if (current !== expected) return false;
      write(key, next, options, now);
      return true;
    },

    async countInWindow(key, windowMs) {
      const now = Date.now();
      const existing = counters.get(key);
      if (!existing || existing.resetAt <= now) {
        sweepCounters(counters, now);
        evictIfFull(counters);
        const resetAt = now + windowMs;
        counters.set(key, { count: 1, resetAt });
        return { count: 1, resetAt };
      }
      existing.count += 1;
      return { count: existing.count, resetAt: existing.resetAt };
    },

    async readWindow(key) {
      const existing = counters.get(key);
      if (!existing || existing.resetAt <= Date.now()) return 0;
      return existing.count;
    },

    /**
     * TTL is key-level, not per-member, and is refreshed on every add.
     *
     * That is what Redis does — `EXPIRE` applies to the set, not its elements —
     * and matching it here is the point: a per-member expiry would be nicer and
     * would make the two drivers disagree, which is exactly the class of bug
     * that only ever shows up in production.
     */
    async setAdd(key, member, ttlSeconds) {
      const bucket = liveSet(sets, key, Date.now()) ?? { members: new Set<string>(), expiresAt: null };
      bucket.members.add(member);
      if (ttlSeconds) bucket.expiresAt = Date.now() + ttlSeconds * 1000;
      evictIfFull(sets);
      sets.set(key, bucket);
    },

    async setRemove(key, member) {
      const bucket = liveSet(sets, key, Date.now());
      if (!bucket) return;
      bucket.members.delete(member);
      if (bucket.members.size === 0) sets.delete(key);
    },

    async setMembers(key) {
      return [...(liveSet(sets, key, Date.now())?.members ?? [])];
    },

    async rankedAdd(key, member, score) {
      const bucket = ranked.get(key) ?? new Map<string, number>();
      bucket.set(member, score);
      evictIfFull(ranked);
      ranked.set(key, bucket);
    },

    async rankedRemove(key, member) {
      const bucket = ranked.get(key);
      if (!bucket) return;
      bucket.delete(member);
      if (bucket.size === 0) ranked.delete(key);
    },

    async rankedTop(key, limit) {
      return sorted(ranked.get(key))
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(0, limit))
        .map((entry) => entry.member);
    },

    async rankedDue(key, score, limit) {
      return sorted(ranked.get(key))
        .filter((entry) => entry.score <= score)
        .sort((a, b) => a.score - b.score)
        .slice(0, Math.max(0, limit))
        .map((entry) => entry.member);
    },

    /**
     * ⚠️ Atomic by absence of `await`. Do not add one between the two passes.
     */
    async reserveStock(lines) {
      // Pass 1 — verify every line against live availability.
      for (const line of lines) {
        const held = reserved.get(line.sku) ?? 0;
        const available = Math.max(0, line.stock - held);
        if (line.qty < 1 || line.qty > available) {
          return { ok: false, sku: line.sku, requested: line.qty, available } satisfies ReservationResult;
        }
      }
      // Pass 2 — commit. No suspension point between the passes.
      for (const line of lines) {
        reserved.set(line.sku, (reserved.get(line.sku) ?? 0) + line.qty);
      }
      return { ok: true };
    },

    async releaseStock(lines) {
      for (const line of lines) {
        const next = (reserved.get(line.sku) ?? 0) - line.qty;
        if (next <= 0) reserved.delete(line.sku);
        else reserved.set(line.sku, next);
      }
    },

    async reservedUnits(sku) {
      return reserved.get(sku) ?? 0;
    },

    async reservedUnitsMany(skus) {
      const out = new Map<string, number>();
      for (const sku of skus) out.set(sku, reserved.get(sku) ?? 0);
      return out;
    },

    async reset() {
      values.clear();
      counters.clear();
      sets.clear();
      ranked.clear();
      reserved.clear();
    },
  };
}

function liveSet(
  sets: Map<string, { members: Set<string>; expiresAt: number | null }>,
  key: string,
  now: number,
): { members: Set<string>; expiresAt: number | null } | null {
  const bucket = sets.get(key);
  if (!bucket) return null;
  if (bucket.expiresAt !== null && bucket.expiresAt <= now) {
    sets.delete(key);
    return null;
  }
  return bucket;
}

function sorted(bucket: Map<string, number> | undefined): ScoredMember[] {
  if (!bucket) return [];
  return [...bucket].map(([member, score]) => ({ member, score }));
}

/** Amortised cleanup. No timer, so an idle serverless instance can be frozen. */
function sweepCounters(counters: Map<string, { resetAt: number }>, now: number): void {
  if (counters.size < 256) return;
  for (const [key, counter] of counters) {
    if (counter.resetAt <= now) counters.delete(key);
  }
}
