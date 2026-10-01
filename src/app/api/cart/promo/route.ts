import { CartPromoSchema } from '@/lib/validation/schemas';
import { guarded, jsonOk } from '@/server/security/guard';
import { setPromo } from '@/server/cart/cart-service';

/**
 * Apply or clear a promo code.
 *
 * The client sends a **code**, never a percentage or an amount. The code is
 * resolved against the server-side table, and expiry, minimum spend and product
 * eligibility are all checked there. An invalid code comes back as a notice on the
 * priced cart rather than an error — a mistyped coupon should not fail a request.
 */
export const POST = guarded(
  { bucket: 'cart', schema: CartPromoSchema },
  async ({ data }) => jsonOk({ cart: await setPromo(data.code) }),
);
