import { CartRemoveSchema } from '@/lib/validation/schemas';
import { guarded, jsonOk } from '@/server/security/guard';
import { removeLine } from '@/server/cart/cart-service';

export const POST = guarded(
  { bucket: 'cart', schema: CartRemoveSchema },
  async ({ data }) => jsonOk({ cart: await removeLine(data.sku) }),
);
