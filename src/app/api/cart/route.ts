import { CartAddSchema } from '@/lib/validation/schemas';
import { guarded, jsonError, jsonOk } from '@/server/security/guard';
import { addLine, getCart } from '@/server/cart/cart-service';
import { catalog } from '@/server/catalog/repository';

/** Read the cart. Prices are recomputed from the catalogue on every read. */
export const GET = guarded({ bucket: 'cart' }, async () => {
  return jsonOk({ cart: await getCart() });
});

/**
 * Add to cart.
 *
 * The body is `{ sku, qty }` and the schema is `.strict()`, so
 * `{ sku, qty, price: 1 }` is a **400** rather than a request whose price field
 * is quietly ignored. Rejecting is both safer and far easier to alert on.
 * docs/threat-model.md §4.1.
 */
export const POST = guarded({ bucket: 'cart', schema: CartAddSchema }, async ({ data, requestId }) => {
  // Reject an unknown SKU before touching the cart, so a probe for valid SKUs
  // gets a plain 404 and no state change.
  if (!catalog().resolveSku(data.sku)) {
    return jsonError('not_found', { requestId, message: 'Ese producto no existe.' });
  }

  const cart = await addLine(data.sku, data.qty);
  return jsonOk({ cart });
});
