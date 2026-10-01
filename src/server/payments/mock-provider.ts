import { createHmac, timingSafeEqual } from 'node:crypto';
import { WEBHOOK_MAX_AGE_SECONDS } from '@/config/constants';
import { env } from '@/config/env';
import { formatARS } from '@/lib/money';
import type { Order } from '@/types/commerce';
import type { PaymentProvider, WebhookVerification } from '@/server/payments/provider';

/**
 * The development / demo provider.
 *
 * It does **not** take money. What it does do is implement the real security
 * protocol — HMAC-signed webhooks with a timestamp, replay rejection, and an
 * amount to verify — so the integration tests exercise the same verification
 * code path a live provider would, and so swapping in Mercado Pago is a change of
 * adapter rather than a change of flow.
 */

const SIGNATURE_HEADER = 'x-owner-signature';
const TIMESTAMP_HEADER = 'x-owner-timestamp';

function secret(): string {
  // Derived from the session secret so the demo needs no extra configuration,
  // and so a deployment without a real PSP still cannot be fed a forged webhook.
  return createHmac('sha256', Buffer.from(env().SESSION_SECRET!, 'base64'))
    .update('mock-webhook')
    .digest('hex');
}

/** Exported so the test suite and the demo script can sign a payload. */
export function signMockWebhook(rawBody: string, timestamp = Date.now()): Record<string, string> {
  const signature = createHmac('sha256', secret())
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return { [SIGNATURE_HEADER]: signature, [TIMESTAMP_HEADER]: String(timestamp) };
}

export const mockProvider: PaymentProvider = {
  id: 'mock',

  async createCheckout(order: Order, returnUrl: string) {
    if (order.paymentMethod === 'transfer') {
      return {
        redirectUrl: null,
        clientToken: null,
        providerReference: `mock_${order.reference}`,
        instructions: [
          { label: 'Titular', value: 'OWNER STORE SRL (demo)' },
          { label: 'CBU', value: '0000003100000000000000' },
          { label: 'Alias', value: 'owner.store.demo' },
          { label: 'Importe', value: formatARS(order.totals.transferTotal) },
          { label: 'Referencia', value: order.reference },
        ],
      };
    }
    return {
      redirectUrl: `${returnUrl}?demo=1`,
      clientToken: null,
      providerReference: `mock_${order.reference}`,
    };
  },

  verifyWebhook(rawBody: string, headers: Headers): WebhookVerification {
    const signature = headers.get(SIGNATURE_HEADER);
    const timestamp = headers.get(TIMESTAMP_HEADER);
    if (!signature || !timestamp) return { ok: false, reason: 'missing_signature' };

    const occurredAt = Number(timestamp);
    if (!Number.isFinite(occurredAt)) return { ok: false, reason: 'malformed' };

    // Reject outside the replay window *before* comparing, so a captured
    // request cannot be replayed indefinitely even with a valid signature.
    const ageSeconds = Math.abs(Date.now() - occurredAt) / 1000;
    if (ageSeconds > WEBHOOK_MAX_AGE_SECONDS) return { ok: false, reason: 'stale' };

    const expected = createHmac('sha256', secret())
      .update(`${occurredAt}.${rawBody}`)
      .digest('hex');

    const received = Buffer.from(signature, 'utf8');
    const computed = Buffer.from(expected, 'utf8');
    if (received.length !== computed.length || !timingSafeEqual(received, computed)) {
      return { ok: false, reason: 'bad_signature' };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: 'malformed' };
    }

    if (typeof payload !== 'object' || payload === null) return { ok: false, reason: 'malformed' };
    const body = payload as Record<string, unknown>;

    const id = typeof body.id === 'string' ? body.id : null;
    const reference = typeof body.reference === 'string' ? body.reference : null;
    const amount = typeof body.amount === 'number' && Number.isInteger(body.amount) ? body.amount : null;
    const currency = typeof body.currency === 'string' ? body.currency : null;
    const status = typeof body.status === 'string' ? body.status : null;

    if (!id || !reference || amount === null || !currency || !status) {
      return { ok: false, reason: 'malformed' };
    }

    return {
      ok: true,
      event: {
        id,
        type:
          status === 'approved'
            ? 'payment.succeeded'
            : status === 'rejected'
              ? 'payment.failed'
              : 'payment.pending',
        orderReference: reference,
        amount,
        currency,
        occurredAt,
      },
    };
  },
};
