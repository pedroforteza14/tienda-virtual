import { catalog } from '@/server/catalog/repository';
import { store } from '@/server/store';
import type { ReservationResult, StockLine } from '@/server/store/types';

/**
 * Inventory with reservations.
 *
 * The catalogue is treated as read-only, so committed stock is tracked as a
 * reservation layer on top of it: `available = catalogueStock - reserved`.
 * Three reasons for this shape rather than mutating the catalogue:
 *
 *  - the catalogue stays a pure data source, so it can be swapped for a remote
 *    one without the order path changing;
 *  - reservations are resettable, which makes the test suite deterministic;
 *  - it mirrors how a real system works, where the order service holds a
 *    reservation and the inventory system is the system of record.
 *
 * **The race condition is handled in the store, not here.** Check-then-decrement
 * is the classic oversell bug: two concurrent checkouts both read `stock = 1`
 * and both succeed. `reserveStock` is one indivisible operation — a block
 * without an `await` in the memory driver, a Lua script in the Redis one — so
 * there is no moment at which two callers can both have seen the same unit as
 * free. This module only translates between catalogue SKUs and that call, and
 * must not reintroduce a check of its own.
 */

export type { ReservationResult };
export type ReservationLine = StockLine;

export async function reservedUnits(sku: string): Promise<number> {
  return store().reservedUnits(sku);
}

/** Units a customer can actually buy right now. */
export async function availableStock(sku: string): Promise<number> {
  const resolved = catalog().resolveSku(sku);
  if (!resolved) return 0;
  return Math.max(0, resolved.variant.stock - (await store().reservedUnits(sku)));
}

/** Availability for several SKUs in one round trip, for listing pages. */
export async function availableStockMany(
  skus: readonly string[],
): Promise<Map<string, number>> {
  const held = await store().reservedUnitsMany(skus);
  const out = new Map<string, number>();
  for (const sku of skus) {
    const resolved = catalog().resolveSku(sku);
    out.set(sku, resolved ? Math.max(0, resolved.variant.stock - (held.get(sku) ?? 0)) : 0);
  }
  return out;
}

/**
 * Reserve every line, or none.
 *
 * An unknown SKU is reported as unavailable rather than skipped: a line the
 * catalogue cannot resolve must never be quietly dropped from an order that
 * then succeeds.
 */
export async function reserve(lines: readonly ReservationLine[]): Promise<ReservationResult> {
  const requests = lines.map((line) => ({
    sku: line.sku,
    qty: line.qty,
    stock: catalog().resolveSku(line.sku)?.variant.stock ?? 0,
  }));
  return store().reserveStock(requests);
}

/** Return stock to the pool: cancellation, expiry, or a failed payment. */
export async function release(lines: readonly ReservationLine[]): Promise<void> {
  await store().releaseStock(lines);
}
