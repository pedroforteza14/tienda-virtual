import { afterEach, describe, expect, it } from 'vitest';

import nextConfig from '../../next.config';

/**
 * The header table, asserted against the real config.
 *
 * `next.config.ts` built the HSTS entry conditionally and left `headers: []`
 * behind outside production. Next rejects an empty header list with
 * "Invalid header found" and refuses to boot — so `next dev` was dead while
 * every check stayed green, because `next build` and the Playwright web server
 * both run with `NODE_ENV=production`, where the list is never empty.
 *
 * Nothing in the suite had ever started a dev server. This test stands in for
 * one: it calls `headers()` in both modes and fails on an entry Next would
 * reject, which no amount of production-mode testing can catch.
 */

const original = process.env.NODE_ENV;

afterEach(() => {
  // `NODE_ENV` is readonly in the Next type augmentation, hence the cast.
  (process.env as Record<string, string | undefined>).NODE_ENV = original;
});

async function headersIn(mode: string) {
  (process.env as Record<string, string | undefined>).NODE_ENV = mode;
  if (!nextConfig.headers) throw new Error('next.config.ts defines no headers()');
  return nextConfig.headers();
}

describe('next.config headers()', () => {
  for (const mode of ['development', 'test', 'production']) {
    it(`emits no empty header list in ${mode}`, async () => {
      const entries = await headersIn(mode);

      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.headers, `empty headers for source ${entry.source}`).not.toHaveLength(0);
        for (const header of entry.headers) {
          expect(header.key).toBeTruthy();
          expect(header.value).toBeTruthy();
        }
      }
    });
  }

  it('scopes HSTS to production, where TLS actually exists', async () => {
    const hstsIn = async (mode: string) =>
      (await headersIn(mode))
        .flatMap((entry) => entry.headers)
        .filter((header) => header.key === 'Strict-Transport-Security');

    expect(await hstsIn('production')).toHaveLength(1);
    expect(await hstsIn('development')).toHaveLength(0);
  });
});
