import { store } from '@/server/store';

/**
 * Processed-webhook log, for idempotency and replay rejection.
 *
 * Providers retry. A retry must be acknowledged with 200 and change nothing —
 * otherwise a duplicate notification double-settles an order, and a replayed one
 * settles a cancelled order. Recording the provider's event id and refusing to
 * process it twice is what makes the handler idempotent.
 *
 * `claimEvent` is a single conditional write rather than a read followed by a
 * write, and that is the whole correctness argument: a provider that retries
 * aggressively can have two deliveries of the same event in flight at once, on
 * two instances. With a check and a separate mark, both read "not seen" and both
 * settle the order. With a conditional write, exactly one claim succeeds.
 *
 * The ids expire on their own, well past any provider's retry window, so the
 * log cannot grow without bound and nothing has to sweep it.
 */

/** Seven days — longer than any provider's retry schedule. */
const TTL_SECONDS = 7 * 24 * 60 * 60;

function key(provider: string, eventId: string): string {
  return `webhook:${provider}:${eventId}`;
}

/**
 * Claim an event id for processing.
 *
 * @returns true if this caller may process it; false if it was already claimed.
 */
export async function claimEvent(provider: string, eventId: string): Promise<boolean> {
  return store().set(key(provider, eventId), '1', {
    ttlSeconds: TTL_SECONDS,
    ifAbsent: true,
  });
}

/**
 * Release a claim.
 *
 * Used when processing failed in a way the provider should retry. Without this,
 * a transient failure (the store accepted the claim, then the order write threw)
 * would make the event permanently unprocessable: every retry would be refused
 * as a duplicate of an attempt that never actually did anything.
 */
export async function releaseEvent(provider: string, eventId: string): Promise<void> {
  await store().delete(key(provider, eventId));
}

/** Whether an id has been claimed. For diagnostics and tests, not the hot path. */
export async function alreadyProcessed(provider: string, eventId: string): Promise<boolean> {
  return (await store().get(key(provider, eventId))) !== null;
}
