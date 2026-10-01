import { describe, expect, it } from 'vitest';
import {
  MAX_CENTAVOS,
  MoneyError,
  add,
  applyDiscount,
  assertCentavos,
  describeARS,
  formatARS,
  multiply,
  percentOf,
  pesos,
  splitInstalments,
  subtract,
} from '@/lib/money';

/**
 * Money is the foundation every other price assertion rests on, so these tests
 * are about the *properties* rather than a handful of examples: integers only,
 * no float drift, rounding in exactly one place, and splits that sum back exactly.
 */
describe('money', () => {
  it('rejects anything that is not an integer count of centavos', () => {
    expect(() => assertCentavos(1.5)).toThrow(MoneyError);
    expect(() => assertCentavos('100' as unknown)).toThrow(MoneyError);
    expect(() => assertCentavos(Number.NaN)).toThrow(MoneyError);
    expect(() => assertCentavos(-1)).toThrow(MoneyError);
    expect(() => assertCentavos(MAX_CENTAVOS + 1)).toThrow(MoneyError);
    expect(assertCentavos(0)).toBe(0);
  });

  it('converts pesos to centavos with a single rounding step', () => {
    expect(pesos(1)).toBe(100);
    expect(pesos(1_299_000)).toBe(129_900_000);
    // 19.99 * 100 is 1998.9999999999998 in binary floating point.
    expect(pesos(19.99)).toBe(1999);
  });

  it('never exhibits float drift across a compounded calculation', () => {
    // The classic: 0.1 + 0.2 !== 0.3. In centavos it simply cannot happen.
    const a = pesos(0.1);
    const b = pesos(0.2);
    expect(add(a, b)).toBe(pesos(0.3));

    // A realistic cart: three lines, a percentage discount, then shipping.
    const lines = [multiply(pesos(2_950_000), 1), multiply(pesos(659_000), 2), pesos(129_000)];
    const subtotal = add(...lines);
    const discounted = applyDiscount(subtotal, 12);
    const total = add(discounted, pesos(12_000));
    expect(Number.isInteger(total)).toBe(true);
    expect(total).toBe(add(applyDiscount(subtotal, 12), pesos(12_000)));
  });

  it('refuses a fractional quantity instead of silently truncating it', () => {
    expect(() => multiply(pesos(100), 1.5)).toThrow(MoneyError);
    expect(() => multiply(pesos(100), -1)).toThrow(MoneyError);
    expect(multiply(pesos(100), 0)).toBe(0);
  });

  it('bounds percentages', () => {
    expect(() => percentOf(1000, 101)).toThrow(MoneyError);
    expect(() => percentOf(1000, -1)).toThrow(MoneyError);
    expect(percentOf(1000, 12)).toBe(120);
    // Rounds half-up on the result, once.
    expect(percentOf(1005, 50)).toBe(503);
  });

  it('floors a discount at zero so a total can never go negative', () => {
    expect(applyDiscount(1000, 100)).toBe(0);
    expect(subtract(1000, 1000)).toBe(0);
    // A negative total would be a refund at some PSPs; it must be impossible.
    expect(() => subtract(100, 200)).toThrow(MoneyError);
  });

  it('splits instalments so they sum back to the exact total', () => {
    for (const amount of [100, 999, 129_900_001, 7, 123_457]) {
      for (const count of [1, 3, 6, 12, 18, 24]) {
        const parts = splitInstalments(amount, count);
        expect(parts).toHaveLength(count);
        expect(parts.reduce((sum, part) => sum + part, 0)).toBe(amount);
        // The spread between the largest and smallest instalment is at most one
        // centavo, which is how issuers actually present cuotas.
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('rejects an out-of-range instalment count', () => {
    expect(() => splitInstalments(1000, 0)).toThrow(MoneyError);
    expect(() => splitInstalments(1000, 25)).toThrow(MoneyError);
    expect(() => splitInstalments(1000, 1.5)).toThrow(MoneyError);
  });

  it('formats as Argentine pesos without breaking across a line', () => {
    const formatted = formatARS(pesos(1_299_000));
    expect(formatted).toContain('1.299.000');
    // No ordinary space anywhere: a price must never wrap mid-figure.
    expect(/ /.test(formatted)).toBe(false);
    expect(formatARS(pesos(1_299_000.55), { exact: true })).toContain(',55');
  });

  it('describes an amount in words for screen readers', () => {
    expect(describeARS(pesos(1_299_000))).toBe('1.299.000 pesos argentinos');
  });
});
