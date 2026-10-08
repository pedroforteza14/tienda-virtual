import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Copy rules that are cheap to break and expensive to notice.
 *
 * A UX-writing pass found two defects no type or lint check can see, and both
 * are the kind that reappear the next time someone adds a message in a hurry.
 */

const errorModule = readFileSync(
  new URL('../../src/lib/http/responses.ts', import.meta.url),
  'utf8',
);

describe('API error copy', () => {
  /**
   * In this storefront a *pedido* is an ORDER — the route is
   * `/pedido/[reference]`, the account page lists "Tus pedidos". Three error
   * messages used the word in its other sense, an HTTP request, so a shopper
   * who tripped a validation error at checkout read "No pudimos procesar el
   * pedido" and reasonably concluded the purchase had failed. Use "solicitud",
   * or say what actually happened.
   */
  it('never calls an HTTP request a "pedido", which here means an order', () => {
    const table = errorModule.slice(
      errorModule.indexOf('const DEFAULT_MESSAGE'),
      errorModule.indexOf('};', errorModule.indexOf('const DEFAULT_MESSAGE')),
    );
    const offenders = table
      .split('\n')
      .filter((line) => /^\s+\w+:/.test(line) && /pedido/i.test(line));

    expect(offenders, offenders.join('\n')).toHaveLength(0);
  });

  it('addresses the reader as vos, consistently', () => {
    // The storefront is Argentine. A single "tú" form reads as a different
    // product, and these strings sit beside each other in the same toast.
    const tuteo = /\b(revisa|espera|vuelve|necesitas|tienes|intenta|prueba)\b/i;
    const table = errorModule.slice(errorModule.indexOf('const DEFAULT_MESSAGE'));
    const offenders = table
      .split('\n')
      .filter((line) => /^\s+\w+:\s*'/.test(line) && tuteo.test(line));

    expect(offenders, offenders.join('\n')).toHaveLength(0);
  });

  it('gives every declared error code a message', () => {
    // Read the union rather than importing a table: a code added to the type
    // with no entry in DEFAULT_MESSAGE compiles fine and ships `undefined` to
    // the customer.
    const union = errorModule.slice(
      errorModule.indexOf('export type ApiErrorCode'),
      errorModule.indexOf(';', errorModule.indexOf('export type ApiErrorCode')),
    );
    const codes = [...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
    expect(codes.length).toBeGreaterThan(5);

    const table = errorModule.slice(errorModule.indexOf('const DEFAULT_MESSAGE'));
    for (const code of codes) {
      expect(table, code).toContain(`${code}:`);
    }
  });
});
