/**
 * The shared store.
 *
 * Every piece of mutable server state in this application — rate-limit
 * counters, login lockouts, authenticated sessions, users, orders, stock
 * reservations and the processed-webhook log — lived in a module-level `Map`.
 * That is correct for one process and wrong for every serverless platform,
 * where each request may land on a different instance with its own empty
 * memory. The symptom is not subtle: you create an order and the page that
 * reads it back 404s, because the instance serving the read never saw the
 * write.
 *
 * This interface is what those `Map`s were doing, named. Two implementations
 * satisfy it:
 *
 *   - `memory-store.ts` — the original behaviour, for local development and the
 *     test suite. One process, no network, nothing to configure.
 *   - `redis-store.ts` — the same semantics against Redis over Upstash's REST
 *     API, which is the one Redis dialect that works from a serverless function
 *     without a connection pool.
 *
 * ## Why this shape rather than a generic key/value interface
 *
 * A `get`/`set` interface would push the interesting part — atomicity — back
 * into the callers, where it cannot be done correctly over a network. Three
 * operations here are atomic by contract, and that contract is the whole point:
 *
 *   - `reserveStock` checks availability and commits the reservation as one
 *     indivisible step. Split into a read and a write, it is the classic
 *     oversell race: two checkouts both read `stock = 1` and both succeed.
 *   - `compareAndSet` gives orders optimistic concurrency, so a webhook and a
 *     cancellation racing on the same order cannot lose one of the two writes.
 *   - `countInWindow` increments and reads the expiry together, so a rate limit
 *     cannot be reset by a concurrent request arriving between the two.
 *
 * In the memory driver each is a synchronous block, which on a single-threaded
 * event loop is genuinely atomic. In the Redis driver each is a Lua script,
 * which Redis runs to completion without interleaving. The guarantee is the
 * same; only the mechanism differs. Anything that cannot be expressed as one
 * of these operations does not belong in this interface.
 */

export type StoreDriver = 'memory' | 'upstash';

export interface WindowCount {
  /** Requests seen in the current window, including this one. */
  count: number;
  /** Epoch milliseconds at which the window ends. */
  resetAt: number;
}

export interface StockLine {
  sku: string;
  qty: number;
}

/** A line plus the catalogue stock it is checked against. */
export interface StockRequest extends StockLine {
  /** Total units the catalogue holds for this SKU. */
  stock: number;
}

export type ReservationResult =
  | { ok: true }
  | { ok: false; sku: string; requested: number; available: number };

export interface SetOptions {
  ttlSeconds?: number;
  /** Write only if the key does not exist. Returns false if it did. */
  ifAbsent?: boolean;
}

export interface ScoredMember {
  member: string;
  score: number;
}

export interface CommerceStore {
  readonly driver: StoreDriver;

  /* --- values ------------------------------------------------------------ */

  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: SetOptions): Promise<boolean>;
  delete(...keys: string[]): Promise<void>;

  /**
   * Replace `key` only if it currently holds exactly `expected` (or does not
   * exist, when `expected` is null). Returns false if someone else wrote first,
   * and the caller retries with the new value.
   */
  compareAndSet(
    key: string,
    expected: string | null,
    next: string,
    options?: SetOptions,
  ): Promise<boolean>;

  /* --- fixed-window counters --------------------------------------------- */

  /**
   * Increment the counter for `key`, starting a `windowMs` window on the first
   * increment. Atomic: the increment and the expiry are set together.
   */
  countInWindow(key: string, windowMs: number): Promise<WindowCount>;

  /** Current count without incrementing. Zero once the window has passed. */
  readWindow(key: string): Promise<number>;

  /* --- sets --------------------------------------------------------------- */

  setAdd(key: string, member: string, ttlSeconds?: number): Promise<void>;
  setRemove(key: string, member: string): Promise<void>;
  setMembers(key: string): Promise<string[]>;

  /* --- sorted sets (ordering and due-time scans) -------------------------- */

  rankedAdd(key: string, member: string, score: number): Promise<void>;
  rankedRemove(key: string, member: string): Promise<void>;
  /** Members with the highest scores first. */
  rankedTop(key: string, limit: number): Promise<string[]>;
  /** Members scored at or below `score` — "everything now due". */
  rankedDue(key: string, score: number, limit: number): Promise<string[]>;

  /* --- stock reservations ------------------------------------------------- */

  /**
   * Reserve every line or none, atomically.
   *
   * The caller passes the catalogue stock alongside each line because the
   * catalogue is a static data source rather than store state; the store holds
   * only the reservation count subtracted from it.
   */
  reserveStock(lines: readonly StockRequest[]): Promise<ReservationResult>;
  /** Return units to the pool. Never drops below zero. */
  releaseStock(lines: readonly StockLine[]): Promise<void>;
  reservedUnits(sku: string): Promise<number>;
  reservedUnitsMany(skus: readonly string[]): Promise<Map<string, number>>;

  /* --- lifecycle ---------------------------------------------------------- */

  /** Test-only: drop everything this store holds. */
  reset(): Promise<void>;
}
