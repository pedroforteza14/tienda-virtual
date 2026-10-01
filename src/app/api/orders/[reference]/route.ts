import { OrderReferenceSchema } from '@/lib/validation/schemas';
import { guarded, jsonError, jsonOk } from '@/server/security/guard';
import { getOwnedOrderDTO } from '@/server/orders/order-service';

/**
 * Read one order.
 *
 * This is the IDOR surface, so it is worth being explicit about the three
 * controls that close it:
 *
 *  1. the reference is **validated against a schema before it reaches storage** —
 *     nothing unshaped ever becomes a lookup key;
 *  2. ownership is checked against a key derived from the *signed session*, never
 *     from anything in the request;
 *  3. a failed ownership check returns **404, not 403**. A 403 would confirm the
 *     reference exists, which is most of what an enumerating attacker wants.
 *     "Not yours" and "not there" are indistinguishable from outside.
 *
 * docs/threat-model.md §4.4.
 */
export const GET = guarded<never>({ bucket: 'api' }, async ({ url, sessionId, auth, requestId }) => {
  // `/api/orders/<ref>` — read from the path rather than a param object so the
  // same validation applies however the route is reached.
  const raw = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
  const parsed = OrderReferenceSchema.safeParse(raw);

  if (!parsed.success) {
    // A malformed reference is also a 404: distinguishing it from a valid-but-
    // unknown one would tell an attacker when they have the format right.
    return jsonError('not_found', { requestId });
  }

  const order = await getOwnedOrderDTO(parsed.data, sessionId, auth?.userId ?? null);
  if (!order) return jsonError('not_found', { requestId });

  return jsonOk({ order });
});
