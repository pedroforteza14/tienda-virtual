import { CartUpdateSchema } from '@/lib/validation/schemas';
import { guarded, jsonOk } from '@/server/security/guard';
import { setLineQty } from '@/server/cart/cart-service';

/** Set a line's quantity. `0` removes it. The quantity is clamped to available
 *  stock server-side, and the clamp is reported back as a notice. */
export const POST = guarded(
  { bucket: 'cart', schema: CartUpdateSchema },
  async ({ data }) => jsonOk({ cart: await setLineQty(data.sku, data.qty) }),
);
