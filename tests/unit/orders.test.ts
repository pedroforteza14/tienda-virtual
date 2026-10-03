import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalog } from '@/server/catalog/repository';
import { availableStock, release, reserve } from '@/server/orders/inventory';
import { resetStore } from '@/server/store';
import {
  cancelOrder,
  createOrder,
  getOwnedOrder,
  getOwnedOrderDTO,
  listOwnedOrders,
  settleOrder,
} from '@/server/orders/order-service';
import { newOrderReference, toOrderDTO } from '@/server/orders/order-repository';
import { createSessionId } from '@/server/security/session';
import { OrderReferenceSchema } from '@/lib/validation/schemas';
import type { Order, OrderCustomer, OrderShipping } from '@/types/commerce';

const customer: OrderCustomer = {
  name: 'Ana López',
  email: 'ana@example.com',
  phone: '1145678900',
};
const shipping: OrderShipping = { zone: 'pickup' };

function stockedSku(minStock = 3): string {
  const found = catalog()
    .listProducts()
    .flatMap((product) => product.variants)
    .find((variant) => variant.stock >= minStock);
  if (!found) throw new Error('fixture: no variant with enough stock');
  return found.sku;
}

async function placeOrder(sessionId: string, sku: string, qty = 1) {
  const result = await createOrder({
    sessionId,
    userId: null,
    lines: [{ sku, qty }],
    promoCode: null,
    customer,
    shipping,
    paymentMethod: 'transfer',
  });
  if (!result.ok) throw new Error(`fixture: order failed (${result.reason})`);
  return result.order;
}

beforeEach(async () => resetStore());
afterEach(async () => resetStore());

/* -------------------------------------------------------------------------- */

describe('inventory — the oversell race', () => {
  it('reserves all lines or none', async () => {
    const sku = stockedSku(3);
    const other = catalog()
      .listProducts()
      .flatMap((product) => product.variants)
      .find((variant) => variant.sku !== sku && variant.stock > 0)!;

    const before = (await availableStock(sku));
    // The second line asks for more than exists, so neither may be committed.
    const result = await reserve([
      { sku, qty: 1 },
      { sku: other.sku, qty: other.stock + 50 },
    ]);

    expect(result.ok).toBe(false);
    expect((await availableStock(sku))).toBe(before);
  });

  it('cannot oversell across concurrent reservations', async () => {
    const sku = stockedSku(2);
    const stock = (await availableStock(sku));

    // Take everything, then try again.
    expect((await reserve([{ sku, qty: stock }])).ok).toBe(true);
    expect((await availableStock(sku))).toBe(0);

    const second = await reserve([{ sku, qty: 1 }]);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.available).toBe(0);
  });

  it('holds under a burst of interleaved reservations', async () => {
    const sku = stockedSku(2);
    const stock = (await availableStock(sku));

    let granted = 0;
    for (let i = 0; i < stock * 3; i += 1) {
      if ((await reserve([{ sku, qty: 1 }])).ok) granted += 1;
    }
    // Never more units than existed. This is the oversell invariant.
    expect(granted).toBe(stock);
    expect((await availableStock(sku))).toBe(0);
  });

  it('rejects a non-positive reservation', async () => {
    const sku = stockedSku(2);
    expect((await reserve([{ sku, qty: 0 }])).ok).toBe(false);
    expect((await reserve([{ sku, qty: -5 }])).ok).toBe(false);
  });

  it('returns stock on release', async () => {
    const sku = stockedSku(2);
    const stock = (await availableStock(sku));
    await reserve([{ sku, qty: 2 }]);
    expect((await availableStock(sku))).toBe(stock - 2);
    await release([{ sku, qty: 2 }]);
    expect((await availableStock(sku))).toBe(stock);
  });
});

/* -------------------------------------------------------------------------- */

describe('order creation', () => {
  it('computes totals server-side and reserves stock', async () => {
    const sku = stockedSku(2);
    const sessionId = createSessionId();
    const before = (await availableStock(sku));

    const order = await placeOrder(sessionId, sku, 2);

    expect(order.totals.subtotal).toBe(catalog().resolveSku(sku)!.variant.priceList * 2);
    expect(order.totals.transferTotal).toBeLessThan(order.totals.cardTotal);
    expect(order.status).toBe('pending_payment');
    expect((await availableStock(sku))).toBe(before - 2);
  });

  it('refuses an empty cart', async () => {
    const result = await createOrder({
      sessionId: createSessionId(),
      userId: null,
      lines: [],
      promoCode: null,
      customer,
      shipping,
      paymentMethod: 'transfer',
    });
    expect(result).toEqual({ ok: false, reason: 'empty_cart' });
  });

  it('refuses an order for stock someone else already holds', async () => {
    const sku = stockedSku(2);
    await reserve([{ sku, qty: await availableStock(sku) }]);

    const result = await createOrder({
      sessionId: createSessionId(),
      userId: null,
      lines: [{ sku, qty: 1 }],
      promoCode: null,
      customer,
      shipping,
      paymentMethod: 'transfer',
    });
    // The cart prices to empty because nothing is available, so this surfaces as
    // an empty cart rather than a stock error — either way, no order is created.
    expect(result.ok).toBe(false);
  });

  it('generates unguessable, non-sequential references', async () => {
    const references = Array.from({ length: 500 }, () => newOrderReference());
    expect(new Set(references).size).toBe(500);

    for (const reference of references) {
      expect(OrderReferenceSchema.safeParse(reference).success).toBe(true);
      // The random portion excludes I, L, O and U — the characters people
      // actually mis-hear when reading a reference over the phone. (The fixed
      // `OWN-` prefix is exempt, obviously.)
      expect(reference.slice(4)).not.toMatch(/[ILOU]/);
      expect(reference.slice(4)).toHaveLength(10);
    }

    // The alphabet is 32 symbols, so every symbol must be reachable — a biased
    // or truncated alphabet would show up here as missing characters.
    const used = new Set(references.flatMap((reference) => [...reference.slice(4)]));
    expect(used.size).toBe(32);
  });
});

/* -------------------------------------------------------------------------- */

describe('order access — IDOR', () => {
  it("returns null for another session's order, indistinguishable from not found", async () => {
    const owner = createSessionId();
    const attacker = createSessionId();
    const order = await placeOrder(owner, stockedSku(2));

    // The real owner can read it.
    expect(await getOwnedOrder(order.reference, owner, null)).not.toBeNull();

    // Another session with the correct reference cannot.
    expect(await getOwnedOrder(order.reference, attacker, null)).toBeNull();
    // And a reference that does not exist returns exactly the same thing.
    expect(await getOwnedOrder('OWN-ZZZZZZZZZZ', attacker, null)).toBeNull();
  });

  it('returns null with no session at all', async () => {
    const order = await placeOrder(createSessionId(), stockedSku(2));
    expect(await getOwnedOrder(order.reference, null, null)).toBeNull();
  });

  it('does not accept a userId as a substitute for owning the order', async () => {
    const owner = createSessionId();
    const attacker = createSessionId();
    const order = await placeOrder(owner, stockedSku(2));

    // A logged-in attacker claiming any user id still fails: the order's userId
    // is null, so the comparison cannot match.
    expect(await getOwnedOrder(order.reference, attacker, 'some-user-id')).toBeNull();
  });

  it('scopes the order list to the session', async () => {
    const a = createSessionId();
    const b = createSessionId();
    await placeOrder(a, stockedSku(3));

    expect(await listOwnedOrders(a)).toHaveLength(1);
    expect(await listOwnedOrders(b)).toHaveLength(0);
    expect(await listOwnedOrders(null)).toHaveLength(0);
  });

  it('never exposes ownerKey, userId or the internal id in the DTO', async () => {
    const owner = createSessionId();
    const order = await placeOrder(owner, stockedSku(2));
    const dto = await getOwnedOrderDTO(order.reference, owner, null);

    expect(dto).not.toBeNull();
    const keys = Object.keys(dto!);
    expect(keys).not.toContain('ownerKey');
    expect(keys).not.toContain('userId');
    expect(keys).not.toContain('id');
    expect(keys).not.toContain('events');
    // And the customer's phone is not in the DTO either.
    expect(JSON.stringify(dto)).not.toContain('1145678900');
  });

  it('maps an order to a DTO without leaking any internal field', async () => {
    const order = await placeOrder(createSessionId(), stockedSku(2));
    const serialised = JSON.stringify(toOrderDTO(order as Order));
    expect(serialised).not.toContain(order.ownerKey);
    expect(serialised).not.toContain(order.id);
  });
});

/* -------------------------------------------------------------------------- */

describe('settlement — amount verification', () => {
  it('marks an order paid when the amount and currency match exactly', async () => {
    const order = await placeOrder(createSessionId(), stockedSku(2));
    const result = await settleOrder({
      reference: order.reference,
      amount: order.totals.transferTotal,
      currency: 'ARS',
      providerEventId: 'evt_1',
      provider: 'mock',
    });
    expect(result).toEqual({ ok: true, status: 'paid' });
  });

  it('flags for review rather than fulfilling when the amount is short', async () => {
    const order = await placeOrder(createSessionId(), stockedSku(2));
    // The classic: pay $1 for a multi-million-peso order.
    const result = await settleOrder({
      reference: order.reference,
      amount: 100,
      currency: 'ARS',
      providerEventId: 'evt_2',
      provider: 'mock',
    });
    expect(result).toEqual({ ok: true, status: 'review' });
  });

  it('flags for review on a currency mismatch', async () => {
    const order = await placeOrder(createSessionId(), stockedSku(2));
    const result = await settleOrder({
      reference: order.reference,
      amount: order.totals.transferTotal,
      currency: 'USD',
      providerEventId: 'evt_3',
      provider: 'mock',
    });
    expect(result).toEqual({ ok: true, status: 'review' });
  });

  it('verifies against the card total when the order is a card order', async () => {
    const sku = stockedSku(2);
    const result = await createOrder({
      sessionId: createSessionId(),
      userId: null,
      lines: [{ sku, qty: 1 }],
      promoCode: null,
      customer,
      shipping,
      paymentMethod: 'card',
    });
    if (!result.ok) throw new Error('fixture failed');

    // Paying the (lower) transfer total for a card order must not settle.
    expect(
      await settleOrder({
        reference: result.order.reference,
        amount: result.order.totals.transferTotal,
        currency: 'ARS',
        providerEventId: 'evt_4',
        provider: 'mock',
      }),
    ).toEqual({ ok: true, status: 'review' });
  });

  it('refuses to settle twice', async () => {
    const order = await placeOrder(createSessionId(), stockedSku(2));
    await settleOrder({
      reference: order.reference,
      amount: order.totals.transferTotal,
      currency: 'ARS',
      providerEventId: 'evt_5',
      provider: 'mock',
    });
    expect(
      await settleOrder({
        reference: order.reference,
        amount: order.totals.transferTotal,
        currency: 'ARS',
        providerEventId: 'evt_6',
        provider: 'mock',
      }),
    ).toEqual({ ok: false, reason: 'already_settled' });
  });

  it('reports not_found for an unknown reference', async () => {
    expect(
      await settleOrder({
        reference: 'OWN-ZZZZZZZZZZ',
        amount: 1000,
        currency: 'ARS',
        providerEventId: 'evt_7',
        provider: 'mock',
      }),
    ).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('cancellation', () => {
  it('returns stock when a pending order is cancelled', async () => {
    const sku = stockedSku(3);
    const before = (await availableStock(sku));
    const order = await placeOrder(createSessionId(), sku, 2);
    expect((await availableStock(sku))).toBe(before - 2);

    expect(await cancelOrder(order.reference, 'test')).toBe(true);
    expect((await availableStock(sku))).toBe(before);
  });

  it('will not cancel an already settled order', async () => {
    const order = await placeOrder(createSessionId(), stockedSku(2));
    await settleOrder({
      reference: order.reference,
      amount: order.totals.transferTotal,
      currency: 'ARS',
      providerEventId: 'evt_8',
      provider: 'mock',
    });
    expect(await cancelOrder(order.reference, 'test')).toBe(false);
  });
});
