import { describe, expect, it } from 'vitest';
import { MAX_QTY_PER_LINE, MAX_SEARCH_QUERY_LENGTH } from '@/config/constants';
import {
  CartAddSchema,
  CartUpdateSchema,
  CatalogQuerySchema,
  CheckoutSchema,
  ContactSchema,
  CustomerSchema,
  LoginSchema,
  OrderReferenceSchema,
  PasswordSchema,
  PersonNameSchema,
  PhoneSchema,
  PostalCodeSchema,
  PromoCodeSchema,
  SearchQuerySchema,
  ShippingSchema,
  SignupSchema,
  SkuSchema,
  toFieldErrors,
} from '@/lib/validation/schemas';

/**
 * The input boundary. The single most important assertion in this file is that
 * every schema is CLOSED — an unexpected key is a rejection, not an ignored field.
 * That is what turns price manipulation from "silently ignored" into "400 and an
 * alert".
 */
describe('cart schemas — the price-manipulation boundary', () => {
  it('rejects a body carrying a price', () => {
    const result = CartAddSchema.safeParse({ sku: 'OWN-IPHONE17-BLK-256GB', qty: 1, price: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects every other money-shaped field an attacker might try', () => {
    for (const extra of [
      { price: 1 },
      { unitPrice: 1 },
      { lineTotal: 1 },
      { total: 1 },
      { discount: 99 },
      { priceList: 1 },
      { stock: 9999 },
      { subtotal: 1 },
      { currency: 'USD' },
    ]) {
      const result = CartAddSchema.safeParse({ sku: 'OWN-IPHONE17-BLK-256GB', qty: 1, ...extra });
      expect(result.success, `should reject ${JSON.stringify(extra)}`).toBe(false);
    }
  });

  it('accepts exactly a sku and a qty', () => {
    const result = CartAddSchema.safeParse({ sku: 'OWN-IPHONE17-BLK-256GB', qty: 2 });
    expect(result.success).toBe(true);
    if (result.success) expect(Object.keys(result.data).sort()).toEqual(['qty', 'sku']);
  });

  it('bounds quantity: integer, at least 1, at most the per-line cap', () => {
    const sku = 'OWN-IPHONE17-BLK-256GB';
    for (const qty of [0, -1, 1.5, MAX_QTY_PER_LINE + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(CartAddSchema.safeParse({ sku, qty }).success, `qty=${qty}`).toBe(false);
    }
    expect(CartAddSchema.safeParse({ sku, qty: MAX_QTY_PER_LINE }).success).toBe(true);
  });

  it('allows qty 0 on update (it removes the line) but never negative', () => {
    const sku = 'OWN-IPHONE17-BLK-256GB';
    expect(CartUpdateSchema.safeParse({ sku, qty: 0 }).success).toBe(true);
    expect(CartUpdateSchema.safeParse({ sku, qty: -1 }).success).toBe(false);
  });

  it('rejects a malformed SKU', () => {
    for (const sku of [
      '',
      'iphone',
      'OWN',
      '../../etc/passwd',
      'OWN-<script>',
      "OWN-' OR 1=1--",
      'OWN-IPHONE17;DROP TABLE',
      `OWN-${'A'.repeat(200)}`,
    ]) {
      expect(SkuSchema.safeParse(sku).success, sku).toBe(false);
    }
    expect(SkuSchema.safeParse('OWN-IPHONE17PROMAX-NAT-2TB').success).toBe(true);
  });
});

describe('free text — no angle brackets anywhere', () => {
  it('rejects markup in a person name', () => {
    for (const name of [
      '<script>alert(1)</script>',
      'Juan <b>Pérez</b>',
      'Juan"onload="x',
      '{{7*7}}',
      'Juan\u0000Pérez',
    ]) {
      expect(PersonNameSchema.safeParse(name).success, name).toBe(false);
    }
  });

  it('accepts real Argentine names, accents and all', () => {
    for (const name of ['Martín Gómez', "O'Brien", 'María José Ñandú', 'Jean-Luc Picard']) {
      expect(PersonNameSchema.safeParse(name).success, name).toBe(true);
    }
  });

  it('rejects angle brackets in an address and a message', () => {
    const base = {
      zone: 'caba' as const,
      city: 'CABA',
      province: 'Buenos Aires',
      postalCode: '1425',
    };
    expect(
      ShippingSchema.safeParse({ ...base, street: 'Calle <img src=x onerror=1> 123' }).success,
    ).toBe(false);
    expect(
      ContactSchema.safeParse({
        name: 'Ana López',
        email: 'ana@example.com',
        message: 'Hola <script>alert(1)</script> quiero consultar algo',
      }).success,
    ).toBe(false);
  });
});

describe('phone and postal code normalisation', () => {
  it('normalises how people actually type a phone number', () => {
    for (const input of ['+54 11 4567-8900', '(011) 4567 8900', '11-4567-8900']) {
      const result = PhoneSchema.safeParse(input);
      expect(result.success, input).toBe(true);
      if (result.success) expect(/^\d+$/.test(result.data)).toBe(true);
    }
  });

  it('rejects a phone that is not digits once normalised', () => {
    for (const input of ['abcdefgh', '11-456', '+54 11 4567-8900x1234567890']) {
      expect(PhoneSchema.safeParse(input).success, input).toBe(false);
    }
  });

  it('accepts both CPA and legacy postal codes', () => {
    expect(PostalCodeSchema.safeParse('1425').success).toBe(true);
    expect(PostalCodeSchema.safeParse('c1425dke').success).toBe(true);
    expect(PostalCodeSchema.safeParse('142').success).toBe(false);
    expect(PostalCodeSchema.safeParse('ABCDE').success).toBe(false);
  });
});

describe('shipping — conditional requirements', () => {
  it('requires a full address for a delivery', () => {
    const result = ShippingSchema.safeParse({ zone: 'caba' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = toFieldErrors(result.error);
      expect(Object.keys(fields).sort()).toEqual(['city', 'postalCode', 'province', 'street']);
    }
  });

  it('requires NO address for a showroom pickup', () => {
    expect(ShippingSchema.safeParse({ zone: 'pickup' }).success).toBe(true);
  });

  it('rejects an unknown zone', () => {
    expect(ShippingSchema.safeParse({ zone: 'teleport' }).success).toBe(false);
  });
});

describe('checkout schema — no amount may be expressed', () => {
  const valid = {
    customer: { name: 'Ana López', email: 'ana@example.com', phone: '1145678900' },
    shipping: { zone: 'pickup' as const },
    paymentMethod: 'transfer' as const,
    acceptedTerms: true as const,
  };

  it('accepts a minimal valid checkout', () => {
    expect(CheckoutSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects any attempt to send a total, a price or card data', () => {
    for (const extra of [
      { total: 1 },
      { amount: 1 },
      { subtotal: 1 },
      { shippingCost: 0 },
      { discount: 100 },
      { cardNumber: '4111111111111111' },
      { cvv: '123' },
      { lines: [{ sku: 'OWN-X', qty: 1, price: 1 }] },
    ]) {
      expect(CheckoutSchema.safeParse({ ...valid, ...extra }).success, JSON.stringify(extra)).toBe(
        false,
      );
    }
  });

  it('requires explicit terms acceptance', () => {
    expect(CheckoutSchema.safeParse({ ...valid, acceptedTerms: false }).success).toBe(false);
    expect(CheckoutSchema.safeParse({ ...valid, acceptedTerms: 'true' }).success).toBe(false);
  });

  it('accepts a promo code but not a promo percentage', () => {
    expect(CheckoutSchema.safeParse({ ...valid, promoCode: 'OWNER5' }).success).toBe(true);
    expect(CheckoutSchema.safeParse({ ...valid, promoPercent: 90 }).success).toBe(false);
  });
});

describe('search and catalogue queries', () => {
  it('caps the search query length', () => {
    expect(SearchQuerySchema.safeParse({ q: 'a'.repeat(MAX_SEARCH_QUERY_LENGTH) }).success).toBe(true);
    expect(
      SearchQuerySchema.safeParse({ q: 'a'.repeat(MAX_SEARCH_QUERY_LENGTH + 1) }).success,
    ).toBe(false);
  });

  it('rejects unknown query parameters rather than ignoring them', () => {
    expect(CatalogQuerySchema.safeParse({ family: 'iphone', evil: '1' }).success).toBe(false);
  });

  it('rejects an inverted price range', () => {
    expect(CatalogQuerySchema.safeParse({ minPrice: '500', maxPrice: '100' }).success).toBe(false);
  });

  it('coerces numeric query strings and bounds the page size', () => {
    const result = CatalogQuerySchema.safeParse({ page: '2', pageSize: '12' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.page).toBe(2);
    expect(CatalogQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
    expect(CatalogQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

describe('auth schemas', () => {
  it('enforces a length-based password policy at signup', () => {
    expect(PasswordSchema.safeParse('short').success).toBe(false);
    expect(PasswordSchema.safeParse('password123').success).toBe(false);
    expect(PasswordSchema.safeParse('contrasena1').success).toBe(false);
    expect(PasswordSchema.safeParse('ownerstore2026').success).toBe(false);
    expect(PasswordSchema.safeParse('el perro corre rapido').success).toBe(true);
  });

  it('does NOT enforce the policy at login', () => {
    // Rejecting a short password at login would leak that the stored one is longer.
    expect(LoginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });

  it('rejects a role or an id supplied at signup', () => {
    const base = { name: 'Ana López', email: 'ana@example.com', password: 'el perro corre rapido' };
    expect(SignupSchema.safeParse(base).success).toBe(true);
    expect(SignupSchema.safeParse({ ...base, role: 'admin' }).success).toBe(false);
    expect(SignupSchema.safeParse({ ...base, id: '1' }).success).toBe(false);
    expect(SignupSchema.safeParse({ ...base, isAdmin: true }).success).toBe(false);
  });

  it('normalises an email to lowercase', () => {
    const result = CustomerSchema.safeParse({
      name: 'Ana López',
      email: '  ANA@Example.COM ',
      phone: '1145678900',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('ana@example.com');
  });
});

describe('order references and promo codes', () => {
  it('accepts only the exact reference format', () => {
    expect(OrderReferenceSchema.safeParse('OWN-7KD3M9QX2V').success).toBe(true);
    for (const bad of ['123', 'OWN-123', 'own-7kd3m9qx2v!', 'OWN-7KD3M9QX2', '../OWN-7KD3M9QX2V']) {
      expect(OrderReferenceSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('uppercases and restricts promo codes to alphanumerics', () => {
    const result = PromoCodeSchema.safeParse(' owner5 ');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('OWNER5');
    expect(PromoCodeSchema.safeParse("OWNER5' OR 1=1").success).toBe(false);
  });
});

describe('error shaping', () => {
  it('returns flat, human, per-field messages and leaks no schema internals', () => {
    const result = CheckoutSchema.safeParse({
      customer: { name: 'A', email: 'nope', phone: '1' },
      shipping: { zone: 'caba' },
      paymentMethod: 'bitcoin',
      acceptedTerms: false,
    });
    expect(result.success).toBe(false);
    if (result.success) return;

    const fields = toFieldErrors(result.error);
    for (const [key, message] of Object.entries(fields)) {
      expect(typeof message).toBe('string');
      // No Zod internals, no union branch descriptions, no code names.
      expect(message).not.toMatch(/zod|invalid_(union|type)|ZodError/i);
      expect(key).not.toContain('_def');
    }
  });

  it('rejects a honeypot that has been filled in', () => {
    const base = {
      name: 'Ana López',
      email: 'ana@example.com',
      message: 'Quiero consultar por un iPhone',
    };
    expect(ContactSchema.safeParse(base).success).toBe(true);
    expect(ContactSchema.safeParse({ ...base, _hp: 'bot was here' }).success).toBe(false);
  });
});
