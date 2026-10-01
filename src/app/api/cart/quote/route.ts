import { z } from 'zod';
import { guarded, jsonOk } from '@/server/security/guard';
import { getCart } from '@/server/cart/cart-service';
import { PAYMENT_METHODS, SHIPPING_ZONES } from '@/types/commerce';

/**
 * Re-price the cart for a shipping zone and payment method.
 *
 * This exists so the checkout can show a live total **without the client ever
 * computing one**. The browser sends a zone and a method — labels, not amounts —
 * and the server returns the full priced cart including shipping, the transfer
 * discount and the instalment split.
 *
 * Note what is absent again: no shipping cost, no total, no discount in the input.
 * `.strict()` means sending one is a 400.
 */
const QuoteSchema = z
  .object({
    zone: z.enum(SHIPPING_ZONES),
    paymentMethod: z.enum(PAYMENT_METHODS),
  })
  .strict();

export const POST = guarded({ bucket: 'cart', schema: QuoteSchema }, async ({ data }) =>
  jsonOk({
    cart: await getCart({ zone: data.zone, paymentMethod: data.paymentMethod }),
  }),
);
