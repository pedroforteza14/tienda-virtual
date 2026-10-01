import { createHmac, timingSafeEqual } from 'node:crypto';
import { WEBHOOK_MAX_AGE_SECONDS } from '@/config/constants';
import { env } from '@/config/env';
import type { Order } from '@/types/commerce';
import type { PaymentProvider, WebhookVerification } from '@/server/payments/provider';

/**
 * Stripe adapter — for international card payments, where Mercado Pago is not
 * the right rail.
 *
 * Stripe Checkout (hosted) for the same PCI reason as Mercado Pago's Checkout
 * Pro: the card is entered on Stripe's page, so no PAN touches our origin.
 *
 * Webhook verification follows Stripe's documented scheme exactly:
 * `Stripe-Signature: t=<ts>,v1=<hex>`, where `v1` is
 * `HMAC-SHA256(secret, "<ts>.<rawBody>")`. The raw body is required — parsing
 * and re-serialising JSON changes bytes and invalidates the signature.
 */

export const stripeProvider: PaymentProvider = {
  id: 'stripe',

  async createCheckout(order: Order, returnUrl: string) {
    const key = env().STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');

    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('success_url', returnUrl);
    form.set('cancel_url', returnUrl);
    form.set('client_reference_id', order.reference);
    form.set('customer_email', order.customer.email);

    order.lines.forEach((line, index) => {
      form.set(`line_items[${index}][quantity]`, String(line.qty));
      form.set(`line_items[${index}][price_data][currency]`, 'ars');
      // Stripe expects the smallest currency unit, which is exactly how we store
      // money — no conversion, so no rounding step to get wrong.
      form.set(`line_items[${index}][price_data][unit_amount]`, String(line.unitPrice));
      form.set(
        `line_items[${index}][price_data][product_data][name]`,
        `${line.productName} ${line.variantLabel}`.trim(),
      );
    });

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': order.id,
      },
      body: form.toString(),
    });

    if (!response.ok) throw new Error(`Stripe session failed with status ${response.status}`);

    const data = (await response.json()) as { id?: string; url?: string };
    if (!data.id || !data.url) throw new Error('Stripe returned an unexpected payload');

    return { redirectUrl: data.url, clientToken: null, providerReference: data.id };
  },

  verifyWebhook(rawBody: string, headers: Headers): WebhookVerification {
    const secret = env().STRIPE_WEBHOOK_SECRET;
    if (!secret) return { ok: false, reason: 'missing_secret' };

    const header = headers.get('stripe-signature');
    if (!header) return { ok: false, reason: 'missing_signature' };

    let timestamp: string | null = null;
    const signatures: string[] = [];
    for (const segment of header.split(',')) {
      const [key, value] = segment.split('=');
      if (key?.trim() === 't' && value) timestamp = value.trim();
      if (key?.trim() === 'v1' && value) signatures.push(value.trim());
    }
    if (!timestamp || signatures.length === 0) return { ok: false, reason: 'missing_signature' };

    const occurredAt = Number(timestamp) * 1000;
    if (!Number.isFinite(occurredAt)) return { ok: false, reason: 'malformed' };
    if (Math.abs(Date.now() - occurredAt) / 1000 > WEBHOOK_MAX_AGE_SECONDS) {
      return { ok: false, reason: 'stale' };
    }

    const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    const computed = Buffer.from(expected, 'utf8');

    // Stripe may send several `v1` values during a secret rotation; any match is
    // valid, and each comparison is constant time.
    const matched = signatures.some((candidate) => {
      const received = Buffer.from(candidate, 'utf8');
      return received.length === computed.length && timingSafeEqual(received, computed);
    });
    if (!matched) return { ok: false, reason: 'bad_signature' };

    let payload: {
      id?: string;
      type?: string;
      data?: { object?: { client_reference_id?: string; amount_total?: number; currency?: string } };
    };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: 'malformed' };
    }

    const object = payload.data?.object;
    if (!payload.id || !payload.type || !object) return { ok: false, reason: 'malformed' };

    const succeeded = payload.type === 'checkout.session.completed';

    return {
      ok: true,
      event: {
        id: payload.id,
        type: succeeded
          ? 'payment.succeeded'
          : payload.type.startsWith('checkout.session')
            ? 'payment.failed'
            : 'ignored',
        orderReference: object.client_reference_id ?? null,
        amount: typeof object.amount_total === 'number' ? object.amount_total : 0,
        currency: (object.currency ?? 'ars').toUpperCase(),
        occurredAt,
      },
    };
  },
};
