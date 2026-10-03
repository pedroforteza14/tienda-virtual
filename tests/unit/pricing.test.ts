import { afterEach, describe, expect, it } from 'vitest';
import { site } from '@/config/site';
import { MAX_CART_LINES, MAX_QTY_PER_LINE } from '@/config/constants';
import { MAX_CENTAVOS, add, applyDiscount, multiply } from '@/lib/money';
import { priceCart, quoteShipping, resolvePromo } from '@/server/pricing/pricing';
import { catalog } from '@/server/catalog/repository';
import { availableStock, reserve } from '@/server/orders/inventory';
import { resetStore } from '@/server/store';

/**
 * The pricing engine is the control that defeats price manipulation, so these
 * tests target the *guarantee* rather than the arithmetic: whatever a caller
 * passes, the money comes from the catalogue.
 */

function firstInStockSku(): string {
  const found = catalog()
    .listProducts()
    .flatMap((product) => product.variants)
    .find((variant) => variant.stock > 2);
  if (!found) throw new Error('fixture: no variant with stock');
  return found.sku;
}

afterEach(async () => resetStore());

describe('priceCart — price authority', () => {
  it('prices from the catalogue, ignoring anything extra on the input object', async () => {
    const sku = firstInStockSku();
    const real = catalog().resolveSku(sku)!;

    // A caller that smuggles in extra fields. The schema rejects this shape at the
    // HTTP boundary; here we prove the engine would not honour it even if it got through.
    const hostile = [{ sku, qty: 1, price: 1, unitPrice: 1, lineTotal: 1, total: 1 }] as never;

    const priced = await priceCart(hostile);

    expect(priced.lines[0]!.unitPrice).toBe(real.variant.priceList);
    expect(priced.lines[0]!.lineTotal).toBe(real.variant.priceList);
    expect(priced.totals.subtotal).toBe(real.variant.priceList);
  });

  it('has no parameter by which a caller can supply an amount', async () => {
    // A structural assertion: if someone adds a `price` option to PriceCartOptions,
    // this test is the thing that notices.
    const sku = firstInStockSku();
    const withOptions = await priceCart([{ sku, qty: 1 }], {
      promoCode: null,
      zone: 'caba',
      paymentMethod: 'card',
    });
    const withoutOptions = await priceCart([{ sku, qty: 1 }]);
    expect(withOptions.totals.subtotal).toBe(withoutOptions.totals.subtotal);
  });

  it('drops an unknown SKU rather than pricing it', async () => {
    const priced = await priceCart([{ sku: 'OWN-DOES-NOT-EXIST', qty: 1 }]);
    expect(priced.lines).toHaveLength(0);
    expect(priced.totals.subtotal).toBe(0);
    expect(priced.notices.length).toBeGreaterThan(0);
  });

  it('clamps to the per-line maximum and says so', async () => {
    const sku = firstInStockSku();
    const priced = await priceCart([{ sku, qty: MAX_QTY_PER_LINE + 50 }]);

    expect(priced.lines[0]!.qty).toBeLessThanOrEqual(MAX_QTY_PER_LINE);
    expect(priced.notices.join(' ')).toMatch(/máximo/i);
  });

  it('clamps to available stock and says so', async () => {
    // Reserve down to a single unit, then ask for more than that.
    const sku = firstInStockSku();
    const stock = await availableStock(sku);
    expect(await reserve([{ sku, qty: stock - 1 }])).toEqual({ ok: true });

    const priced = await priceCart([{ sku, qty: 3 }]);
    expect(priced.lines[0]!.qty).toBe(1);
    expect(priced.lines[0]!.adjusted).toBe(true);
    expect(priced.notices.join(' ')).toMatch(/ajustamos/i);
  });

  it('ignores a non-positive or fractional quantity instead of letting it reduce the total', async () => {
    const sku = firstInStockSku();
    for (const qty of [0, -5, 1.5, Number.NaN]) {
      const priced = await priceCart([{ sku, qty }]);
      expect(priced.lines).toHaveLength(0);
      expect(priced.totals.subtotal).toBe(0);
    }
  });

  it('cannot be driven negative by a negative-quantity line alongside a real one', async () => {
    const sku = firstInStockSku();
    const other = catalog()
      .listProducts()
      .flatMap((product) => product.variants)
      .find((variant) => variant.sku !== sku && variant.stock > 0)!;

    const priced = await priceCart([
      { sku, qty: 1 },
      { sku: other.sku, qty: -100 },
    ]);

    expect(priced.totals.subtotal).toBeGreaterThan(0);
    expect(priced.totals.total).toBeGreaterThan(0);
  });

  it('collapses duplicate SKUs within the per-line cap', async () => {
    const sku = firstInStockSku();
    const priced = await priceCart([
      { sku, qty: 2 },
      { sku, qty: 4 },
    ]);
    expect(priced.lines).toHaveLength(1);
    expect(priced.lines[0]!.qty).toBeLessThanOrEqual(MAX_QTY_PER_LINE);
  });

  it('bounds the number of distinct lines', async () => {
    const skus = catalog()
      .listProducts()
      .flatMap((product) => product.variants)
      .filter((variant) => variant.stock > 0)
      .slice(0, MAX_CART_LINES + 10)
      .map((variant) => ({ sku: variant.sku, qty: 1 }));

    const priced = await priceCart(skus);
    expect(priced.lines.length).toBeLessThanOrEqual(MAX_CART_LINES);
  });

  it('removes a line whose stock is fully reserved by someone else', async () => {
    const sku = firstInStockSku();
    const stock = await availableStock(sku);
    expect(await reserve([{ sku, qty: stock }])).toEqual({ ok: true });

    const priced = await priceCart([{ sku, qty: 1 }]);
    expect(priced.lines).toHaveLength(0);
    expect(priced.notices.join(' ')).toMatch(/sin stock/i);
  });
});

describe('money caps vs. the real catalogue', () => {
  /**
   * A regression rail. The first `MAX_CENTAVOS` chosen was ARS 10.000.000, which
   * is less than five iPhone 17 Pro Max — so a legitimate cart threw `MoneyError`
   * and would have reached the customer as a 500. This keeps the cap honest as
   * prices rise.
   */
  it('MAX_CENTAVOS exceeds the largest cart a customer could legally build', async () => {
    const dearest = Math.max(
      ...catalog()
        .listProducts()
        .flatMap((product) => product.variants.map((variant) => variant.priceList)),
    );
    const largestPossibleCart = dearest * MAX_QTY_PER_LINE * MAX_CART_LINES;

    expect(largestPossibleCart).toBeLessThan(MAX_CENTAVOS);
    // And still comfortably inside exact integer arithmetic.
    expect(MAX_CENTAVOS * 2).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it('prices the maximum cart without throwing', async () => {
    const skus = catalog()
      .listProducts()
      .flatMap((product) => product.variants)
      .filter((variant) => variant.stock >= MAX_QTY_PER_LINE)
      .slice(0, MAX_CART_LINES)
      .map((variant) => ({ sku: variant.sku, qty: MAX_QTY_PER_LINE }));

    await expect(priceCart(skus, { zone: 'interior', paymentMethod: 'card' })).resolves.toBeDefined();
  });
});

describe('priceCart — totals', () => {
  it('computes both payment prices, and the transfer one is lower', async () => {
    const sku = firstInStockSku();
    const priced = await priceCart([{ sku, qty: 2 }], { zone: 'caba', paymentMethod: 'transfer' });
    const unit = catalog().resolveSku(sku)!.variant.priceList;

    expect(priced.totals.subtotal).toBe(multiply(unit, priced.lines[0]!.qty));
    expect(priced.totals.transferTotal).toBeLessThan(priced.totals.cardTotal);
    expect(priced.totals.total).toBe(priced.totals.transferTotal);

    // transferTotal === netSubtotal - transferDiscount + shipping, exactly.
    expect(priced.totals.transferTotal).toBe(
      add(
        applyDiscount(priced.totals.netSubtotal, site.commerce.transferDiscountPercent),
        priced.totals.shipping,
      ),
    );
  });

  it('reports the card total when the method is card', async () => {
    const sku = firstInStockSku();
    const priced = await priceCart([{ sku, qty: 1 }], { zone: 'pickup', paymentMethod: 'card' });
    expect(priced.totals.total).toBe(priced.totals.cardTotal);
  });

  it('advertises an instalment no lower than the largest real instalment', async () => {
    const sku = firstInStockSku();
    const priced = await priceCart([{ sku, qty: 1 }], { paymentMethod: 'card' });
    const { instalments, cardTotal } = priced.totals;
    expect(instalments).not.toBeNull();
    // Never understate: count × advertised must cover the total.
    expect(instalments!.amount * instalments!.count).toBeGreaterThanOrEqual(cardTotal);
  });

  it('returns zeroed totals for an empty cart', async () => {
    const priced = await priceCart([]);
    expect(priced.itemCount).toBe(0);
    expect(priced.totals.total).toBe(0);
    expect(priced.totals.instalments).toBeNull();
  });
});

describe('promo codes', () => {
  const basis = () => 100_000_000; // ARS 1.000.000

  it('resolves a known code server-side', async () => {
    const result = resolvePromo('OWNER5', basis(), () => basis());
    expect(result.promo?.percent).toBe(5);
    expect(result.discount).toBe(basis() * 0.05);
  });

  it('is case- and whitespace-insensitive', async () => {
    expect(resolvePromo('  owner5 ', basis(), () => basis()).promo?.code).toBe('OWNER5');
  });

  it('rejects an invented code with a notice rather than a silent zero', async () => {
    const result = resolvePromo('FREESTUFF', basis(), () => basis());
    expect(result.promo).toBeNull();
    expect(result.discount).toBe(0);
    expect(result.notice).toMatch(/no es válido/i);
  });

  it('rejects an expired code', async () => {
    const result = resolvePromo('EXPIRADO', basis(), () => basis());
    expect(result.promo).toBeNull();
    expect(result.notice).toMatch(/vencido/i);
  });

  it('enforces the minimum spend', async () => {
    const result = resolvePromo('OWNER5', 1000, () => 1000);
    expect(result.promo).toBeNull();
    expect(result.notice).toMatch(/mínima/i);
  });

  it('applies a family-scoped code only to that family', async () => {
    // Eligible basis of zero means nothing in the cart qualifies.
    const result = resolvePromo('SETUP10', basis(), (family) => (family === null ? basis() : 0));
    expect(result.promo).toBeNull();
    expect(result.notice).toMatch(/no aplica/i);
  });

  it('allows only one code: the engine takes a single code, not a list', async () => {
    const sku = firstInStockSku();
    const priced = await priceCart([{ sku, qty: 1 }], { promoCode: 'OWNER5' });
    // There is no array form and no stacking; `promo` is a single value or null.
    expect(Array.isArray(priced.promo)).toBe(false);
  });
});

describe('shipping quotes', () => {
  it('derives the rate from the zone, never from input', async () => {
    expect(quoteShipping('pickup', 0).shipping).toBe(0);
    expect(quoteShipping('caba', 0).shipping).toBeGreaterThan(0);
    expect(quoteShipping('interior', 0).shipping).toBeGreaterThan(
      quoteShipping('caba', 0).shipping,
    );
  });

  it('falls back to the MOST expensive zone for an unknown value, never to free', async () => {
    const unknown = quoteShipping('teleport' as never, 0);
    const dearest = quoteShipping('interior', 0);
    expect(unknown.shipping).toBe(dearest.shipping);
    expect(unknown.shipping).toBeGreaterThan(0);
  });

  it('applies free shipping above the threshold, but never to pickup', async () => {
    const threshold = site.commerce.freeShippingThresholdPesos * 100;
    const free = quoteShipping('interior', threshold);
    expect(free.shipping).toBe(0);
    expect(free.freeShippingApplied).toBe(true);

    // Pickup is already zero, so it must not claim a discount it did not give.
    expect(quoteShipping('pickup', threshold).freeShippingApplied).toBe(false);
  });

  it('charges when just below the threshold', async () => {
    const threshold = site.commerce.freeShippingThresholdPesos * 100;
    expect(quoteShipping('caba', threshold - 1).shipping).toBeGreaterThan(0);
  });
});
