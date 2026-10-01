import { shippingOptions, promos } from '@/data/commerce';
import { MAX_CART_LINES, MAX_QTY_PER_LINE } from '@/config/constants';
import { site } from '@/config/site';
import { add, applyDiscount, multiply, percentOf, splitInstalments, subtract } from '@/lib/money';
import type { Centavos } from '@/lib/money';
import { catalog } from '@/server/catalog/repository';
import { availableStock } from '@/server/orders/inventory';
import type { Product } from '@/types/catalog';
import type {
  CartLineInput,
  CartTotals,
  PaymentMethod,
  PricedCart,
  PricedCartLine,
  ShippingZone,
} from '@/types/commerce';

/**
 * ============================================================================
 *  THE PRICING ENGINE — the one place money is decided.
 * ============================================================================
 *
 * Contract, and the reason this file exists:
 *
 *   INPUT  — a list of `{ sku, qty }`. Nothing else. There is no parameter here
 *            that lets a caller suggest a price, a discount or a total.
 *   OUTPUT — every monetary figure, derived from the catalogue, in integer
 *            centavos.
 *
 * `priceCart` is called on every cart read, every cart mutation, and again at
 * order creation. It is a pure function of (SKUs, quantities, catalogue), so the
 * price a customer sees and the price we charge cannot diverge — there is no
 * second code path that could.
 *
 * See docs/threat-model.md §4.1.
 */

export interface PriceCartOptions {
  promoCode?: string | null | undefined;
  zone?: ShippingZone | undefined;
  paymentMethod?: PaymentMethod | undefined;
}

const EMPTY_TOTALS: CartTotals = {
  subtotal: 0,
  promoDiscount: 0,
  netSubtotal: 0,
  transferDiscount: 0,
  shipping: 0,
  freeShippingApplied: false,
  cardTotal: 0,
  transferTotal: 0,
  total: 0,
  instalments: null,
};

function variantLabel(storage?: string, size?: string): string {
  return [size, storage].filter(Boolean).join(' · ');
}

/**
 * Resolve a promo code server-side.
 *
 * The client sends a code string; the percentage, the minimum and the eligible
 * family all come from our table. A code the client invents resolves to `null`
 * and is reported as a notice — never as a silent zero discount, which would
 * leave the customer thinking it applied.
 */
export function resolvePromo(
  code: string | null | undefined,
  netSubtotal: Centavos,
  eligibleSubtotal: (family: string | null) => Centavos,
  now = new Date(),
): { promo: PricedCart['promo']; discount: Centavos; notice: string | null } {
  if (!code) return { promo: null, discount: 0, notice: null };

  const normalised = code.trim().toUpperCase();
  const found = promos.find((candidate) => candidate.code === normalised);

  if (!found) {
    return { promo: null, discount: 0, notice: `El código ${normalised} no es válido.` };
  }
  if (found.expiresAt && new Date(found.expiresAt).getTime() < now.getTime()) {
    return { promo: null, discount: 0, notice: `El código ${normalised} está vencido.` };
  }
  if (netSubtotal < found.minSubtotal) {
    return {
      promo: null,
      discount: 0,
      notice: `El código ${normalised} requiere una compra mínima mayor.`,
    };
  }

  // A family-scoped code discounts only the lines in that family.
  const basis = eligibleSubtotal(found.family);
  if (basis === 0) {
    return {
      promo: null,
      discount: 0,
      notice: `El código ${normalised} no aplica a los productos del carrito.`,
    };
  }

  return {
    promo: { code: found.code, label: found.label, percent: found.percent },
    discount: percentOf(basis, found.percent),
    notice: null,
  };
}

/**
 * Shipping quote. Derived from the zone and the subtotal — the client sends a
 * zone, never an amount. An unknown zone falls back to the most expensive
 * option rather than to free, so a malformed value can never under-charge.
 */
export function quoteShipping(
  zone: ShippingZone | undefined,
  netSubtotal: Centavos,
): { shipping: Centavos; freeShippingApplied: boolean } {
  if (!zone) return { shipping: 0, freeShippingApplied: false };

  const option = shippingOptions.find((candidate) => candidate.zone === zone);
  if (!option) {
    const dearest = shippingOptions.reduce((a, b) => (b.flatRate > a.flatRate ? b : a));
    return { shipping: dearest.flatRate, freeShippingApplied: false };
  }

  if (option.flatRate === 0) return { shipping: 0, freeShippingApplied: false };

  const threshold = site.commerce.freeShippingThresholdPesos * 100;
  if (netSubtotal >= threshold) {
    return { shipping: 0, freeShippingApplied: true };
  }
  return { shipping: option.flatRate, freeShippingApplied: false };
}

/** Collapse duplicate SKUs and clamp to the per-line and per-cart limits. */
function normaliseLines(lines: readonly CartLineInput[]): {
  normalised: CartLineInput[];
  notices: string[];
} {
  const notices: string[] = [];
  const merged = new Map<string, number>();

  for (const line of lines) {
    // Defence in depth: the schema already rejects these, but `priceCart` is
    // also called with cookie-sourced data and must not trust its caller.
    if (!line || typeof line.sku !== 'string') continue;
    if (!Number.isInteger(line.qty) || line.qty < 1) continue;

    const current = merged.get(line.sku) ?? 0;
    merged.set(line.sku, Math.min(current + line.qty, MAX_QTY_PER_LINE));
  }

  const normalised = [...merged.entries()].map(([sku, qty]) => ({ sku, qty }));

  if (normalised.length > MAX_CART_LINES) {
    notices.push(`Tu carrito supera el máximo de ${MAX_CART_LINES} productos distintos.`);
    normalised.length = MAX_CART_LINES;
  }

  return { normalised, notices };
}

/**
 * Price a cart. The only function allowed to produce a monetary total.
 */
export function priceCart(
  lines: readonly CartLineInput[],
  options: PriceCartOptions = {},
): PricedCart {
  const repo = catalog();
  const { normalised, notices } = normaliseLines(lines);

  const priced: PricedCartLine[] = [];
  const familySubtotals = new Map<string, Centavos>();

  for (const input of normalised) {
    const resolved = repo.resolveSku(input.sku);

    if (!resolved) {
      // A SKU we do not sell. Drop it and say so; never price an unknown item.
      notices.push('Quitamos un producto que ya no está disponible.');
      continue;
    }

    const { product, variant } = resolved;

    // Availability is catalogue stock minus units already reserved by pending
    // orders, so a cart can never be priced against stock someone else holds.
    const stock = availableStock(variant.sku);

    if (stock <= 0) {
      notices.push(`${product.name} se quedó sin stock y lo quitamos del carrito.`);
      continue;
    }

    const qty = Math.min(input.qty, stock, MAX_QTY_PER_LINE);
    const adjusted = qty !== input.qty;
    if (adjusted) {
      notices.push(
        `Ajustamos ${product.name} a ${qty} ${qty === 1 ? 'unidad' : 'unidades'} por stock disponible.`,
      );
    }

    const color = product.colors.find((candidate) => candidate.id === variant.colorId);
    // Price comes from the catalogue. Always. This is the line that matters.
    const unitPrice = variant.priceList;
    const lineTotal = multiply(unitPrice, qty);

    priced.push({
      sku: variant.sku,
      qty,
      productSlug: product.slug,
      productName: product.name,
      variantLabel: variantLabel(variant.storage, variant.size),
      colorName: color?.name ?? '',
      colorHex: color?.hex ?? '#888888',
      render: product.render,
      unitPrice,
      lineTotal,
      stock,
      adjusted,
    });

    familySubtotals.set(product.family, add(familySubtotals.get(product.family) ?? 0, lineTotal));
  }

  if (priced.length === 0) {
    return { lines: [], totals: EMPTY_TOTALS, itemCount: 0, notices, promo: null };
  }

  const subtotal = add(...priced.map((line) => line.lineTotal));

  const eligibleSubtotal = (family: string | null): Centavos =>
    family === null ? subtotal : (familySubtotals.get(family) ?? 0);

  const { promo, discount: promoDiscount, notice } = resolvePromo(
    options.promoCode,
    subtotal,
    eligibleSubtotal,
  );
  if (notice) notices.push(notice);

  const netSubtotal = subtract(subtotal, promoDiscount);

  const { shipping, freeShippingApplied } = quoteShipping(options.zone, netSubtotal);

  const transferSubtotal = applyDiscount(netSubtotal, site.commerce.transferDiscountPercent);
  const transferDiscount = subtract(netSubtotal, transferSubtotal);

  const cardTotal = add(netSubtotal, shipping);
  const transferTotal = add(transferSubtotal, shipping);

  const instalmentCount = site.commerce.interestFreeInstalments;
  const instalmentAmounts = splitInstalments(cardTotal, instalmentCount);

  const totals: CartTotals = {
    subtotal,
    promoDiscount,
    netSubtotal,
    transferDiscount,
    shipping,
    freeShippingApplied,
    cardTotal,
    transferTotal,
    total: options.paymentMethod === 'transfer' ? transferTotal : cardTotal,
    instalments: {
      count: instalmentCount,
      // The largest instalment, so the figure we advertise is never lower than
      // what any single instalment will actually be.
      amount: Math.max(...instalmentAmounts),
    },
  };

  return {
    lines: priced,
    totals,
    itemCount: priced.reduce((sum, line) => sum + line.qty, 0),
    notices,
    promo,
  };
}

/** Per-product "desde" pricing for cards, including the transfer price. */
export function productPricing(product: Product): {
  from: Centavos;
  fromTransfer: Centavos;
  instalment: Centavos;
  instalmentCount: number;
} {
  let from = product.variants[0]?.priceList ?? 0;
  for (const variant of product.variants) {
    if (variant.priceList < from) from = variant.priceList;
  }
  const count = site.commerce.interestFreeInstalments;
  return {
    from,
    fromTransfer: applyDiscount(from, site.commerce.transferDiscountPercent),
    instalment: Math.max(...splitInstalments(from, count)),
    instalmentCount: count,
  };
}

/** Variant-level pricing for the PDP configurator. */
export function variantPricing(priceList: Centavos): {
  list: Centavos;
  transfer: Centavos;
  instalment: Centavos;
  instalmentCount: number;
} {
  const count = site.commerce.interestFreeInstalments;
  return {
    list: priceList,
    transfer: applyDiscount(priceList, site.commerce.transferDiscountPercent),
    instalment: Math.max(...splitInstalments(priceList, count)),
    instalmentCount: count,
  };
}
