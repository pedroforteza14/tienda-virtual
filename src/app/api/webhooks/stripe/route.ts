import { stripeProvider } from '@/server/payments/stripe-provider';
import { webhookRoute } from '@/server/payments/webhook-handler';

/**
 * Stripe events.
 *
 * Stripe signs the full body, so the payload's `amount_total` and
 * `client_reference_id` are trustworthy once the signature verifies — no
 * follow-up API call is needed. The amount is still checked against our own
 * snapshot in `settleOrder()`, because a signed webhook proves authenticity, not
 * that the figure matches what we quoted.
 */
export const POST = webhookRoute({ provider: stripeProvider });
