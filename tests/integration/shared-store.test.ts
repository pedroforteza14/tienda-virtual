import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { catalog } from '@/server/catalog/repository';
import { createOrder, getOwnedOrder, settleOrder } from '@/server/orders/order-service';
import { availableStock } from '@/server/orders/inventory';
import { createSessionId, getAuthSession, startAuthSession } from '@/server/security/session';
import { createRedisStore } from '@/server/store/redis-store';
import { setStore, store } from '@/server/store';
import type { CommerceStore } from '@/server/store/types';
import { connectRedis, redisAvailable, startRedis, type RedisHarness } from '../helpers/redis-harness';
import type { OrderCustomer, OrderShipping } from '@/types/commerce';

/**
 * The bug this whole change exists to fix, reproduced and then prevented.
 *
 * On a serverless host each request may land on a different instance with its
 * own empty memory. With the stores in module-level `Map`s, that produced a
 * shop that looked fine and was not: you completed checkout on instance A, the
 * confirmation page was served by instance B, and B had never heard of your
 * order — a 404 on the page that tells someone their money is accounted for.
 *
 * `instanceA` and `instanceB` below are two store objects over two separate
 * connections to one Redis. They share nothing in process, which is exactly the
 * relationship two serverless instances have. Every test here writes through
 * one and reads through the other.
 */

const customer: OrderCustomer = { name: 'Ana López', email: 'ana@example.com', phone: '1145678900' };
const shipping: OrderShipping = { zone: 'pickup' };

const harnesses: RedisHarness[] = [];
let instanceA: CommerceStore;
let instanceB: CommerceStore;

const skip = !redisAvailable();

function stockedSku(minStock = 3): string {
  const found = catalog()
    .listProducts()
    .flatMap((product) => product.variants)
    .find((variant) => variant.stock >= minStock);
  if (!found) throw new Error('fixture: no variant with enough stock');
  return found.sku;
}

describe.skipIf(skip)('two instances, one store', () => {
  beforeAll(async () => {
    const port = 6900 + (process.pid % 90);
    const prefix = `shared:${process.pid}:`;
    // One server, two clients. Each `startRedis` opens its own connection, so
    // neither instance can see the other's memory — only the database.
    const first = await startRedis(port);
    harnesses.push(first);
    instanceA = createRedisStore(first, { prefix });

    // A second client on the SAME server: its own socket, no shared process
    // state, one database between them.
    const second = await connectRedis(port, 'instance-b');
    harnesses.push(second);
    instanceB = createRedisStore(second, { prefix });
  });

  afterEach(async () => {
    setStore(instanceA);
    await store().reset();
  });

  afterAll(async () => {
    setStore(null);
    await Promise.all(harnesses.map((harness) => harness.stop()));
  });

  it('serves an order from an instance that never created it', async () => {
    const sessionId = createSessionId();
    const sku = stockedSku(2);

    setStore(instanceA);
    const created = await createOrder({
      sessionId,
      userId: null,
      lines: [{ sku, qty: 1 }],
      promoCode: null,
      customer,
      shipping,
      paymentMethod: 'transfer',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // The customer's next request lands somewhere else entirely.
    setStore(instanceB);
    const read = await getOwnedOrder(created.order.reference, sessionId, null);

    expect(read).not.toBeNull();
    expect(read?.reference).toBe(created.order.reference);
    expect(read?.totals.total).toBe(created.order.totals.total);
  });

  it('keeps a login valid across instances', async () => {
    const sessionId = createSessionId();

    setStore(instanceA);
    await startAuthSession(sessionId, 'user-123', 'customer');

    setStore(instanceB);
    expect((await getAuthSession(sessionId))?.userId).toBe('user-123');
  });

  it('counts stock once, not once per instance', async () => {
    const sku = stockedSku(3);

    setStore(instanceA);
    const before = await availableStock(sku);

    await createOrder({
      sessionId: createSessionId(),
      userId: null,
      lines: [{ sku, qty: 2 }],
      promoCode: null,
      customer,
      shipping,
      paymentMethod: 'transfer',
    });

    // The reservation is the store's, so the other instance already knows.
    setStore(instanceB);
    expect(await availableStock(sku)).toBe(before - 2);
  });

  it('settles on one instance and reports paid on the other', async () => {
    const sessionId = createSessionId();
    const sku = stockedSku(2);

    setStore(instanceA);
    const created = await createOrder({
      sessionId,
      userId: null,
      lines: [{ sku, qty: 1 }],
      promoCode: null,
      customer,
      shipping,
      paymentMethod: 'transfer',
    });
    if (!created.ok) throw new Error('fixture: order failed');

    // A payment webhook is delivered to whichever instance the platform picks.
    setStore(instanceB);
    const settled = await settleOrder({
      reference: created.order.reference,
      amount: created.order.totals.transferTotal,
      currency: 'ARS',
      providerEventId: 'evt_1',
      provider: 'mock',
    });
    expect(settled).toEqual({ ok: true, status: 'paid' });

    setStore(instanceA);
    expect((await getOwnedOrder(created.order.reference, sessionId, null))?.status).toBe('paid');
  });

  /**
   * Two instances settling the same order at once.
   *
   * Without compare-and-set, the slower write would overwrite the faster one
   * with a record read before it landed — and the write that disappears could
   * be the one that recorded the payment.
   */
  it('does not lose a write when both instances update one order', async () => {
    const sessionId = createSessionId();
    const sku = stockedSku(2);

    setStore(instanceA);
    const created = await createOrder({
      sessionId,
      userId: null,
      lines: [{ sku, qty: 1 }],
      promoCode: null,
      customer,
      shipping,
      paymentMethod: 'transfer',
    });
    if (!created.ok) throw new Error('fixture: order failed');

    const reference = created.order.reference;
    const amount = created.order.totals.transferTotal;

    const settleOn = async (instance: CommerceStore, eventId: string) => {
      setStore(instance);
      return settleOrder({ reference, amount, currency: 'ARS', providerEventId: eventId, provider: 'mock' });
    };

    // Deliberately sequential-looking but started together: both read the
    // pending order before either writes.
    const [first, second] = await Promise.all([
      settleOn(instanceA, 'evt_a'),
      settleOn(instanceB, 'evt_b'),
    ]);

    // Exactly one settles; the other is told it was already handled, which is
    // what makes a provider's duplicate delivery harmless.
    const settled = [first, second].filter((result) => result.ok);
    expect(settled).toHaveLength(1);

    setStore(instanceA);
    expect((await getOwnedOrder(reference, sessionId, null))?.status).toBe('paid');
  });
});
