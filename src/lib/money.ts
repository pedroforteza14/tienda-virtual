/**
 * Money is an integer number of **centavos ARS**. Never a float, never a string,
 * never a `number` that holds pesos.
 *
 * Why: `0.1 + 0.2 !== 0.3`. In a pricing path that compounds — unit price ×
 * quantity, minus a percentage discount, plus shipping — binary floating point
 * drift is not theoretical. A few centavos of drift between what the client
 * renders and what the server charges is a support ticket; a few centavos of
 * drift between the order total and the amount the PSP captured is a webhook
 * amount-mismatch that blocks a legitimate order.
 *
 * So: integers everywhere, rounding happens exactly once per operation, and it
 * is always explicit. See docs/threat-model.md §4.1.
 */

/** An integer count of centavos. 1 ARS = 100 centavos. */
export type Centavos = number;

export const CURRENCY = 'ARS' as const;

/** Largest total we will ever construct. Guards against overflow-ish nonsense
 *  reaching a PSP: 1 000 000 000 centavos = ARS 10.000.000. */
export const MAX_CENTAVOS = 1_000_000_000;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Assert a value really is usable money. Called at every boundary. */
export function assertCentavos(value: unknown, label = 'amount'): Centavos {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new MoneyError(`${label} must be an integer number of centavos`);
  }
  if (value < 0) throw new MoneyError(`${label} must not be negative`);
  if (value > MAX_CENTAVOS) throw new MoneyError(`${label} exceeds the maximum allowed amount`);
  return value;
}

/** Pesos → centavos. For authoring catalogue data only, never for input. */
export function pesos(amount: number): Centavos {
  if (!Number.isFinite(amount)) throw new MoneyError('amount must be finite');
  return assertCentavos(Math.round(amount * 100));
}

export function add(...amounts: Centavos[]): Centavos {
  return assertCentavos(amounts.reduce((total, n) => total + assertCentavos(n), 0), 'sum');
}

export function subtract(a: Centavos, b: Centavos): Centavos {
  return assertCentavos(assertCentavos(a) - assertCentavos(b), 'difference');
}

/**
 * Multiply money by a non-negative integer count.
 * Deliberately refuses a fractional factor: quantities are integers, and a
 * fractional multiplier here would be a bug trying to look like a feature.
 */
export function multiply(amount: Centavos, count: number): Centavos {
  if (!Number.isInteger(count) || count < 0) {
    throw new MoneyError('count must be a non-negative integer');
  }
  return assertCentavos(assertCentavos(amount) * count, 'product');
}

/**
 * Apply a percentage, rounding half-up to the nearest centavo.
 *
 * Rounds the *result* once rather than accumulating per-unit rounding error,
 * and uses `Math.round` on a value already in centavos so the rounding step is
 * visible in one place.
 */
export function percentOf(amount: Centavos, percent: number): Centavos {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new MoneyError('percent must be between 0 and 100');
  }
  return assertCentavos(Math.round((assertCentavos(amount) * percent) / 100), 'percentage');
}

/** Discounted amount, floored at zero so a bad discount can never produce a
 *  negative total (which some PSPs will happily accept as a refund). */
export function applyDiscount(amount: Centavos, percent: number): Centavos {
  return Math.max(0, subtract(amount, percentOf(amount, percent)));
}

/**
 * Split an amount into `n` instalments that sum back **exactly** to the amount.
 * The remainder centavos are distributed over the first instalments, which is
 * how Argentine issuers actually present cuotas.
 */
export function splitInstalments(amount: Centavos, count: number): Centavos[] {
  if (!Number.isInteger(count) || count < 1 || count > 24) {
    throw new MoneyError('instalment count must be an integer between 1 and 24');
  }
  assertCentavos(amount);
  const base = Math.floor(amount / count);
  const remainder = amount - base * count;
  return Array.from({ length: count }, (_, i) => (i < remainder ? base + 1 : base));
}

const AR_FORMAT = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: CURRENCY,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const AR_FORMAT_EXACT = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Display format. Argentine retail quotes hardware in whole pesos, so centavos
 * are hidden by default — but `exact` exists for the checkout review step and
 * the order record, where hiding them would be dishonest.
 *
 * ` ` (nbsp) between symbol and digits so a price never wraps mid-figure.
 */
export function formatARS(amount: Centavos, options?: { exact?: boolean }): string {
  assertCentavos(amount);
  const formatter = options?.exact ? AR_FORMAT_EXACT : AR_FORMAT;
  return formatter.format(amount / 100).replace(/\s/g, ' ');
}

/** Screen-reader expansion: "1.299.000 pesos argentinos" rather than digit soup. */
export function describeARS(amount: Centavos): string {
  assertCentavos(amount);
  const whole = Math.round(amount / 100);
  return `${new Intl.NumberFormat('es-AR').format(whole)} pesos argentinos`;
}
