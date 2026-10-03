import { RATE_LIMITS } from '@/config/constants';
import { jsonError, jsonOk } from '@/lib/http/responses';
import { logger, newRequestId } from '@/server/observability/logger';
import { OrderReferenceSchema } from '@/lib/validation/schemas';
import { cancelOrder, settleOrder } from '@/server/orders/order-service';
import { claimEvent, releaseEvent } from '@/server/payments/webhook-log';
import type { PaymentProvider, VerifiedWebhookEvent } from '@/server/payments/provider';
import { rateLimit, rateLimitHeaders } from '@/server/security/rate-limit';

/**
 * ============================================================================
 *  WEBHOOK HANDLER — the one place an order may become `paid`.
 * ============================================================================
 *
 * Webhooks deliberately do **not** go through `guarded()`. A payment provider is
 * a third party: it sends no `Origin`, carries no session cookie and has no CSRF
 * token, so those checks would reject every legitimate call. Its authentication
 * is the HMAC signature instead — which is stronger than any of them, because it
 * proves possession of a shared secret rather than merely the shape of a request.
 *
 * What replaces the standard pipeline:
 *
 *   1. **rate limit** — an unauthenticated public endpoint still needs a ceiling;
 *   2. **hard body cap** before reading, since there is no `guarded` to do it;
 *   3. **signature verification over the raw bytes** — the body is never parsed
 *      before the signature is checked, and never re-serialised, because that
 *      changes the bytes the signature covers;
 *   4. **replay rejection** by timestamp window (inside each adapter);
 *   5. **idempotency** by provider event id — a retry is acknowledged with 200 and
 *      changes nothing;
 *   6. **amount and currency verification** against our own snapshot, in
 *      `settleOrder()`. A mismatch flags the order for review; it is never
 *      fulfilled on the provider's number alone.
 *
 * And the rule that underpins all of it: there is **no route anywhere** that lets
 * a browser assert that payment succeeded.
 */

const MAX_WEBHOOK_BYTES = 64 * 1024;

export interface WebhookRouteOptions {
  provider: PaymentProvider;
  /**
   * For providers whose notification is only a pointer (Mercado Pago), fetch the
   * authoritative amount and status from their API before settling.
   */
  resolve?: (event: VerifiedWebhookEvent) => Promise<{
    status: string;
    amount: number;
    currency: string;
    orderReference: string | null;
  } | null>;
}

export function webhookRoute({ provider, resolve }: WebhookRouteOptions) {
  return async function POST(request: Request): Promise<Response> {
    const requestId = newRequestId();

    const limit = await rateLimit('webhook', `webhook:${provider.id}`);
    if (!limit.allowed) {
      return jsonError('rate_limited', { requestId, headers: rateLimitHeaders(limit) });
    }

    const declared = Number(request.headers.get('content-length') ?? '0');
    if (!Number.isFinite(declared) || declared > MAX_WEBHOOK_BYTES) {
      return jsonError('payload_too_large', { requestId });
    }

    // Raw text, exactly as received. Signatures are computed over bytes.
    const rawBody = await request.text();
    if (rawBody.length > MAX_WEBHOOK_BYTES) {
      return jsonError('payload_too_large', { requestId });
    }

    const verification = provider.verifyWebhook(rawBody, request.headers);

    if (!verification.ok) {
      logger.security(
        verification.reason === 'stale' ? 'webhook.replay' : 'webhook.signature.invalid',
        { requestId, provider: provider.id, reason: verification.reason },
      );
      // 401, and nothing about the order is touched.
      return jsonError('unauthorized', { requestId, message: 'Invalid signature.' });
    }

    const event = verification.event;

    // Claim the event id BEFORE anything that changes an order, and claim it
    // with a conditional write. A provider retrying aggressively can have two
    // deliveries of the same event in flight on two instances; a read followed
    // by a write would let both of them settle the order.
    if (!(await claimEvent(provider.id, event.id))) {
      // Idempotent: acknowledge so the provider stops retrying, change nothing.
      logger.info('webhook.duplicate', { requestId, provider: provider.id, eventId: event.id });
      return jsonOk({ received: true, duplicate: true });
    }

    if (event.type === 'ignored') {
      return jsonOk({ received: true, ignored: true });
    }

    try {
      // Resolve the authoritative figures where the notification does not carry them.
      const authoritative = resolve ? await resolve(event) : null;

      const reference = authoritative?.orderReference ?? event.orderReference;
      const amount = authoritative?.amount ?? event.amount;
      const currency = authoritative?.currency ?? event.currency;
      const succeeded = authoritative
        ? authoritative.status === 'approved' || authoritative.status === 'succeeded'
        : event.type === 'payment.succeeded';

      const parsedReference = reference ? OrderReferenceSchema.safeParse(reference) : null;
      if (!parsedReference?.success) {
        // The claim is kept: retrying will not make an unparseable reference
        // parseable, and releasing it would invite an infinite retry loop.
        logger.warn('webhook.unknown_reference', { requestId, provider: provider.id, eventId: event.id });
        return jsonOk({ received: true, matched: false });
      }

      if (!succeeded) {
        await cancelOrder(parsedReference.data, `${provider.id}:payment_failed`);
        return jsonOk({ received: true, settled: false });
      }

      const result = await settleOrder({
        reference: parsedReference.data,
        amount,
        currency,
        providerEventId: event.id,
        provider: provider.id,
      });

      if (!result.ok) {
        logger.warn('webhook.not_settled', {
          requestId,
          provider: provider.id,
          reason: result.reason,
          reference: parsedReference.data,
        });
        // Still a 200: the provider delivered correctly, and retrying would not help.
        return jsonOk({ received: true, settled: false });
      }

      return jsonOk({ received: true, settled: true, status: result.status });
    } catch (error) {
      // Give the claim back so the provider's retry can do the work. Holding it
      // would turn a transient failure — the provider's API timing out, the
      // store refusing a write — into a payment that is never recorded, which
      // is the worst outcome available here.
      await releaseEvent(provider.id, event.id);
      throw error;
    }
  };
}

/** Exported so the rate-limit table and the handler cannot drift. */
export const WEBHOOK_LIMIT = RATE_LIMITS.webhook;
