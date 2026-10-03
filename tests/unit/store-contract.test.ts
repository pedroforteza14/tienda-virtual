import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStore } from '@/server/store/memory-store';
import { createRedisStore } from '@/server/store/redis-store';
import type { CommerceStore } from '@/server/store/types';
import { redisAvailable, startRedis, type RedisHarness } from '../helpers/redis-harness';

/**
 * One suite, two drivers.
 *
 * The whole point of the store interface is that the memory driver and the
 * Redis driver behave identically — the application cannot be correct on a
 * laptop and wrong on Vercel because of a difference nobody wrote down. So the
 * assertions are written once and run against both, and anything that holds for
 * one but not the other fails here rather than in production.
 *
 * The Redis half starts a real `redis-server` and speaks RESP to it, so the Lua
 * scripts are executed by Redis. A mocked transport would only confirm that the
 * driver sends the bytes it sends.
 */

const harnesses: RedisHarness[] = [];

afterAll(async () => {
  await Promise.all(harnesses.map((harness) => harness.stop()));
});

async function redisStore(): Promise<CommerceStore> {
  // A port derived from the process id, so parallel test files cannot collide.
  const port = 6500 + (process.pid % 400);
  const harness = await startRedis(port);
  harnesses.push(harness);
  return createRedisStore(harness, { prefix: `test:${process.pid}:` });
}

const drivers: { name: string; create: () => Promise<CommerceStore>; skip: boolean }[] = [
  { name: 'memory', create: async () => createMemoryStore(), skip: false },
  { name: 'redis (real server)', create: redisStore, skip: !redisAvailable() },
];

for (const driver of drivers) {
  describe.skipIf(driver.skip)(`store contract — ${driver.name}`, () => {
    let store: CommerceStore;

    beforeEach(async () => {
      store ??= await driver.create();
      await store.reset();
    });

    /* --- values ----------------------------------------------------------- */

    it('round-trips a value and reports a missing one as null', async () => {
      expect(await store.get('absent')).toBeNull();
      await store.set('k', 'v');
      expect(await store.get('k')).toBe('v');
      await store.delete('k');
      expect(await store.get('k')).toBeNull();
    });

    it('writes conditionally with ifAbsent', async () => {
      expect(await store.set('once', 'first', { ifAbsent: true })).toBe(true);
      expect(await store.set('once', 'second', { ifAbsent: true })).toBe(false);
      expect(await store.get('once')).toBe('first');
    });

    it('expires a value with a TTL', async () => {
      await store.set('short', 'v', { ttlSeconds: 1 });
      expect(await store.get('short')).toBe('v');
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      expect(await store.get('short')).toBeNull();
    });

    /* --- compare-and-set -------------------------------------------------- */

    it('replaces only when the stored value is unchanged', async () => {
      await store.set('order', 'v1');
      expect(await store.compareAndSet('order', 'v1', 'v2')).toBe(true);
      // A writer holding the stale value loses, which is the whole point.
      expect(await store.compareAndSet('order', 'v1', 'v3')).toBe(false);
      expect(await store.get('order')).toBe('v2');
    });

    it('treats null as "must not exist"', async () => {
      expect(await store.compareAndSet('fresh', null, 'created')).toBe(true);
      expect(await store.compareAndSet('fresh', null, 'again')).toBe(false);
      expect(await store.get('fresh')).toBe('created');
    });

    /* --- windows ---------------------------------------------------------- */

    it('counts within a window and reports when it resets', async () => {
      const first = await store.countInWindow('bucket', 60_000);
      expect(first.count).toBe(1);
      expect(first.resetAt).toBeGreaterThan(Date.now());

      expect((await store.countInWindow('bucket', 60_000)).count).toBe(2);
      expect(await store.readWindow('bucket')).toBe(2);
      expect(await store.readWindow('other-bucket')).toBe(0);
    });

    it('starts a new window once the old one has passed', async () => {
      await store.countInWindow('brief', 1_000);
      await store.countInWindow('brief', 1_000);
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      expect((await store.countInWindow('brief', 1_000)).count).toBe(1);
    });

    /* --- sets and sorted sets --------------------------------------------- */

    it('keeps set membership', async () => {
      await store.setAdd('users', 'a');
      await store.setAdd('users', 'b');
      await store.setAdd('users', 'a');
      expect((await store.setMembers('users')).sort()).toEqual(['a', 'b']);

      await store.setRemove('users', 'a');
      expect(await store.setMembers('users')).toEqual(['b']);
      expect(await store.setMembers('nothing-here')).toEqual([]);
    });

    it('orders a ranked set and finds what is due', async () => {
      await store.rankedAdd('orders', 'old', 100);
      await store.rankedAdd('orders', 'mid', 200);
      await store.rankedAdd('orders', 'new', 300);

      expect(await store.rankedTop('orders', 2)).toEqual(['new', 'mid']);
      expect(await store.rankedDue('orders', 200, 10)).toEqual(['old', 'mid']);
      expect(await store.rankedDue('orders', 50, 10)).toEqual([]);

      await store.rankedRemove('orders', 'mid');
      expect(await store.rankedDue('orders', 200, 10)).toEqual(['old']);
    });

    it('re-scores an existing member rather than duplicating it', async () => {
      await store.rankedAdd('orders', 'x', 100);
      await store.rankedAdd('orders', 'x', 900);
      expect(await store.rankedTop('orders', 10)).toEqual(['x']);
      expect(await store.rankedDue('orders', 500, 10)).toEqual([]);
    });

    /* --- stock, the part that must be atomic ------------------------------ */

    it('reserves and releases units', async () => {
      expect(await store.reserveStock([{ sku: 'A', qty: 2, stock: 5 }])).toEqual({ ok: true });
      expect(await store.reservedUnits('A')).toBe(2);

      await store.releaseStock([{ sku: 'A', qty: 2 }]);
      expect(await store.reservedUnits('A')).toBe(0);
    });

    it('never releases below zero', async () => {
      await store.releaseStock([{ sku: 'A', qty: 10 }]);
      expect(await store.reservedUnits('A')).toBe(0);
    });

    it('refuses to oversell', async () => {
      expect(await store.reserveStock([{ sku: 'A', qty: 3, stock: 3 }])).toEqual({ ok: true });
      expect(await store.reserveStock([{ sku: 'A', qty: 1, stock: 3 }])).toEqual({
        ok: false,
        sku: 'A',
        requested: 1,
        available: 0,
      });
    });

    it('rejects a non-positive quantity', async () => {
      expect((await store.reserveStock([{ sku: 'A', qty: 0, stock: 5 }])).ok).toBe(false);
      expect((await store.reserveStock([{ sku: 'A', qty: -3, stock: 5 }])).ok).toBe(false);
      expect(await store.reservedUnits('A')).toBe(0);
    });

    /**
     * All-or-nothing is what stops a customer paying for an order that can only
     * be half shipped.
     */
    it('commits every line or none', async () => {
      const result = await store.reserveStock([
        { sku: 'A', qty: 1, stock: 5 },
        { sku: 'B', qty: 99, stock: 2 },
      ]);
      expect(result.ok).toBe(false);
      // A was fine, but B was not, so A must not have been taken either.
      expect(await store.reservedUnits('A')).toBe(0);
    });

    /**
     * The oversell race, driven concurrently.
     *
     * Ten reservations for one unit each against a stock of three, all started
     * before any of them is awaited. Against Redis these are ten in-flight
     * connections racing on the same hash. Exactly three may win — if the check
     * and the decrement could be split, more would.
     */
    it('holds under concurrent reservations', async () => {
      const attempts = await Promise.all(
        Array.from({ length: 10 }, () => store.reserveStock([{ sku: 'RACE', qty: 1, stock: 3 }])),
      );
      expect(attempts.filter((attempt) => attempt.ok)).toHaveLength(3);
      expect(await store.reservedUnits('RACE')).toBe(3);
    });

    it('reads several SKUs at once', async () => {
      await store.reserveStock([
        { sku: 'A', qty: 1, stock: 5 },
        { sku: 'B', qty: 2, stock: 5 },
      ]);
      const held = await store.reservedUnitsMany(['A', 'B', 'NEVER-RESERVED']);
      expect(held.get('A')).toBe(1);
      expect(held.get('B')).toBe(2);
      expect(held.get('NEVER-RESERVED')).toBe(0);
    });

    /**
     * Compare-and-set under contention, which is how two instances settling and
     * cancelling the same order are kept from losing one of the two writes.
     */
    it('lets exactly one concurrent compare-and-set win', async () => {
      await store.set('contended', 'base');
      const writers = await Promise.all(
        Array.from({ length: 8 }, (_, i) => store.compareAndSet('contended', 'base', `w${i}`)),
      );
      expect(writers.filter(Boolean)).toHaveLength(1);
    });

    it('clears everything on reset', async () => {
      await store.set('k', 'v');
      await store.countInWindow('bucket', 60_000);
      await store.setAdd('set', 'm');
      await store.rankedAdd('ranked', 'm', 1);
      await store.reserveStock([{ sku: 'A', qty: 1, stock: 5 }]);

      await store.reset();

      expect(await store.get('k')).toBeNull();
      expect(await store.readWindow('bucket')).toBe(0);
      expect(await store.setMembers('set')).toEqual([]);
      expect(await store.rankedTop('ranked', 10)).toEqual([]);
      expect(await store.reservedUnits('A')).toBe(0);
    });
  });
}
