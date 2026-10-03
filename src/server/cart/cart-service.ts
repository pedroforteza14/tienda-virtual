import { cookies } from 'next/headers';
import { MAX_CART_LINES, MAX_QTY_PER_LINE, SESSION_MAX_AGE_SECONDS } from '@/config/constants';
import { CartCookieSchema } from '@/lib/validation/schemas';
import { cookieAttributes, cookieName } from '@/server/security/cookies';
import { signJson, unsignJson } from '@/server/security/signing';
import { priceCart, type PriceCartOptions } from '@/server/pricing/pricing';
import type { CartLineInput, PricedCart } from '@/types/commerce';

/**
 * The cart lives in a signed, HttpOnly cookie holding **only** `[sku, qty]`
 * pairs and an optional promo code.
 *
 * Why a cookie and not server state: it survives a restart, needs no shared
 * store, and costs nothing to scale. That is only safe because the cookie holds
 * no money — there is no total, no unit price, no discount in it to tamper with.
 * Every read re-prices from the catalogue, so the worst a customer can do by
 * editing their own cart is ask for a different SKU or quantity, which is what a
 * cart is for.
 *
 * It is signed anyway: a forged or corrupted cookie is then rejected wholesale
 * rather than parsed, which keeps malformed input out of the pricing path.
 */

const CART_PURPOSE = 'cart';

interface CartState {
  lines: CartLineInput[];
  promoCode: string | null;
}

const EMPTY: CartState = { lines: [], promoCode: null };

function decode(raw: string | undefined): CartState {
  const payload = unsignJson(raw, CART_PURPOSE, SESSION_MAX_AGE_SECONDS);
  if (!payload) return EMPTY;

  const parsed = CartCookieSchema.safeParse(payload);
  // A cookie that does not match the schema is discarded, not repaired.
  if (!parsed.success) return EMPTY;

  return {
    lines: parsed.data.l.map(([sku, qty]) => ({ sku, qty })),
    promoCode: parsed.data.p ?? null,
  };
}

function encode(state: CartState): string {
  return signJson(
    {
      v: 1 as const,
      l: state.lines
        .slice(0, MAX_CART_LINES)
        .map(({ sku, qty }) => [sku, Math.min(Math.max(1, qty), MAX_QTY_PER_LINE)] as [string, number]),
      p: state.promoCode,
    },
    CART_PURPOSE,
  );
}

async function readState(): Promise<CartState> {
  const store = await cookies();
  return decode(store.get(cookieName('cart'))?.value);
}

async function writeState(state: CartState): Promise<void> {
  const store = await cookies();
  const name = cookieName('cart');

  if (state.lines.length === 0 && !state.promoCode) {
    store.set(name, '', { ...cookieAttributes('cart', 0), maxAge: 0 });
    return;
  }
  store.set(name, encode(state), cookieAttributes('cart', SESSION_MAX_AGE_SECONDS));
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/** Read and price the cart. Safe in Server Components (no write). */
export async function getCart(options: PriceCartOptions = {}): Promise<PricedCart> {
  const state = await readState();
  return priceCart(state.lines, { promoCode: state.promoCode, ...options });
}

/**
 * Apply a mutation and persist the result.
 *
 * The cookie is rewritten from the **priced** cart rather than from the raw
 * request, so lines that were dropped (unknown SKU, out of stock) or clamped (to
 * available stock) are persisted in their corrected form. Without this, a cart
 * would keep re-reporting the same notice on every read.
 */
async function mutate(
  change: (state: CartState) => CartState,
  options: PriceCartOptions = {},
): Promise<PricedCart> {
  const next = change(await readState());
  const priced = await priceCart(next.lines, { promoCode: next.promoCode, ...options });

  await writeState({
    lines: priced.lines.map((line) => ({ sku: line.sku, qty: line.qty })),
    promoCode: priced.promo?.code ?? null,
  });

  return priced;
}

export async function addLine(sku: string, qty: number): Promise<PricedCart> {
  return mutate((state) => {
    const lines = [...state.lines];
    const index = lines.findIndex((line) => line.sku === sku);
    if (index >= 0) {
      const existing = lines[index];
      if (existing) {
        lines[index] = { sku, qty: Math.min(existing.qty + qty, MAX_QTY_PER_LINE) };
      }
    } else {
      if (lines.length >= MAX_CART_LINES) return state;
      lines.push({ sku, qty });
    }
    return { ...state, lines };
  });
}

export async function setLineQty(sku: string, qty: number): Promise<PricedCart> {
  return mutate((state) => ({
    ...state,
    lines:
      qty === 0
        ? state.lines.filter((line) => line.sku !== sku)
        : state.lines.map((line) => (line.sku === sku ? { sku, qty } : line)),
  }));
}

export async function removeLine(sku: string): Promise<PricedCart> {
  return mutate((state) => ({
    ...state,
    lines: state.lines.filter((line) => line.sku !== sku),
  }));
}

/** `null` clears the code. An invalid code is reported as a notice, not an error:
 *  a mistyped coupon should not fail the request. */
export async function setPromo(code: string | null): Promise<PricedCart> {
  return mutate((state) => ({ ...state, promoCode: code }));
}

export async function clearCart(): Promise<void> {
  await writeState(EMPTY);
}

/** Exported for the order path, which needs the raw lines to re-price and reserve. */
export async function readCartLines(): Promise<{ lines: CartLineInput[]; promoCode: string | null }> {
  const state = await readState();
  return { lines: state.lines, promoCode: state.promoCode };
}

/** Exported for tests, which exercise encode/decode without a cookie store. */
export const __testing = { encode, decode };
