import { catalog } from '@/server/catalog/repository';

/**
 * Inventory with reservations.
 *
 * The catalogue is treated as read-only, so committed stock is tracked here as a
 * reservation layer on top of it: `available = catalogueStock - reserved`. Three
 * reasons this shape rather than mutating the catalogue:
 *
 *  - the catalogue stays a pure data source, so it can be swapped for a remote
 *    one without the order path changing;
 *  - reservations are resettable, which makes the test suite deterministic;
 *  - it mirrors how a real system works, where the order service holds a
 *    reservation and the inventory system is the system of record.
 *
 * **The race condition is handled explicitly.** Check-then-decrement is the
 * classic oversell bug: two concurrent checkouts both read `stock = 1` and both
 * succeed. `reserveAtomically` does the check and the decrement inside one
 * synchronous block, which on a single-threaded event loop is genuinely atomic —
 * no `await` may appear between them.
 *
 * **[PRE-LAUNCH]** behind multiple replicas this must become a conditional
 * database write (`UPDATE … SET stock = stock - :n WHERE sku = :sku AND
 * stock >= :n`) and succeed only on a non-zero row count. An in-process
 * reservation map does not coordinate across processes.
 */

const reserved = new Map<string, number>();

export function reservedUnits(sku: string): number {
  return reserved.get(sku) ?? 0;
}

/** Units a customer can actually buy right now. */
export function availableStock(sku: string): number {
  const resolved = catalog().resolveSku(sku);
  if (!resolved) return 0;
  return Math.max(0, resolved.variant.stock - reservedUnits(sku));
}

export interface ReservationLine {
  sku: string;
  qty: number;
}

export type ReservationResult =
  | { ok: true }
  | { ok: false; sku: string; requested: number; available: number };

/**
 * Reserve every line, or none.
 *
 * ⚠️ Intentionally synchronous, and must stay that way. An `await` between the
 * availability check and the decrement reopens the oversell race.
 */
export function reserveAtomically(lines: readonly ReservationLine[]): ReservationResult {
  // Pass 1: verify everything is available.
  for (const line of lines) {
    const available = availableStock(line.sku);
    if (line.qty < 1 || line.qty > available) {
      return { ok: false, sku: line.sku, requested: line.qty, available };
    }
  }
  // Pass 2: commit. No suspension point between the two passes.
  for (const line of lines) {
    reserved.set(line.sku, reservedUnits(line.sku) + line.qty);
  }
  return { ok: true };
}

/** Return stock to the pool: cancellation, expiry, or a failed payment. */
export function release(lines: readonly ReservationLine[]): void {
  for (const line of lines) {
    const next = reservedUnits(line.sku) - line.qty;
    if (next <= 0) reserved.delete(line.sku);
    else reserved.set(line.sku, next);
  }
}

/** Test-only. */
export function resetInventory(): void {
  reserved.clear();
}
