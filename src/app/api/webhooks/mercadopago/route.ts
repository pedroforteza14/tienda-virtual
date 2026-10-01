import {
  fetchPaymentAuthoritative,
  mercadoPagoProvider,
} from '@/server/payments/mercadopago-provider';
import { webhookRoute } from '@/server/payments/webhook-handler';

/**
 * Mercado Pago notifications.
 *
 * Their notification says only "something happened to payment N" — the body
 * carries no trustworthy amount. So the signature establishes that the *request*
 * is authentic, and `fetchPaymentAuthoritative` then establishes what is actually
 * **true** by reading the payment back from their API. The amount we settle
 * against is the one Mercado Pago reports on a server-to-server call, never the
 * one in the webhook body.
 */
export const POST = webhookRoute({
  provider: mercadoPagoProvider,
  resolve: (event) => fetchPaymentAuthoritative(event.id),
});
