import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WEBHOOK_MAX_AGE_SECONDS } from '@/config/constants';
import { catalog } from '@/server/catalog/repository';
import { POST as mockWebhook } from '@/app/api/webhooks/mock/route';
import { signMockWebhook } from '@/server/payments/mock-provider';
import { stripeProvider } from '@/server/payments/stripe-provider';
import { mercadoPagoProvider } from '@/server/payments/mercadopago-provider';
import { resetWebhookLog } from '@/server/payments/webhook-log';
import { createOrder } from '@/server/orders/order-service';
import { orderRepository, resetOrders } from '@/server/orders/order-repository';
import { resetInventory } from '@/server/orders/inventory';
import { resetSecurityCounters } from '@/server/security/rate-limit';
import { createSessionId } from '@/server/security/session';

/**
 * Webhook security, end to end through the real route handler.
 *
 * The rule under test: **an order becomes `paid` only via a verified webhook whose
 * amount matches our own snapshot.** Everything else — a forged signature, a
 * replay, a duplicate, a short payment — must leave the order alone.
 */

function stockedSku(): string {
  const found = catalog()
    .listProducts()
    .flatMap((product) => product.variants)
    .find((variant) => variant.stock >= 2);
  if (!found) throw new Error('fixture: no stocked variant');
  return found.sku;
}

async function newOrder(paymentMethod: 'transfer' | 'card' = 'transfer') {
  const result = await createOrder({
    sessionId: createSessionId(),
    userId: null,
    lines: [{ sku: stockedSku(), qty: 1 }],
    promoCode: null,
    customer: { name: 'Ana López', email: 'ana@example.com', phone: '1145678900' },
    shipping: { zone: 'pickup' },
    paymentMethod,
  });
  if (!result.ok) throw new Error('fixture: order failed');
  return result.order;
}

function post(body: unknown, headers: Record<string, string>): Request {
  const raw = JSON.stringify(body);
  return new Request('http://localhost:3000/api/webhooks/mock', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': String(raw.length), ...headers },
    body: raw,
  });
}

function signedPost(body: unknown, timestamp = Date.now()): Request {
  return post(body, signMockWebhook(JSON.stringify(body), timestamp));
}

beforeEach(() => {
  resetInventory();
  resetOrders();
  resetWebhookLog();
  resetSecurityCounters();
});
afterEach(() => {
  resetInventory();
  resetOrders();
  resetWebhookLog();
  resetSecurityCounters();
});

/* -------------------------------------------------------------------------- */

describe('webhook signature verification', () => {
  it('settles an order on a correctly signed, correctly priced event', async () => {
    const order = await newOrder();
    const response = await mockWebhook(
      signedPost({
        id: 'evt_ok',
        reference: order.reference,
        amount: order.totals.transferTotal,
        currency: 'ARS',
        status: 'approved',
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ settled: true, status: 'paid' });
    expect((await orderRepository().findByReference(order.reference))!.status).toBe('paid');
  });

  it('rejects an unsigned event with 401 and changes nothing', async () => {
    const order = await newOrder();
    const response = await mockWebhook(
      post(
        {
          id: 'evt_unsigned',
          reference: order.reference,
          amount: order.totals.transferTotal,
          currency: 'ARS',
          status: 'approved',
        },
        {},
      ),
    );

    expect(response.status).toBe(401);
    expect((await orderRepository().findByReference(order.reference))!.status).toBe('pending_payment');
  });

  it('rejects a forged signature', async () => {
    const order = await newOrder();
    const response = await mockWebhook(
      post(
        {
          id: 'evt_forged',
          reference: order.reference,
          amount: order.totals.transferTotal,
          currency: 'ARS',
          status: 'approved',
        },
        { 'x-owner-signature': 'f'.repeat(64), 'x-owner-timestamp': String(Date.now()) },
      ),
    );

    expect(response.status).toBe(401);
    expect((await orderRepository().findByReference(order.reference))!.status).toBe('pending_payment');
  });

  it('rejects a signature computed over a DIFFERENT body — the classic swap', async () => {
    const order = await newOrder();
    const honest = {
      id: 'evt_swap',
      reference: order.reference,
      amount: order.totals.transferTotal,
      currency: 'ARS',
      status: 'approved',
    };
    // Sign the honest body, then send a cheaper one with that signature.
    const headers = signMockWebhook(JSON.stringify(honest));
    const response = await mockWebhook(post({ ...honest, amount: 100 }, headers));

    expect(response.status).toBe(401);
    expect((await orderRepository().findByReference(order.reference))!.status).toBe('pending_payment');
  });
});

describe('replay protection', () => {
  it('rejects an event older than the window', async () => {
    const order = await newOrder();
    const stale = Date.now() - (WEBHOOK_MAX_AGE_SECONDS + 60) * 1000;
    const response = await mockWebhook(
      signedPost(
        {
          id: 'evt_stale',
          reference: order.reference,
          amount: order.totals.transferTotal,
          currency: 'ARS',
          status: 'approved',
        },
        stale,
      ),
    );

    expect(response.status).toBe(401);
    expect((await orderRepository().findByReference(order.reference))!.status).toBe('pending_payment');
  });

  it('rejects an event timestamped in the future', async () => {
    const order = await newOrder();
    const future = Date.now() + (WEBHOOK_MAX_AGE_SECONDS + 60) * 1000;
    const response = await mockWebhook(
      signedPost(
        {
          id: 'evt_future',
          reference: order.reference,
          amount: order.totals.transferTotal,
          currency: 'ARS',
          status: 'approved',
        },
        future,
      ),
    );
    expect(response.status).toBe(401);
  });
});

describe('idempotency', () => {
  it('acknowledges a duplicate event id without settling twice', async () => {
    const order = await newOrder();
    const body = {
      id: 'evt_dupe',
      reference: order.reference,
      amount: order.totals.transferTotal,
      currency: 'ARS',
      status: 'approved',
    };

    const first = await mockWebhook(signedPost(body));
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ settled: true });

    // A provider retry: same event id, freshly signed.
    const second = await mockWebhook(signedPost(body));
    expect(second.status).toBe(200);
    const payload = await second.json();
    expect(payload).toMatchObject({ duplicate: true });

    const stored = (await orderRepository().findByReference(order.reference))!;
    expect(stored.status).toBe('paid');
    // Exactly one payment event in the audit trail.
    expect(stored.events.filter((event) => event.type === 'payment.confirmed')).toHaveLength(1);
  });

  it('does not settle a second time even with a different event id', async () => {
    const order = await newOrder();
    const base = {
      reference: order.reference,
      amount: order.totals.transferTotal,
      currency: 'ARS',
      status: 'approved',
    };

    await mockWebhook(signedPost({ ...base, id: 'evt_a' }));
    const second = await mockWebhook(signedPost({ ...base, id: 'evt_b' }));

    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({ settled: false });
  });
});

describe('amount verification', () => {
  it('flags a short payment for review instead of fulfilling it', async () => {
    const order = await newOrder();
    const response = await mockWebhook(
      signedPost({
        id: 'evt_short',
        reference: order.reference,
        // Pay one peso for a multi-million-peso order.
        amount: 100,
        currency: 'ARS',
        status: 'approved',
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'review' });

    const stored = (await orderRepository().findByReference(order.reference))!;
    expect(stored.status).toBe('review');
    expect(stored.status).not.toBe('paid');
  });

  it('flags a wrong currency for review', async () => {
    const order = await newOrder();
    const response = await mockWebhook(
      signedPost({
        id: 'evt_currency',
        reference: order.reference,
        amount: order.totals.transferTotal,
        currency: 'USD',
        status: 'approved',
      }),
    );
    await expect(response.json()).resolves.toMatchObject({ status: 'review' });
  });

  it('cancels and releases stock on a failed payment', async () => {
    const order = await newOrder();
    const response = await mockWebhook(
      signedPost({
        id: 'evt_failed',
        reference: order.reference,
        amount: order.totals.transferTotal,
        currency: 'ARS',
        status: 'rejected',
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ settled: false });
    expect((await orderRepository().findByReference(order.reference))!.status).toBe('cancelled');
  });
});

describe('malformed and hostile payloads', () => {
  it('rejects an unparseable body', async () => {
    const raw = '{not json';
    const response = await mockWebhook(
      new Request('http://localhost:3000/api/webhooks/mock', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(raw.length),
          ...signMockWebhook(raw),
        },
        body: raw,
      }),
    );
    expect(response.status).toBe(401);
  });

  it('rejects a signed body missing required fields', async () => {
    const response = await mockWebhook(signedPost({ id: 'evt_partial', status: 'approved' }));
    expect(response.status).toBe(401);
  });

  it('acknowledges but does not act on an unknown order reference', async () => {
    const response = await mockWebhook(
      signedPost({
        id: 'evt_unknown',
        reference: 'OWN-ZZZZZZZZZZ',
        amount: 1000,
        currency: 'ARS',
        status: 'approved',
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ settled: false });
  });

  it('rejects a malformed reference without using it as a lookup key', async () => {
    const response = await mockWebhook(
      signedPost({
        id: 'evt_badref',
        reference: '../../../etc/passwd',
        amount: 1000,
        currency: 'ARS',
        status: 'approved',
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ matched: false });
  });

  it('rejects an oversized body before reading it', async () => {
    const response = await mockWebhook(
      new Request('http://localhost:3000/api/webhooks/mock', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': String(1024 * 1024) },
        body: '{}',
      }),
    );
    expect(response.status).toBe(413);
  });

  it('rate limits the endpoint', async () => {
    // RATE_LIMITS.webhook is [120, 60].
    let limited = false;
    for (let i = 0; i < 130; i += 1) {
      const response = await mockWebhook(
        signedPost({
          id: `evt_flood_${i}`,
          reference: 'OWN-ZZZZZZZZZZ',
          amount: 1,
          currency: 'ARS',
          status: 'pending',
        }),
      );
      if (response.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe('real provider signature schemes', () => {
  it('Stripe: fails closed without a configured secret', () => {
    const result = stripeProvider.verifyWebhook('{}', new Headers({ 'stripe-signature': 't=1,v1=x' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing_secret');
  });

  it('Mercado Pago: fails closed without a configured secret', () => {
    const result = mercadoPagoProvider.verifyWebhook(
      '{"data":{"id":"1"}}',
      new Headers({ 'x-signature': 'ts=1,v1=x' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing_secret');
  });

  it('Stripe: rejects a missing signature header', () => {
    const result = stripeProvider.verifyWebhook('{}', new Headers());
    expect(result.ok).toBe(false);
  });
});
