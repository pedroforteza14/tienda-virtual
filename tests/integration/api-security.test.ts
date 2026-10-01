import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CSRF_HEADER, MAX_JSON_BODY_BYTES, MAX_QTY_PER_LINE } from '@/config/constants';
import { catalog } from '@/server/catalog/repository';
import { POST as cartAdd } from '@/app/api/cart/route';
import { POST as cartUpdate } from '@/app/api/cart/update/route';
import { POST as cartPromo } from '@/app/api/cart/promo/route';
import { POST as checkout } from '@/app/api/checkout/route';
import { POST as discovery } from '@/app/api/discovery/route';
import { GET as search } from '@/app/api/search/route';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as orderRead } from '@/app/api/orders/[reference]/route';
import { cookieName } from '@/server/security/cookies';
import { createSessionId, csrfToken, signSessionId } from '@/server/security/session';
import { resetSecurityCounters } from '@/server/security/rate-limit';
import { resetInventory } from '@/server/orders/inventory';
import { resetOrders } from '@/server/orders/order-repository';

/**
 * The `guarded()` pipeline, exercised through the real route handlers.
 *
 * Scope note, stated plainly: these tests cover the **rejection** paths, which all
 * resolve inside `guarded()` before the handler runs — so no Next request context
 * is needed. The happy paths for cookie-writing routes (`cookies()` is only
 * available inside a real request) are covered by `tests/e2e/`, against a running
 * server. That split is deliberate rather than a gap: the security boundary lives in
 * the guard, and that is what is tested here.
 */

const ORIGIN = 'http://localhost:3000';

function stockedSku(): string {
  const found = catalog()
    .listProducts()
    .flatMap((product) => product.variants)
    .find((variant) => variant.stock >= 2);
  if (!found) throw new Error('fixture: no stocked variant');
  return found.sku;
}

interface RequestOptions {
  method?: string;
  path?: string;
  body?: unknown;
  /** A genuine signed session plus matching CSRF token. */
  authenticated?: boolean;
  origin?: string | null;
  contentType?: string | null;
  csrf?: string | null;
  contentLength?: number;
}

function build(options: RequestOptions = {}): Request {
  const method = options.method ?? 'POST';
  const headers = new Headers();

  if (options.origin !== null) headers.set('origin', options.origin ?? ORIGIN);
  if (options.contentType !== null) {
    headers.set('content-type', options.contentType ?? 'application/json');
  }

  if (options.authenticated !== false) {
    const sessionId = createSessionId();
    const token = csrfToken(sessionId);
    headers.set(
      'cookie',
      `${cookieName('session')}=${signSessionId(sessionId)}; ${cookieName('csrf')}=${token}`,
    );
    if (options.csrf !== null) headers.set(CSRF_HEADER, options.csrf ?? token);
  } else if (options.csrf) {
    headers.set(CSRF_HEADER, options.csrf);
  }

  const raw = options.body === undefined ? undefined : JSON.stringify(options.body);
  headers.set(
    'content-length',
    String(options.contentLength ?? (raw ? new TextEncoder().encode(raw).byteLength : 0)),
  );

  return new Request(`${ORIGIN}${options.path ?? '/api/cart'}`, {
    method,
    headers,
    ...(raw !== undefined && method !== 'GET' ? { body: raw } : {}),
  });
}

beforeEach(() => {
  resetSecurityCounters();
  resetInventory();
  resetOrders();
});
afterEach(() => {
  resetSecurityCounters();
  resetInventory();
  resetOrders();
});

/* -------------------------------------------------------------------------- */
/* PRICE MANIPULATION — the primary threat                                    */
/* -------------------------------------------------------------------------- */

describe('price manipulation over HTTP', () => {
  it('rejects a cart add that carries a price', async () => {
    const response = await cartAdd(build({ body: { sku: stockedSku(), qty: 1, price: 1 } }));

    // 422, not 200-with-the-field-ignored. Rejecting makes the attempt visible.
    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload.error.code).toBe('validation_failed');
  });

  it('rejects every money-shaped field, individually', async () => {
    const sku = stockedSku();
    for (const extra of [
      { price: 1 },
      { unitPrice: 1 },
      { lineTotal: 1 },
      { total: 1 },
      { priceList: 1 },
      { discount: 100 },
      { stock: 99999 },
      { currency: 'USD' },
    ]) {
      const response = await cartAdd(build({ body: { sku, qty: 1, ...extra } }));
      expect(response.status, JSON.stringify(extra)).toBe(422);
    }
  });

  it('rejects a checkout that carries a total', async () => {
    const response = await checkout(
      build({
        path: '/api/checkout',
        body: {
          customer: { name: 'Ana López', email: 'ana@example.com', phone: '1145678900' },
          shipping: { zone: 'pickup' },
          paymentMethod: 'transfer',
          acceptedTerms: true,
          total: 1,
        },
      }),
    );
    expect(response.status).toBe(422);
  });

  it('rejects a checkout that tries to supply its own cart lines', async () => {
    const response = await checkout(
      build({
        path: '/api/checkout',
        body: {
          customer: { name: 'Ana López', email: 'ana@example.com', phone: '1145678900' },
          shipping: { zone: 'pickup' },
          paymentMethod: 'transfer',
          acceptedTerms: true,
          lines: [{ sku: stockedSku(), qty: 1, price: 1 }],
        },
      }),
    );
    expect(response.status).toBe(422);
  });

  it('rejects a promo percentage, accepting only a code', async () => {
    const response = await cartPromo(
      build({ path: '/api/cart/promo', body: { code: 'OWNER5', percent: 90 } }),
    );
    expect(response.status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/* QUANTITY AND STOCK                                                         */
/* -------------------------------------------------------------------------- */

describe('quantity bounds over HTTP', () => {
  it('rejects a negative, zero, fractional or oversized quantity', async () => {
    const sku = stockedSku();
    for (const qty of [-1, 0, 1.5, MAX_QTY_PER_LINE + 1, 1e9, '2']) {
      const response = await cartAdd(build({ body: { sku, qty } }));
      expect(response.status, `qty=${String(qty)}`).toBe(422);
    }
  });

  it('rejects a malformed or hostile SKU', async () => {
    for (const sku of [
      '',
      '../../etc/passwd',
      'OWN-<script>alert(1)</script>',
      "OWN-X' OR '1'='1",
      { $ne: null },
      ['OWN-X'],
      null,
    ]) {
      const response = await cartAdd(build({ body: { sku, qty: 1 } }));
      expect(response.status, JSON.stringify(sku)).toBe(422);
    }
  });

  it('returns 404 for a well-formed SKU that does not exist', async () => {
    const response = await cartAdd(build({ body: { sku: 'OWN-NOTAREALSKU-XX', qty: 1 } }));
    expect(response.status).toBe(404);
  });

  it('rejects a NoSQL-style operator object where a quantity belongs', async () => {
    const response = await cartUpdate(
      build({ path: '/api/cart/update', body: { sku: stockedSku(), qty: { $gt: 0 } } }),
    );
    expect(response.status).toBe(422);
  });
});

/* -------------------------------------------------------------------------- */
/* CSRF AND ORIGIN                                                            */
/* -------------------------------------------------------------------------- */

describe('CSRF and origin enforcement', () => {
  const body = () => ({ sku: stockedSku(), qty: 1 });

  it('rejects a mutation with no CSRF header', async () => {
    const response = await cartAdd(build({ body: body(), csrf: null }));
    expect(response.status).toBe(403);
  });

  it("rejects another session's CSRF token", async () => {
    const foreign = csrfToken(createSessionId());
    const response = await cartAdd(build({ body: body(), csrf: foreign }));
    expect(response.status).toBe(403);
  });

  it('rejects a mutation with no session at all', async () => {
    const response = await cartAdd(build({ body: body(), authenticated: false }));
    expect(response.status).toBe(403);
  });

  it('rejects a cross-origin mutation', async () => {
    const response = await cartAdd(build({ body: body(), origin: 'https://evil.example' }));
    expect(response.status).toBe(403);
  });

  it('rejects an origin that merely prefixes ours', async () => {
    const response = await cartAdd(
      build({ body: body(), origin: 'http://localhost:3000.evil.example' }),
    );
    expect(response.status).toBe(403);
  });

  it('rejects a mutation with no Origin and no Referer — fails closed', async () => {
    const response = await cartAdd(build({ body: body(), origin: null }));
    expect(response.status).toBe(403);
  });

  it('rejects a form-encoded content type, closing the simple-request CSRF path', async () => {
    for (const contentType of [
      'application/x-www-form-urlencoded',
      'multipart/form-data; boundary=x',
      'text/plain',
      null,
    ]) {
      const response = await cartAdd(build({ body: body(), contentType }));
      expect(response.status, String(contentType)).toBe(415);
    }
  });

  it('does not require CSRF for a safe method', async () => {
    const response = await search(
      build({ method: 'GET', path: '/api/search?q=iphone', csrf: null, contentType: null }),
    );
    expect(response.status).toBe(200);
  });
});

/* -------------------------------------------------------------------------- */
/* BODY LIMITS AND MALFORMED INPUT                                            */
/* -------------------------------------------------------------------------- */

describe('body limits', () => {
  it('rejects an oversized declared body before parsing it', async () => {
    const response = await cartAdd(
      build({ body: { sku: stockedSku(), qty: 1 }, contentLength: MAX_JSON_BODY_BYTES + 1 }),
    );
    expect(response.status).toBe(413);
  });

  it('rejects a body that lies about its length and is actually huge', async () => {
    const sessionId = createSessionId();
    const token = csrfToken(sessionId);
    const huge = JSON.stringify({ sku: stockedSku(), qty: 1, pad: 'x'.repeat(MAX_JSON_BODY_BYTES * 2) });

    const response = await cartAdd(
      new Request(`${ORIGIN}/api/cart`, {
        method: 'POST',
        headers: {
          origin: ORIGIN,
          'content-type': 'application/json',
          // Understated on purpose: the streaming cap must catch it anyway.
          'content-length': '20',
          cookie: `${cookieName('session')}=${signSessionId(sessionId)}; ${cookieName('csrf')}=${token}`,
          [CSRF_HEADER]: token,
        },
        body: huge,
      }),
    );

    expect(response.status).toBe(413);
  });

  it('rejects an unparseable JSON body with a generic message', async () => {
    const sessionId = createSessionId();
    const token = csrfToken(sessionId);
    const response = await cartAdd(
      new Request(`${ORIGIN}/api/cart`, {
        method: 'POST',
        headers: {
          origin: ORIGIN,
          'content-type': 'application/json',
          'content-length': '9',
          cookie: `${cookieName('session')}=${signSessionId(sessionId)}; ${cookieName('csrf')}=${token}`,
          [CSRF_HEADER]: token,
        },
        body: '{not json',
      }),
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error.message).not.toMatch(/JSON\.parse|SyntaxError|position/i);
  });
});

/* -------------------------------------------------------------------------- */
/* ERROR DISCLOSURE                                                           */
/* -------------------------------------------------------------------------- */

describe('error responses leak nothing', () => {
  it('never includes a stack trace, a path or a schema internal', async () => {
    const responses = await Promise.all([
      cartAdd(build({ body: { sku: 'nope', qty: 1 } })),
      cartAdd(build({ body: { sku: stockedSku(), qty: 1 }, csrf: null })),
      cartAdd(build({ body: { sku: stockedSku(), qty: 1 }, origin: 'https://evil.example' })),
      orderRead(build({ method: 'GET', path: '/api/orders/NOT-A-REF', contentType: null })),
    ]);

    for (const response of responses) {
      const text = await response.text();
      expect(text).not.toMatch(/\/home\/|node_modules|at Object\.|\.ts:\d+/);
      expect(text).not.toMatch(/ZodError|invalid_union|_def/);
      expect(text).not.toMatch(/SESSION_SECRET|scrypt\$/);
    }
  });

  it('attaches a correlation id to every error', async () => {
    const response = await cartAdd(build({ body: { sku: 'x', qty: 1 } }));
    const payload = await response.json();
    expect(payload.error.requestId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('sets no-store on API responses', async () => {
    const response = await search(
      build({ method: 'GET', path: '/api/search?q=iphone', csrf: null, contentType: null }),
    );
    expect(response.headers.get('cache-control')).toMatch(/no-store/);
  });
});

/* -------------------------------------------------------------------------- */
/* IDOR OVER HTTP                                                             */
/* -------------------------------------------------------------------------- */

describe('order read — IDOR', () => {
  it('returns 404 for a well-formed reference that is not yours', async () => {
    const response = await orderRead(
      build({ method: 'GET', path: '/api/orders/OWN-7KD3M9QX2V', contentType: null }),
    );
    expect(response.status).toBe(404);
  });

  it('returns the same 404 for a malformed reference — no format oracle', async () => {
    const malformed = await orderRead(
      build({ method: 'GET', path: '/api/orders/..%2F..%2Fetc%2Fpasswd', contentType: null }),
    );
    const wellFormed = await orderRead(
      build({ method: 'GET', path: '/api/orders/OWN-7KD3M9QX2V', contentType: null }),
    );

    expect(malformed.status).toBe(wellFormed.status);
    const a = await malformed.json();
    const b = await wellFormed.json();
    expect(a.error.code).toBe(b.error.code);
    expect(a.error.message).toBe(b.error.message);
  });

  it('returns 404 with no session rather than 401, so nothing is confirmed', async () => {
    const response = await orderRead(
      build({ method: 'GET', path: '/api/orders/OWN-7KD3M9QX2V', authenticated: false, contentType: null }),
    );
    expect(response.status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/* RATE LIMITING                                                              */
/* -------------------------------------------------------------------------- */

describe('rate limiting over HTTP', () => {
  it('limits login attempts and returns Retry-After', async () => {
    const sessionId = createSessionId();
    const token = csrfToken(sessionId);
    const cookie = `${cookieName('session')}=${signSessionId(sessionId)}; ${cookieName('csrf')}=${token}`;

    const attempt = () =>
      login(
        new Request(`${ORIGIN}/api/auth/login`, {
          method: 'POST',
          headers: {
            origin: ORIGIN,
            'content-type': 'application/json',
            'content-length': '60',
            cookie,
            [CSRF_HEADER]: token,
          },
          body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-password' }),
        }),
      );

    // RATE_LIMITS.login is [5, 300].
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) statuses.push((await attempt()).status);

    expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(0);

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
  });

  it('advertises the limit on successful responses so a client can back off', async () => {
    const response = await search(
      build({ method: 'GET', path: '/api/search?q=iphone', csrf: null, contentType: null }),
    );
    expect(response.headers.get('ratelimit-limit')).toBeTruthy();
    expect(response.headers.get('ratelimit-remaining')).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* SEARCH AND DISCOVERY — the routes with no cookie dependency                 */
/* -------------------------------------------------------------------------- */

describe('search endpoint', () => {
  it('returns a projection, not the whole product record', async () => {
    const response = await search(
      build({ method: 'GET', path: '/api/search?q=iphone+17', csrf: null, contentType: null }),
    );
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.results.length).toBeGreaterThan(0);

    const keys = Object.keys(payload.results[0]).sort();
    expect(keys).toEqual([
      'color',
      'family',
      'from',
      'fromTransfer',
      'inStock',
      'name',
      'render',
      'slug',
      'tagline',
    ]);
    // Crucially: no variants array, so a scraper does not get the catalogue.
    expect(payload.results[0]).not.toHaveProperty('variants');
    expect(payload.results[0]).not.toHaveProperty('specs');
  });

  it('returns empty for a one-character query instead of everything', async () => {
    const response = await search(
      build({ method: 'GET', path: '/api/search?q=a', csrf: null, contentType: null }),
    );
    const payload = await response.json();
    expect(payload.results).toHaveLength(0);
  });

  it('rejects an over-long query', async () => {
    const response = await search(
      build({
        method: 'GET',
        path: `/api/search?q=${'a'.repeat(200)}`,
        csrf: null,
        contentType: null,
      }),
    );
    expect(response.status).toBe(422);
  });

  it('reflects a hostile query back only as JSON-escaped text', async () => {
    const payload = '<script>alert(1)</script>';
    const response = await search(
      build({
        method: 'GET',
        path: `/api/search?q=${encodeURIComponent(payload)}`,
        csrf: null,
        contentType: null,
      }),
    );
    const text = await response.text();
    // JSON.stringify escapes nothing dangerous here, but the response is
    // application/json with nosniff, and React renders it as a text node.
    expect(response.headers.get('content-type')).toMatch(/application\/json/);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(JSON.parse(text).results).toHaveLength(0);
  });

  it('rejects an unknown query parameter', async () => {
    const response = await search(
      build({ method: 'GET', path: '/api/search?q=iphone&limit=9999', csrf: null, contentType: null }),
    );
    expect(response.status).toBe(422);
  });
});

describe('discovery endpoint', () => {
  it('returns recommendations for a valid use case', async () => {
    const response = await discovery(
      build({ path: '/api/discovery', body: { useCase: 'work', budget: 'any', families: [] } }),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.results.length).toBeGreaterThan(0);
  });

  it('rejects an unknown use case', async () => {
    const response = await discovery(
      build({ path: '/api/discovery', body: { useCase: 'mining', budget: 'any' } }),
    );
    expect(response.status).toBe(422);
  });

  it('rejects an oversized families array', async () => {
    const response = await discovery(
      build({
        path: '/api/discovery',
        body: { useCase: 'work', budget: 'any', families: Array(50).fill('iphone') },
      }),
    );
    expect(response.status).toBe(422);
  });
});

// Note: the happy path of `GET /api/cart` needs a Next request context for
// `cookies()`, so it lives in `tests/e2e/`. That a read does not require a CSRF
// token is asserted directly against `checkCsrf` in `tests/unit/security.test.ts`.
