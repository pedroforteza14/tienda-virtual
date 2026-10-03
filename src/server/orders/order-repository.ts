import { randomBytes, randomUUID } from 'node:crypto';
import { ORDER_PAYMENT_WINDOW_SECONDS } from '@/config/constants';
import { logger } from '@/server/observability/logger';
import { release } from '@/server/orders/inventory';
import { store } from '@/server/store';
import type { Order, OrderDTO, OrderStatus } from '@/types/commerce';

/**
 * Order storage, in the shared store.
 *
 * Three keys, and the two indexes are what make this work without a scan:
 *
 *   `order:<reference>`        → the record
 *   `orders:owner:<ownerKey>`  → that buyer's references, scored by creation time
 *   `orders:pending`           → unpaid references, scored by **expiry** time
 *
 * `orders:pending` is the interesting one. Expiring abandoned orders used to
 * mean iterating every order in a `Map`, which is fine for a few hundred and
 * impossible against a shared database — `SCAN`ning the key space on every
 * order read would get slower exactly as the shop got busier. Scored by expiry,
 * the question "what is due right now" is one range query that touches only the
 * orders that are actually due, and an order leaves the index the moment it is
 * paid, cancelled or expired.
 *
 * ## Updates are compare-and-set, not read-modify-write
 *
 * A webhook confirming payment and a customer cancelling can arrive at the same
 * moment on two different instances. Read-modify-write would let the second
 * write clobber the first with a record read before it existed — and the write
 * that gets lost could be the payment. So `update` reads the stored string,
 * applies the change, and writes only if the stored string is still exactly
 * what it read. If someone else got in first, it re-reads and re-applies,
 * because the mutation is a function of the current state rather than a fixed
 * value.
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

const PENDING_INDEX = 'orders:pending';
/** Bounded so one sweep cannot turn into an unbounded amount of work. */
const EXPIRY_BATCH = 50;
/** CAS attempts before giving up. Contention on one order is rare; a loop is not. */
const MAX_CAS_ATTEMPTS = 5;

function orderKey(reference: string): string {
  return `order:${reference}`;
}

function ownerIndexKey(ownerKey: string): string {
  return `orders:owner:${ownerKey}`;
}

function parseOrder(raw: string | null): Order | null {
  if (!raw) return null;
  try {
    const decoded: unknown = JSON.parse(raw);
    // Shape-check only the fields every caller dereferences. A record that does
    // not look like an order is treated as absent rather than handed onward,
    // where it would fail somewhere less explicable.
    if (!decoded || typeof decoded !== 'object') return null;
    const value = decoded as Partial<Order>;
    if (
      typeof value.reference !== 'string' ||
      typeof value.ownerKey !== 'string' ||
      typeof value.status !== 'string' ||
      !Array.isArray(value.lines) ||
      !Array.isArray(value.events)
    ) {
      return null;
    }
    return decoded as Order;
  } catch {
    return null;
  }
}

export const storeOrders: OrderRepository = {
  async create(order) {
    const kv = store();
    await kv.set(orderKey(order.reference), JSON.stringify(order));
    await kv.rankedAdd(
      ownerIndexKey(order.ownerKey),
      order.reference,
      new Date(order.createdAt).getTime(),
    );
    if (order.status === 'pending_payment') {
      await kv.rankedAdd(PENDING_INDEX, order.reference, new Date(order.expiresAt).getTime());
    }
    return order;
  },

  async findByReference(reference) {
    return parseOrder(await store().get(orderKey(reference)));
  },

  async listByOwner(ownerKey, limit) {
    const kv = store();
    const bounded = Math.max(1, Math.min(limit, 50));
    const references = await kv.rankedTop(ownerIndexKey(ownerKey), bounded);
    const orders: Order[] = [];
    for (const reference of references) {
      const order = parseOrder(await kv.get(orderKey(reference)));
      if (order) orders.push(order);
    }
    // The index is already newest-first; sorting again keeps the contract true
    // even if two orders share a millisecond.
    return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async update(reference, mutate) {
    const kv = store();
    const key = orderKey(reference);

    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const raw = await kv.get(key);
      const current = parseOrder(raw);
      if (!current || raw === null) return null;

      const next = mutate(current);
      const written = await kv.compareAndSet(key, raw, JSON.stringify(next));
      if (!written) continue; // Someone else wrote. Re-read and re-apply.

      // Keep the pending index in step: an order that is no longer awaiting
      // payment must not be picked up by an expiry sweep later.
      if (next.status !== 'pending_payment') {
        await kv.rankedRemove(PENDING_INDEX, reference);
      } else if (next.expiresAt !== current.expiresAt) {
        await kv.rankedAdd(PENDING_INDEX, reference, new Date(next.expiresAt).getTime());
      }
      return next;
    }

    logger.security('order.update.contended', { reference, attempts: MAX_CAS_ATTEMPTS });
    return null;
  },
};

export function orderRepository(): OrderRepository {
  return storeOrders;
}

/**
 * Expire unpaid orders and return their reserved stock.
 *
 * Called lazily (on order reads and on order creation) rather than on a timer,
 * so there is no background work keeping a serverless instance warm.
 *
 * The stock is released **only by the instance that wins the status change**.
 * Two instances sweeping concurrently both see the same due order, but only one
 * compare-and-set succeeds, and the loser releases nothing — otherwise the same
 * units would be returned twice and the shop would believe it had stock it does
 * not have.
 */
export async function expireStaleOrders(now = Date.now()): Promise<number> {
  const kv = store();
  const due = await kv.rankedDue(PENDING_INDEX, now, EXPIRY_BATCH);
  if (due.length === 0) return 0;

  let expired = 0;

  for (const reference of due) {
    const at = new Date(now).toISOString();
    let wonTheRace = false;

    const updated = await storeOrders.update(reference, (order) => {
      if (order.status !== 'pending_payment') return order;
      if (new Date(order.expiresAt).getTime() > now) return order;
      wonTheRace = true;
      return {
        ...order,
        status: 'expired' satisfies OrderStatus,
        updatedAt: at,
        events: [...order.events, { at, type: 'order.expired' }],
      };
    });

    if (!updated) {
      // The order is gone (evicted, or expired past its TTL). Drop the index
      // entry so the sweep does not keep finding it.
      await kv.rankedRemove(PENDING_INDEX, reference);
      continue;
    }

    if (wonTheRace) {
      await release(updated.lines.map((line) => ({ sku: line.sku, qty: line.qty })));
      expired += 1;
    }
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
