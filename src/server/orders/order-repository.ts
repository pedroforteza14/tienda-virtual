import { randomBytes, randomUUID } from 'node:crypto';
import { ORDER_PAYMENT_WINDOW_SECONDS } from '@/config/constants';
import type { Order, OrderDTO, OrderStatus } from '@/types/commerce';
import { release } from '@/server/orders/inventory';

/**
 * Order storage.
 *
 * **[PRE-LAUNCH]** in-memory. Orders must obviously be durable before a real
 * payment is taken; the interface is kept narrow so a SQL implementation is a
 * direct substitution.
 */

export interface OrderRepository {
  create(order: Order): Promise<Order>;
  findByReference(reference: string): Promise<Order | null>;
  listByOwner(ownerKey: string, limit: number): Promise<Order[]>;
  update(reference: string, mutate: (order: Order) => Order): Promise<Order | null>;
}

/**
 * Crockford base32: no `I`, `L`, `O` or `U`.
 *
 * Two reasons for exactly these exclusions. First, references get read over the
 * phone and pasted out of WhatsApp messages, and `I/1`, `L/1` and `O/0` are the
 * confusions that actually happen. Second — the useful accident — dropping four
 * letters leaves exactly **32** symbols, and 256 is a whole multiple of 32, so
 * `byte % 32` is perfectly uniform. An alphabet of 34 would bias the first 16
 * characters, which is a poor property for an identifier that is also an
 * authorization hint.
 *
 * Must stay in sync with `OrderReferenceSchema`.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Unguessable customer-facing reference. 32^10 = 2^50 possibilities. */
export function newOrderReference(): string {
  const bytes = randomBytes(10);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return `OWN-${out}`;
}

export function newOrderId(): string {
  return randomUUID();
}

export function expiryFromNow(now = Date.now()): string {
  return new Date(now + ORDER_PAYMENT_WINDOW_SECONDS * 1000).toISOString();
}

const orders = new Map<string, Order>();

export const inMemoryOrders: OrderRepository = {
  async create(order) {
    orders.set(order.reference, order);
    return order;
  },

  async findByReference(reference) {
    return orders.get(reference) ?? null;
  },

  async listByOwner(ownerKey, limit) {
    const matches: Order[] = [];
    for (const order of orders.values()) {
      if (order.ownerKey === ownerKey) matches.push(order);
    }
    return matches
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(1, Math.min(limit, 50)));
  },

  async update(reference, mutate) {
    const existing = orders.get(reference);
    if (!existing) return null;
    const next = mutate(existing);
    orders.set(reference, next);
    return next;
  },
};

export function orderRepository(): OrderRepository {
  return inMemoryOrders;
}

/**
 * Expire unpaid orders and return their reserved stock.
 *
 * Called lazily (on order reads and on order creation) rather than on a timer,
 * so there is no background work keeping a serverless instance warm.
 */
export async function expireStaleOrders(now = Date.now()): Promise<number> {
  let expired = 0;
  for (const order of orders.values()) {
    if (order.status !== 'pending_payment') continue;
    if (new Date(order.expiresAt).getTime() > now) continue;

    release(order.lines.map((line) => ({ sku: line.sku, qty: line.qty })));
    orders.set(order.reference, {
      ...order,
      status: 'expired' satisfies OrderStatus,
      updatedAt: new Date(now).toISOString(),
      events: [...order.events, { at: new Date(now).toISOString(), type: 'order.expired' }],
    });
    expired += 1;
  }
  return expired;
}

/**
 * Narrow an order for the browser.
 *
 * Explicit field-by-field mapping, not a spread-and-delete: a new sensitive
 * field added to `Order` is then absent from the DTO by default instead of
 * leaking until someone notices. `ownerKey`, `userId`, the internal `id` and the
 * event log never cross this boundary.
 */
export function toOrderDTO(order: Order): OrderDTO {
  return {
    reference: order.reference,
    status: order.status,
    lines: order.lines,
    totals: order.totals,
    paymentMethod: order.paymentMethod,
    customer: { name: order.customer.name, email: order.customer.email },
    shipping: order.shipping,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
  };
}

/** Test-only. */
export function resetOrders(): void {
  orders.clear();
}
