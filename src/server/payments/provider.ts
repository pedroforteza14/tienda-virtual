import type { Order } from '@/types/commerce';

/**
 * Payment provider abstraction.
 *
 * The storefront never talks to a PSP directly. It talks to this interface, and
 * an adapter talks to the PSP. That boundary is what makes "prepared for Mercado
 * Pago or Stripe" true rather than aspirational — and it is also a security
 * boundary:
 *
 *  - **Secrets live only inside an adapter**, which is server-only. No adapter
 *    field is ever serialised into a response.
 *  - **We never see a card number.** `createCheckout` returns a URL or a
 *    client-side token; the PAN is entered on the provider's surface. There is no
 *    card field in any schema in this codebase, and none may be added.
 *  - **Only `verifyWebhook` may authorise a state change.** It returns a
 *    normalised event *after* checking the signature, so a caller cannot
 *    accidentally trust an unverified payload.
 */

export interface CheckoutSession {
  /** Where to send the customer, when the provider hosts the payment page. */
  redirectUrl: string | null;
  /** A publishable token for an embedded form. Never a secret. */
  clientToken: string | null;
  /** The provider's own id for this attempt, stored for reconciliation. */
  providerReference: string;
  /** Instructions shown for off-platform payment (bank transfer). */
  instructions?: { label: string; value: string }[];
}

export interface VerifiedWebhookEvent {
  /** Provider event id. Used for idempotency. */
  id: string;
  type: 'payment.succeeded' | 'payment.failed' | 'payment.pending' | 'ignored';
  /** Our order reference, extracted from the provider's payload. */
  orderReference: string | null;
  /** Amount in centavos, as the provider reports it. Verified against our snapshot. */
  amount: number;
  currency: string;
  /** Provider timestamp (ms), used to reject replays outside the window. */
  occurredAt: number;
}

export type WebhookVerification =
  | { ok: true; event: VerifiedWebhookEvent }
  | { ok: false; reason: 'missing_secret' | 'missing_signature' | 'bad_signature' | 'malformed' | 'stale' };

export interface PaymentProvider {
  readonly id: 'mock' | 'mercadopago' | 'stripe';
  createCheckout(order: Order, returnUrl: string): Promise<CheckoutSession>;
  /**
   * @param rawBody The **unparsed** request body. Signatures are computed over
   *        exact bytes; re-serialising JSON changes them and breaks verification.
   */
  verifyWebhook(rawBody: string, headers: Headers): WebhookVerification;
}
