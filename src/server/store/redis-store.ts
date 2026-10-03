import type {
  CommerceStore,
  ReservationResult,
  SetOptions,
  StockLine,
  StockRequest,
} from '@/server/store/types';

/**
 * Redis-backed store.
 *
 * ## Why the transport is a parameter
 *
 * In production the transport is Upstash's REST API: one HTTPS request per
 * command, no connection to keep alive. That matters more than it sounds.
 * A serverless function may be frozen between requests and killed without
 * notice, so a pooled TCP client either leaks connections or pays a handshake
 * on every cold start — which is why the usual Redis clients are a poor fit for
 * this runtime and a stateless HTTP API is a good one.
 *
 * But an HTTP transport is also untestable without a network, and the parts of
 * this file most worth testing are the Lua scripts, which is where every
 * atomicity guarantee in the application now lives. So the transport is an
 * interface, and the test suite supplies one that speaks RESP to a real
 * `redis-server` on loopback. The scripts under test are then the same bytes
 * that production sends, executed by the same engine — not a mock's idea of
 * what Redis would have done.
 *
 * ## Why Lua rather than WATCH/MULTI
 *
 * Optimistic locking with `WATCH` needs a connection that persists across
 * commands, which a REST transport does not have. `EVAL` needs no session:
 * Redis runs the script to completion without interleaving another client, so
 * a check and its write cannot be split. Every script below is written to be
 * deterministic and to touch only keys passed in `KEYS`.
 */

export type RedisArg = string | number;

export interface RedisTransport {
  /** For log lines and error messages. Never a URL — those carry credentials. */
  readonly label: string;
  exec(command: readonly RedisArg[]): Promise<unknown>;
  /** Several commands in one round trip. Results come back in order. */
  pipeline(commands: readonly (readonly RedisArg[])[]): Promise<unknown[]>;
}

export class RedisStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedisStoreError';
  }
}

/**
 * Sentinel for "the key must not exist" in `compareAndSet`.
 *
 * A NUL byte, which no JSON document can contain, so it can never collide with
 * a real stored value.
 */
const ABSENT = '\u0000absent';

const CAS = `
local current = redis.call('GET', KEYS[1])
local expected = ARGV[2]
if (current == false and expected == ARGV[4]) or current == expected then
  local ttl = tonumber(ARGV[3])
  if ttl > 0 then
    redis.call('SET', KEYS[1], ARGV[1], 'EX', ttl)
  else
    redis.call('SET', KEYS[1], ARGV[1])
  end
  return 1
end
return 0`;

const COUNT_IN_WINDOW = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  -- No expiry survived (a crash between INCR and PEXPIRE, or a manual SET).
  -- Re-arm it rather than leaving a counter that never resets and locks the
  -- key out forever.
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}`;

/**
 * Reserve every line or none.
 *
 * ARGV is `[count, sku, qty, stock, sku, qty, stock, ...]`. The catalogue stock
 * travels with each line because the catalogue is static data outside Redis;
 * only the reserved count is store state.
 */
const RESERVE_STOCK = `
local count = tonumber(ARGV[1])
for i = 0, count - 1 do
  local sku = ARGV[2 + i * 3]
  local qty = tonumber(ARGV[3 + i * 3])
  local stock = tonumber(ARGV[4 + i * 3])
  local held = tonumber(redis.call('HGET', KEYS[1], sku) or '0')
  local available = stock - held
  if available < 0 then available = 0 end
  if qty < 1 or qty > available then
    return cjson.encode({ ok = false, sku = sku, requested = qty, available = available })
  end
end
for i = 0, count - 1 do
  redis.call('HINCRBY', KEYS[1], ARGV[2 + i * 3], tonumber(ARGV[3 + i * 3]))
end
return cjson.encode({ ok = true })`;

const RELEASE_STOCK = `
local count = tonumber(ARGV[1])
for i = 0, count - 1 do
  local sku = ARGV[2 + i * 2]
  local qty = tonumber(ARGV[3 + i * 2])
  local held = tonumber(redis.call('HGET', KEYS[1], sku) or '0')
  local remaining = held - qty
  if remaining <= 0 then
    redis.call('HDEL', KEYS[1], sku)
  else
    redis.call('HSET', KEYS[1], sku, remaining)
  end
end
return 1`;

export interface RedisStoreOptions {
  /**
   * Namespace for every key. Lets one Redis database serve several
   * environments, and makes `reset()` able to delete exactly our keys rather
   * than issuing a `FLUSHDB` that would take someone else's data with it.
   */
  prefix?: string;
}

export function createRedisStore(
  transport: RedisTransport,
  options: RedisStoreOptions = {},
): CommerceStore {
  const prefix = options.prefix ?? 'owner:';
  const k = (key: string) => `${prefix}${key}`;
  const stockKey = k('stock:reserved');

  async function evalScript(script: string, keys: string[], args: RedisArg[]): Promise<unknown> {
    return transport.exec(['EVAL', script, String(keys.length), ...keys, ...args]);
  }

  return {
    driver: 'upstash',

    async get(key) {
      const value = await transport.exec(['GET', k(key)]);
      return value === null || value === undefined ? null : String(value);
    },

    async set(key, value, options) {
      const command: RedisArg[] = ['SET', k(key), value];
      if (options?.ttlSeconds) command.push('EX', Math.max(1, Math.ceil(options.ttlSeconds)));
      if (options?.ifAbsent) command.push('NX');
      const result = await transport.exec(command);
      // `SET … NX` answers with null when the key already existed.
      return result !== null && result !== undefined;
    },

    async delete(...keys) {
      if (keys.length === 0) return;
      await transport.exec(['DEL', ...keys.map(k)]);
    },

    async compareAndSet(key, expected, next, options) {
      const result = await evalScript(
        CAS,
        [k(key)],
        [next, expected ?? ABSENT, Math.max(0, Math.ceil(options?.ttlSeconds ?? 0)), ABSENT],
      );
      return toNumber(result) === 1;
    },

    async countInWindow(key, windowMs) {
      const result = await evalScript(COUNT_IN_WINDOW, [k(key)], [Math.max(1, Math.round(windowMs))]);
      if (!Array.isArray(result) || result.length < 2) {
        throw new RedisStoreError('rate-limit script returned an unexpected shape');
      }
      return {
        count: toNumber(result[0]),
        resetAt: Date.now() + toNumber(result[1]),
      };
    },

    async readWindow(key) {
      const value = await transport.exec(['GET', k(key)]);
      return value === null || value === undefined ? 0 : toNumber(value);
    },

    async setAdd(key, member, ttlSeconds) {
      const commands: RedisArg[][] = [['SADD', k(key), member]];
      // Key-level expiry, refreshed on every add. Redis has no per-member TTL
      // for sets, and the memory driver matches this deliberately so the two
      // cannot drift.
      if (ttlSeconds) commands.push(['EXPIRE', k(key), Math.max(1, Math.ceil(ttlSeconds))]);
      await transport.pipeline(commands);
    },

    async setRemove(key, member) {
      await transport.exec(['SREM', k(key), member]);
    },

    async setMembers(key) {
      const result = await transport.exec(['SMEMBERS', k(key)]);
      return toStringArray(result);
    },

    async rankedAdd(key, member, score) {
      await transport.exec(['ZADD', k(key), score, member]);
    },

    async rankedRemove(key, member) {
      await transport.exec(['ZREM', k(key), member]);
    },

    async rankedTop(key, limit) {
      if (limit <= 0) return [];
      const result = await transport.exec(['ZREVRANGE', k(key), 0, limit - 1]);
      return toStringArray(result);
    },

    async rankedDue(key, score, limit) {
      if (limit <= 0) return [];
      const result = await transport.exec([
        'ZRANGEBYSCORE', k(key), '-inf', score, 'LIMIT', 0, limit,
      ]);
      return toStringArray(result);
    },

    async reserveStock(lines) {
      if (lines.length === 0) return { ok: true };
      const args: RedisArg[] = [lines.length];
      for (const line of lines) args.push(line.sku, line.qty, line.stock);
      const raw = await evalScript(RESERVE_STOCK, [stockKey], args);
      return parseReservation(raw, lines);
    },

    async releaseStock(lines) {
      if (lines.length === 0) return;
      const args: RedisArg[] = [lines.length];
      for (const line of lines) args.push(line.sku, line.qty);
      await evalScript(RELEASE_STOCK, [stockKey], args);
    },

    async reservedUnits(sku) {
      const value = await transport.exec(['HGET', stockKey, sku]);
      return value === null || value === undefined ? 0 : toNumber(value);
    },

    async reservedUnitsMany(skus) {
      const out = new Map<string, number>();
      if (skus.length === 0) return out;
      const result = await transport.exec(['HMGET', stockKey, ...skus]);
      const values = Array.isArray(result) ? result : [];
      skus.forEach((sku, index) => {
        const value = values[index];
        out.set(sku, value === null || value === undefined ? 0 : toNumber(value));
      });
      return out;
    },

    /**
     * Test-only, and deliberately not `FLUSHDB`.
     *
     * A shared Redis is normal — the same database may hold another
     * environment's keys, or another application's. Scanning our own prefix
     * costs a few round trips and cannot destroy data that is not ours.
     */
    async reset() {
      let cursor = '0';
      do {
        const page = await transport.exec(['SCAN', cursor, 'MATCH', `${prefix}*`, 'COUNT', 500]);
        if (!Array.isArray(page) || page.length < 2) break;
        cursor = String(page[0]);
        const keys = toStringArray(page[1]);
        if (keys.length > 0) await transport.exec(['DEL', ...keys]);
      } while (cursor !== '0');
    },
  };
}

function parseReservation(raw: unknown, lines: readonly StockRequest[]): ReservationResult {
  let decoded: unknown;
  try {
    decoded = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new RedisStoreError('reservation script returned malformed JSON');
  }
  if (!decoded || typeof decoded !== 'object') {
    throw new RedisStoreError('reservation script returned an unexpected shape');
  }
  const result = decoded as Record<string, unknown>;
  if (result.ok === true) return { ok: true };

  // Fall back to the first line only if the script somehow omitted the sku; a
  // reservation failure must never be reported as a success.
  const sku = typeof result.sku === 'string' ? result.sku : (lines[0]?.sku ?? 'unknown');
  const requested = typeof result.requested === 'number' ? result.requested : 0;
  const available = typeof result.available === 'number' ? result.available : 0;
  return { ok: false, sku, requested, available };
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' || typeof value === 'bigint') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new RedisStoreError('expected a numeric reply');
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry !== null && entry !== undefined).map(String);
}

export type { StockLine, StockRequest, SetOptions };
