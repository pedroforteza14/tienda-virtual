import { mockProvider } from '@/server/payments/mock-provider';
import { webhookRoute } from '@/server/payments/webhook-handler';

/**
 * Demo webhook endpoint.
 *
 * It takes no money, but it runs the full verification protocol — HMAC over the
 * raw body, a timestamp window, idempotency, amount checking — so the integration
 * tests exercise exactly the code path a live provider would.
 */
export const POST = webhookRoute({ provider: mockProvider });
