import { env } from '@/config/env';
import { logger } from '@/server/observability/logger';
import { createMemoryStore } from '@/server/store/memory-store';
import { createRedisStore } from '@/server/store/redis-store';
import { createUpstashTransport } from '@/server/store/upstash-transport';
import type { CommerceStore } from '@/server/store/types';

/**
 * The store singleton.
 *
 * Built lazily on first use rather than at module load: `env()` throws in
 * production when a required value is missing, and a throw during module
 * evaluation in Next produces an unattributable build or boot failure instead
 * of a clear error at the first request.
 */

let instance: CommerceStore | null = null;

export function store(): CommerceStore {
  if (instance) return instance;

  const config = env();

  if (config.STORE_DRIVER === 'upstash') {
    // `env()` has already refused to start without both of these in production;
    // the check is repeated because this module can be reached in development
    // with a half-filled `.env.local`, and a confusing crash deep inside a fetch
    // is worse than a sentence that names the two variables.
    if (!config.UPSTASH_REDIS_REST_URL || !config.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error(
        'STORE_DRIVER=upstash requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN',
      );
    }
    instance = createRedisStore(
      createUpstashTransport({
        url: config.UPSTASH_REDIS_REST_URL,
        token: config.UPSTASH_REDIS_REST_TOKEN,
      }),
      { prefix: config.STORE_PREFIX },
    );
    logger.info('store.ready', { driver: 'upstash', prefix: config.STORE_PREFIX });
    return instance;
  }

  instance = createMemoryStore();
  return instance;
}

/**
 * Test-only: install a store, or drop back to a fresh in-memory one.
 *
 * Exported rather than reached through a module mock so the contract suite can
 * run the *same* assertions against the memory driver and against a real
 * `redis-server`, which is the only way the Lua scripts are ever executed by
 * Redis rather than by a stub.
 */
export function setStore(next: CommerceStore | null): void {
  instance = next;
}

export async function resetStore(): Promise<void> {
  await store().reset();
}

export type { CommerceStore };
