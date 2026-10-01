/**
 * Processed-webhook log, for idempotency and replay rejection.
 *
 * Providers retry. A retry must be acknowledged with 200 and change nothing —
 * otherwise a duplicate notification double-settles an order, and a replayed one
 * settles a cancelled order. Recording the provider's event id and refusing to
 * process it twice is what makes the handler idempotent.
 *
 * **[PRE-LAUNCH]** must be a table with a unique constraint on
 * `(provider, event_id)`, so idempotency holds across replicas and restarts. An
 * in-memory set gives neither.
 */

interface Entry {
  at: number;
}

const seen = new Map<string, Entry>();
const MAX_ENTRIES = 50_000;
/** Keep ids well beyond any provider's retry window. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function key(provider: string, eventId: string): string {
  return `${provider}:${eventId}`;
}

export function alreadyProcessed(provider: string, eventId: string, now = Date.now()): boolean {
  const entry = seen.get(key(provider, eventId));
  if (!entry) return false;
  if (now - entry.at > TTL_MS) {
    seen.delete(key(provider, eventId));
    return false;
  }
  return true;
}

export function markProcessed(provider: string, eventId: string, now = Date.now()): void {
  if (seen.size >= MAX_ENTRIES) {
    for (const [existing, entry] of seen) {
      if (now - entry.at > TTL_MS) seen.delete(existing);
    }
    if (seen.size >= MAX_ENTRIES) {
      const oldest = seen.keys().next().value;
      if (oldest) seen.delete(oldest);
    }
  }
  seen.set(key(provider, eventId), { at: now });
}

/** Test-only. */
export function resetWebhookLog(): void {
  seen.clear();
}
