import { logger } from '@/server/observability/logger';
import {
  expireStaleOrders,
  expiryFromNow,
  newOrderId,
  newOrderReference,
  orderRepository,
  toOrderDTO,
} from '@/server/orders/order-repository';
import { release, reserveAtomically } from '@/server/orders/inventory';
import { priceCart } from '@/server/pricing/pricing';
import { ownerKey } from '@/server/security/session';
import type { CartLineInput, Order, OrderCustomer, OrderDTO, OrderShipping, PaymentMethod } from '@/types/commerce';

/**
 * Order creation and access.
 *
 * Two invariants this module exists to hold:
 *
 *  1. **The order total is computed here, from the catalogue, at creation time.**
 *     The checkout request contributes a customer, a shipping zone, a payment
 *     method and a promo *code* — nothing else. The cart comes from the signed
 *     cookie, not the request body. There is no code path by which a client
 *     supplies an amount.
 *  2. **Reading an order requires owning it.** Every read goes through the
 *     ownership check, which compares against a key derived from the signed
 *     session. A mismatch is reported as "not found", so the endpoint cannot be
 *     used to confirm that a reference exists.
 */

export interface CreateOrderInput {
  sessionId: string;
  userId: string | null;
  lines: readonly CartLineInput[];
  promoCode: string | null;
  customer: OrderCustomer;
  shipping: OrderShipping;
  paymentMethod: PaymentMethod;
}

export type CreateOrderResult =
  | { ok: true; order: Order }
  | { ok: false; reason: 'empty_cart' }
  | { ok: false; reason: 'out_of_stock'; sku: string; available: number };

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  // Return stock held by abandoned orders before checking availability, so a
  // customer is not blocked by a cart someone walked away from 40 minutes ago.
  await expireStaleOrders();

  // Re-price from the catalogue. This is the authoritative figure; the client's
  // view of the total is advisory and is never consulted.
  const priced = priceCart(input.lines, {
    promoCode: input.promoCode,
    zone: input.shipping.zone,
    paymentMethod: input.paymentMethod,
  });

  if (priced.lines.length === 0) return { ok: false, reason: 'empty_cart' };

  // Re-check and commit stock atomically. See inventory.ts on the race.
  const reservation = reserveAtomically(
    priced.lines.map((line) => ({ sku: line.sku, qty: line.qty })),
  );
  if (!reservation.ok) {
    return {
      ok: false,
      reason: 'out_of_stock',
      sku: reservation.sku,
      available: reservation.available,
    };
  }

  const now = new Date().toISOString();
  const order: Order = {
    id: newOrderId(),
    reference: newOrderReference(),
    ownerKey: ownerKey(input.sessionId),
    userId: input.userId,
    status: 'pending_payment',
    lines: priced.lines,
    totals: priced.totals,
    paymentMethod: input.paymentMethod,
    customer: input.customer,
    shipping: input.shipping,
    createdAt: now,
    updatedAt: now,
    expiresAt: expiryFromNow(),
    events: [{ at: now, type: 'order.created' }],
  };

  await orderRepository().create(order);

  logger.security('order.created', {
    reference: order.reference,
    total: order.totals.total,
    paymentMethod: order.paymentMethod,
    itemCount: priced.itemCount,
    email: order.customer.email,
  });

  return { ok: true, order };
}

/**
 * Fetch an order the caller is entitled to read.
 *
 * Returns `null` both for "no such order" and for "not yours". Collapsing the
 * two is the IDOR defence: a 403 would confirm the reference is real, which is
 * most of what an enumerating attacker wants. docs/threat-model.md §4.4.
 */
export async function getOwnedOrder(
  reference: string,
  sessionId: string | null,
  userId: string | null,
): Promise<Order | null> {
  if (!sessionId) return null;
  await expireStaleOrders();

  const order = await orderRepository().findByReference(reference);
  if (!order) return null;

  const expected = ownerKey(sessionId);
  // Either the guest session that created it, or the account that owns it.
  const owns = order.ownerKey === expected || (userId !== null && order.userId === userId);

  if (!owns) {
    logger.security('authz.denied', {
      reference,
      reason: 'order-owner-mismatch',
      ...(userId ? { userId } : {}),
    });
    return null;
  }

  return order;
}

export async function getOwnedOrderDTO(
  reference: string,
  sessionId: string | null,
  userId: string | null,
): Promise<OrderDTO | null> {
  const order = await getOwnedOrder(reference, sessionId, userId);
  return order ? toOrderDTO(order) : null;
}

export async function listOwnedOrders(
  sessionId: string | null,
  limit = 20,
): Promise<OrderDTO[]> {
  if (!sessionId) return [];
  await expireStaleOrders();
  const orders = await orderRepository().listByOwner(ownerKey(sessionId), limit);
  return orders.map(toOrderDTO);
}

/**
 * Transition an order to paid.
 *
 * ⚠️ Only reachable from a *verified* webhook or a server-side provider query.
 * There is deliberately no route that lets a client assert payment, which is
 * the single most important rule in the payment flow — see
 * docs/threat-model.md §4.6.
 *
 * The amount and currency are checked against the snapshot taken at creation. A
 * mismatch moves the order to `review` for a human rather than fulfilling it, and
 * never silently accepts the lower figure.
 */
export async function settleOrder(params: {
  reference: string;
  amount: number;
  currency: string;
  providerEventId: string;
  provider: string;
}): Promise<{ ok: true; status: 'paid' | 'review' } | { ok: false; reason: 'not_found' | 'already_settled' }> {
  const repo = orderRepository();
  const order = await repo.findByReference(params.reference);
  if (!order) return { ok: false, reason: 'not_found' };

  if (order.status === 'paid' || order.status === 'review') {
    return { ok: false, reason: 'already_settled' };
  }

  const expected = order.paymentMethod === 'transfer'
    ? order.totals.transferTotal
    : order.totals.cardTotal;

  const amountMatches = params.amount === expected;
  const currencyMatches = params.currency.toUpperCase() === 'ARS';
  const status = amountMatches && currencyMatches ? 'paid' : 'review';

  if (status === 'review') {
    logger.security('webhook.amount.mismatch', {
      reference: order.reference,
      expected,
      received: params.amount,
      currency: params.currency,
      provider: params.provider,
    });
  }

  const now = new Date().toISOString();
  await repo.update(order.reference, (current) => ({
    ...current,
    status,
    updatedAt: now,
    events: [
      ...current.events,
      {
        at: now,
        type: status === 'paid' ? 'payment.confirmed' : 'payment.amount_mismatch',
        detail: `${params.provider}:${params.providerEventId}`,
      },
    ],
  }));

  if (status === 'paid') {
    logger.security('order.paid', {
      reference: order.reference,
      amount: params.amount,
      provider: params.provider,
    });
  }

  return { ok: true, status };
}

/** Cancel a pending order and return its stock. */
export async function cancelOrder(reference: string, reason: string): Promise<boolean> {
  const repo = orderRepository();
  const order = await repo.findByReference(reference);
  if (!order || order.status !== 'pending_payment') return false;

  release(order.lines.map((line) => ({ sku: line.sku, qty: line.qty })));

  const now = new Date().toISOString();
  await repo.update(reference, (current) => ({
    ...current,
    status: 'cancelled',
    updatedAt: now,
    events: [...current.events, { at: now, type: 'order.cancelled', detail: reason }],
  }));
  return true;
}
