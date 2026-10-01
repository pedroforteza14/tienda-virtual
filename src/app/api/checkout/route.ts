import { absoluteUrl } from '@/config/site';
import { CheckoutSchema } from '@/lib/validation/schemas';
import { guarded, jsonError, jsonOk } from '@/server/security/guard';
import { clearCart, readCartLines } from '@/server/cart/cart-service';
import { createOrder } from '@/server/orders/order-service';
import { toOrderDTO } from '@/server/orders/order-repository';
import { paymentProvider } from '@/server/payments';
import { logger } from '@/server/observability/logger';

/**
 * Create an order.
 *
 * ⚠️ The most security-sensitive route in the application. Note what the request
 * body is **allowed** to contain: a customer, a shipping zone and address, a
 * payment method, a promo code, and a terms acceptance. That is all. There is no
 * amount, no total, no line price, no stock figure and no card number — none of
 * those fields exist in `CheckoutSchema`, so there is no path by which a client
 * can influence what it is charged.
 *
 * The cart itself comes from the signed cookie, not the body, and is re-priced
 * from the catalogue inside `createOrder()`, which also re-checks and reserves
 * stock atomically.
 *
 * The order is created as `pending_payment`. Only a verified webhook can move it
 * to `paid`. docs/threat-model.md §4.1, §4.2, §4.6.
 */
export const POST = guarded(
  { bucket: 'checkout', schema: CheckoutSchema },
  async ({ data, sessionId, auth, requestId }) => {
    if (!sessionId) {
      return jsonError('unauthorized', { requestId, message: 'Tu sesión expiró. Recargá la página.' });
    }

    const { lines, promoCode } = await readCartLines();
    if (lines.length === 0) {
      return jsonError('conflict', { requestId, message: 'Tu carrito está vacío.' });
    }

    const result = await createOrder({
      sessionId,
      userId: auth?.userId ?? null,
      lines,
      // The code from the body wins over the one in the cookie only because it is
      // the more recent expression of intent — either way it is resolved
      // server-side and the discount is recomputed.
      promoCode: data.promoCode ?? promoCode,
      customer: data.customer,
      shipping: data.shipping,
      paymentMethod: data.paymentMethod,
    });

    if (!result.ok) {
      if (result.reason === 'empty_cart') {
        return jsonError('conflict', { requestId, message: 'Tu carrito está vacío.' });
      }
      return jsonError('conflict', {
        requestId,
        message:
          result.available > 0
            ? `Nos quedan ${result.available} unidades de uno de los productos. Ajustá la cantidad.`
            : 'Uno de los productos se quedó sin stock mientras completabas el pedido.',
      });
    }

    const order = result.order;

    // Hand off to the provider. A failure here must not leave an order the
    // customer cannot pay for *and* stock they are holding — so the order is
    // reported as created with no payment handoff, and it expires on its own.
    let payment: Awaited<ReturnType<ReturnType<typeof paymentProvider>['createCheckout']>> | null = null;
    try {
      payment = await paymentProvider().createCheckout(
        order,
        absoluteUrl(`/pedido/${order.reference}`),
      );
    } catch (error) {
      logger.error('checkout.provider_failed', {
        requestId,
        reference: order.reference,
        provider: paymentProvider().id,
        error,
      });
    }

    // The cart is emptied only after the order exists, so a failure above leaves
    // the customer's cart intact.
    await clearCart();

    return jsonOk(
      {
        order: toOrderDTO(order),
        payment: payment
          ? {
              redirectUrl: payment.redirectUrl,
              instructions: payment.instructions ?? null,
            }
          : null,
      },
      { status: 201 },
    );
  },
);
