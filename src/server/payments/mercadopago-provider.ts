import { createHmac, timingSafeEqual } from 'node:crypto';
import { WEBHOOK_MAX_AGE_SECONDS } from '@/config/constants';
import { env } from '@/config/env';
import { absoluteUrl } from '@/config/site';
import type { Order } from '@/types/commerce';
import type { PaymentProvider, WebhookVerification } from '@/server/payments/provider';

/**
 * Mercado Pago adapter — the right default for Argentina.
 *
 * Checkout Pro is used deliberately: the customer pays on Mercado Pago's own
 * page, so no card data ever reaches our origin and our PCI scope stays at
 * SAQ-A. The access token is read here and nowhere else.
 *
 * Webhook verification follows Mercado Pago's documented scheme: the
 * `x-signature` header carries `ts` and `v1`, and `v1` is
 * `HMAC-SHA256(secret, "id:<data.id>;request-id:<x-request-id>;ts:<ts>;")`.
 * Note that the signature covers the *resource id*, not the body — so the body
 * is treated as a notification, and the authoritative amount is read back from
 * the API rather than trusted from the payload.
 */

function parseSignature(header: string | null): { ts: string; v1: string } | null {
  if (!header) return null;
  const parts = new Map<string, string>();
  for (const segment of header.split(',')) {
    const [key, value] = segment.split('=');
    if (key && value) parts.set(key.trim(), value.trim());
  }
  const ts = parts.get('ts');
  const v1 = parts.get('v1');
  return ts && v1 ? { ts, v1 } : null;
}

export const mercadoPagoProvider: PaymentProvider = {
  id: 'mercadopago',

  async createCheckout(order: Order, returnUrl: string) {
    const token = env().MERCADOPAGO_ACCESS_TOKEN;
    if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN is not configured');

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // Mercado Pago deduplicates preference creation on this key, which makes
        // a retried checkout idempotent instead of creating a second payment.
        'X-Idempotency-Key': order.id,
      },
      body: JSON.stringify({
        // Amounts come from our own snapshot, in pesos with two decimals.
        items: order.lines.map((line) => ({
          id: line.sku,
          title: `${line.productName} ${line.variantLabel}`.trim(),
          quantity: line.qty,
          currency_id: 'ARS',
          unit_price: line.unitPrice / 100,
        })),
        payer: { name: order.customer.name, email: order.customer.email },
        external_reference: order.reference,
        notification_url: absoluteUrl('/api/webhooks/mercadopago'),
        back_urls: {
          success: returnUrl,
          pending: returnUrl,
          failure: returnUrl,
        },
        auto_return: 'approved',
        statement_descriptor: 'OWNER STORE',
        // Shipping and discounts are sent as explicit charge lines so the
        // provider's total matches ours exactly; any divergence is caught by the
        // amount check in `settleOrder`.
        shipments: { cost: order.totals.shipping / 100, mode: 'not_specified' },
      }),
    });

    if (!response.ok) {
      // The provider's body may contain account detail; it is not propagated.
      throw new Error(`Mercado Pago preference failed with status ${response.status}`);
    }

    const data = (await response.json()) as { id?: string; init_point?: string };
    if (!data.id || !data.init_point) throw new Error('Mercado Pago returned an unexpected payload');

    return {
      redirectUrl: data.init_point,
      clientToken: null,
      providerReference: data.id,
    };
  },

  verifyWebhook(rawBody: string, headers: Headers): WebhookVerification {
    const secret = env().MERCADOPAGO_WEBHOOK_SECRET;
    // Fail closed. A deployment without a secret cannot verify anything, and
    // accepting unverified payment notifications is strictly worse than
    // rejecting them.
    if (!secret) return { ok: false, reason: 'missing_secret' };

    const signature = parseSignature(headers.get('x-signature'));
    const requestId = headers.get('x-request-id') ?? '';
    if (!signature) return { ok: false, reason: 'missing_signature' };

    const occurredAt = Date.parse(signature.ts) || Number(signature.ts);
    if (!Number.isFinite(occurredAt)) return { ok: false, reason: 'malformed' };
    if (Math.abs(Date.now() - occurredAt) / 1000 > WEBHOOK_MAX_AGE_SECONDS) {
      return { ok: false, reason: 'stale' };
    }

    let payload: { data?: { id?: string }; type?: string; action?: string; id?: number };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: 'malformed' };
    }

    const resourceId = payload.data?.id;
    if (!resourceId) return { ok: false, reason: 'malformed' };

    const manifest = `id:${resourceId};request-id:${requestId};ts:${signature.ts};`;
    const expected = createHmac('sha256', secret).update(manifest).digest('hex');

    const received = Buffer.from(signature.v1, 'utf8');
    const computed = Buffer.from(expected, 'utf8');
    if (received.length !== computed.length || !timingSafeEqual(received, computed)) {
      return { ok: false, reason: 'bad_signature' };
    }

    return {
      ok: true,
      event: {
        id: String(payload.id ?? resourceId),
        // The notification only says "something happened to this payment". The
        // route must read the authoritative amount and status back from the API
        // before settling — see `fetchPaymentAuthoritative`.
        type: 'payment.pending',
        orderReference: null,
        amount: 0,
        currency: 'ARS',
        occurredAt,
      },
    };
  },
};

/**
 * Read a payment's real state from Mercado Pago.
 *
 * This is the step that makes the integration trustworthy: the webhook proves
 * *someone authentic is telling us to look*, and this call establishes *what is
 * actually true*. Amount, currency, status and our order reference all come from
 * the API response, never from the notification body.
 */
export async function fetchPaymentAuthoritative(paymentId: string): Promise<{
  status: string;
  amount: number;
  currency: string;
  orderReference: string | null;
} | null> {
  const token = env().MERCADOPAGO_ACCESS_TOKEN;
  if (!token) return null;
  if (!/^\d{1,24}$/.test(paymentId)) return null;

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) return null;

  const data = (await response.json()) as {
    status?: string;
    transaction_amount?: number;
    currency_id?: string;
    external_reference?: string;
  };

  if (typeof data.transaction_amount !== 'number') return null;

  return {
    status: data.status ?? 'unknown',
    // Back to integer centavos, rounded once.
    amount: Math.round(data.transaction_amount * 100),
    currency: data.currency_id ?? 'ARS',
    orderReference: data.external_reference ?? null,
  };
}
