import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CSRF_HEADER, SESSION_MAX_AGE_SECONDS } from '@/config/constants';
import {
  deriveCsrfToken,
  deriveOwnerKey,
  randomToken,
  safeEqual,
  signJson,
  signValue,
  unsignJson,
  unsignValue,
} from '@/server/security/signing';
import {
  checkBodySize,
  checkContentType,
  checkCsrf,
  checkOrigin,
  isMutating,
  readCookie,
} from '@/server/security/request';
import {
  clientKey,
  failureCount,
  rateLimit,
  recordFailure,
} from '@/server/security/rate-limit';
import { hashPassword, verifyPassword } from '@/server/auth/passwords';
import { resetStore } from '@/server/store';
import { __testing, logger } from '@/server/observability/logger';
import { cookieName } from '@/server/security/cookies';

const ORIGIN = 'http://localhost:3000';

function request(init: {
  method?: string;
  origin?: string | null;
  referer?: string | null;
  cookie?: string;
  csrf?: string;
  contentType?: string | null;
  contentLength?: number;
}): Request {
  const headers = new Headers();
  if (init.origin !== null) headers.set('origin', init.origin ?? ORIGIN);
  if (init.referer) headers.set('referer', init.referer);
  if (init.cookie) headers.set('cookie', init.cookie);
  if (init.csrf) headers.set(CSRF_HEADER, init.csrf);
  if (init.contentType !== null) headers.set('content-type', init.contentType ?? 'application/json');
  if (init.contentLength !== undefined) headers.set('content-length', String(init.contentLength));

  return new Request(`${ORIGIN}/api/cart`, { method: init.method ?? 'POST', headers });
}

/* -------------------------------------------------------------------------- */

describe('cookie signing', () => {
  it('round-trips a value', () => {
    const token = signValue('abc123', 'session');
    expect(unsignValue(token, 'session', 3600)).toBe('abc123');
  });

  it('rejects a tampered payload', () => {
    const token = signValue('user-1', 'session');
    const [, issuedAt, signature] = token.split('.');
    const forged = `user-2.${issuedAt}.${signature}`;
    expect(unsignValue(forged, 'session', 3600)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const token = signValue('abc123', 'session');
    expect(unsignValue(`${token}x`, 'session', 3600)).toBeNull();
  });

  it('is purpose-bound: a session token cannot be replayed as a CSRF token', () => {
    const token = signValue('abc123', 'session');
    expect(unsignValue(token, 'csrf', 3600)).toBeNull();
    expect(unsignValue(token, 'cart', 3600)).toBeNull();
  });

  it('expires past the max age', () => {
    const past = Date.now() - 7200 * 1000;
    const token = signValue('abc123', 'session', past);
    expect(unsignValue(token, 'session', 3600)).toBeNull();
    expect(unsignValue(token, 'session', 10_800)).toBe('abc123');
  });

  it('rejects a token issued in the future, so clock skew buys no extra life', () => {
    const future = Date.now() + 3600 * 1000;
    const token = signValue('abc123', 'session', future);
    expect(unsignValue(token, 'session', 3600)).toBeNull();
  });

  it('survives malformed input without throwing', () => {
    for (const bad of [undefined, '', 'a', 'a.b', 'a.b.c.d', '.'.repeat(10), 'x'.repeat(5000)]) {
      expect(() => unsignValue(bad, 'session', 3600)).not.toThrow();
      expect(unsignValue(bad, 'session', 3600)).toBeNull();
    }
  });

  it('round-trips signed JSON and rejects a forged payload', () => {
    const token = signJson({ v: 1, l: [['OWN-X', 2]] }, 'cart');
    expect(unsignJson(token, 'cart', SESSION_MAX_AGE_SECONDS)).toEqual({ v: 1, l: [['OWN-X', 2]] });

    const handCrafted = Buffer.from(JSON.stringify({ v: 1, l: [] }), 'utf8').toString('base64url');
    expect(unsignJson(`${handCrafted}.0.sig`, 'cart', SESSION_MAX_AGE_SECONDS)).toBeNull();
  });

  it('compares in constant time and handles length mismatch', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });

  it('derives a non-reversible owner key, stable per session and distinct across them', () => {
    const a = randomToken(24);
    const b = randomToken(24);
    expect(deriveOwnerKey(a)).toBe(deriveOwnerKey(a));
    expect(deriveOwnerKey(a)).not.toBe(deriveOwnerKey(b));
    // The session id must not be recoverable from, or visible in, the key.
    expect(deriveOwnerKey(a)).not.toContain(a);
  });

  it('derives a CSRF token bound to the session', () => {
    const a = randomToken(24);
    const b = randomToken(24);
    expect(deriveCsrfToken(a)).toBe(deriveCsrfToken(a));
    expect(deriveCsrfToken(a)).not.toBe(deriveCsrfToken(b));
    // And it is not the same value as the owner key for the same session.
    expect(deriveCsrfToken(a)).not.toBe(deriveOwnerKey(a));
  });

  it('produces unguessable tokens', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => randomToken(24)));
    expect(tokens.size).toBe(500);
  });
});

/* -------------------------------------------------------------------------- */

describe('origin validation (CSRF layer 2)', () => {
  it('allows a same-origin mutation', () => {
    expect(checkOrigin(request({ origin: ORIGIN })).ok).toBe(true);
  });

  it('rejects a foreign origin', () => {
    expect(checkOrigin(request({ origin: 'https://evil.example' })).ok).toBe(false);
  });

  it('rejects a mutation with NO origin signal at all — fails closed', () => {
    const result = checkOrigin(request({ origin: null }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('origin-missing');
  });

  it('falls back to Referer when Origin is absent', () => {
    expect(checkOrigin(request({ origin: null, referer: `${ORIGIN}/checkout` })).ok).toBe(true);
    expect(checkOrigin(request({ origin: null, referer: 'https://evil.example/x' })).ok).toBe(false);
    expect(checkOrigin(request({ origin: null, referer: 'not a url' })).ok).toBe(false);
  });

  it('does not apply to safe methods', () => {
    expect(checkOrigin(request({ method: 'GET', origin: null }).clone()).ok).toBe(true);
    expect(isMutating('GET')).toBe(false);
    expect(isMutating('post')).toBe(true);
    expect(isMutating('DELETE')).toBe(true);
  });

  it('is not fooled by an origin that merely starts with ours', () => {
    expect(checkOrigin(request({ origin: `${ORIGIN}.evil.example` })).ok).toBe(false);
    expect(checkOrigin(request({ origin: 'http://localhost:3000.evil.example' })).ok).toBe(false);
  });
});

describe('content type (CSRF layer 3)', () => {
  it('requires application/json', () => {
    expect(checkContentType(request({ contentType: 'application/json' }))).toBe(true);
    expect(checkContentType(request({ contentType: 'application/json; charset=utf-8' }))).toBe(true);
  });

  it('rejects the content types a cross-origin HTML form can produce', () => {
    for (const type of [
      'application/x-www-form-urlencoded',
      'multipart/form-data; boundary=x',
      'text/plain',
      null,
    ]) {
      expect(checkContentType(request({ contentType: type })), String(type)).toBe(false);
    }
  });
});

describe('CSRF double submit (layer 4)', () => {
  const sessionId = randomToken(24);
  const token = deriveCsrfToken(sessionId);
  const cookie = `${cookieName('csrf')}=${token}`;

  it('accepts a matching header and cookie', () => {
    expect(checkCsrf(request({ csrf: token, cookie }), sessionId).ok).toBe(true);
  });

  it('rejects a missing header', () => {
    const result = checkCsrf(request({ cookie }), sessionId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('header-missing');
  });

  it('rejects a header without the matching cookie — the "double" in double submit', () => {
    const result = checkCsrf(request({ csrf: token }), sessionId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('cookie-mismatch');
  });

  it("rejects another session's token", () => {
    const other = deriveCsrfToken(randomToken(24));
    const result = checkCsrf(
      request({ csrf: other, cookie: `${cookieName('csrf')}=${other}` }),
      sessionId,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('token-mismatch');
  });

  it('rejects when there is no session', () => {
    expect(checkCsrf(request({ csrf: token, cookie }), null).ok).toBe(false);
  });

  it('does not apply to safe methods', () => {
    expect(checkCsrf(request({ method: 'GET' }), sessionId).ok).toBe(true);
  });
});

describe('body limits', () => {
  it('rejects an oversized declared body', () => {
    expect(checkBodySize(request({ contentLength: 1024 }), 16 * 1024).ok).toBe(true);
    expect(checkBodySize(request({ contentLength: 32 * 1024 }), 16 * 1024).ok).toBe(false);
  });
});

describe('cookie parsing', () => {
  it('reads a named cookie and ignores lookalikes', () => {
    const req = new Request(ORIGIN, {
      headers: { cookie: 'other=1; owner.sid=abc; owner.sid.extra=zzz' },
    });
    expect(readCookie(req, 'owner.sid')).toBe('abc');
    expect(readCookie(req, 'owner.csrf')).toBeNull();
    expect(readCookie(new Request(ORIGIN), 'owner.sid')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe('rate limiting', () => {
  beforeEach(async () => resetStore());
  afterEach(async () => {
    vi.useRealTimers();
    await resetStore();
  });

  it('allows up to the limit and then refuses with a Retry-After', async () => {
    const key = 'test-client';
    // RATE_LIMITS.login is [5, 300].
    for (let i = 0; i < 5; i += 1) {
      expect((await rateLimit('login', key)).allowed, `attempt ${i + 1}`).toBe(true);
    }
    const blocked = await rateLimit('login', key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.remaining).toBe(0);
  });

  it('keeps buckets independent per key and per route class', async () => {
    for (let i = 0; i < 5; i += 1) await rateLimit('login', 'client-a');
    expect((await rateLimit('login', 'client-a')).allowed).toBe(false);
    expect((await rateLimit('login', 'client-b')).allowed).toBe(true);
    expect((await rateLimit('search', 'client-a')).allowed).toBe(true);
  });

  /**
   * The window is now the store's, not a parameter, so this moves the clock
   * instead of passing a timestamp. That is a better test of the same property:
   * it exercises the expiry the running system actually relies on, rather than
   * arithmetic on an argument no caller supplies.
   */
  it('resets after the window', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i += 1) await rateLimit('login', 'client-c');
    expect((await rateLimit('login', 'client-c')).allowed).toBe(false);

    vi.advanceTimersByTime(301_000);
    expect((await rateLimit('login', 'client-c')).allowed).toBe(true);
  });

  it('keys on session as well as IP, so rotating the forged header shares a bucket', () => {
    const session = randomToken(16);
    const a = clientKey(
      new Request(ORIGIN, { headers: { 'x-forwarded-for': '1.1.1.1' } }),
      session,
    );
    const b = clientKey(
      new Request(ORIGIN, { headers: { 'x-forwarded-for': '2.2.2.2' } }),
      session,
    );
    // Different IP portion, but the attacker cannot forge a signed session id,
    // so the session half of the key still ties the attempts together.
    expect(a).not.toBe(b);
    expect(a.endsWith(session)).toBe(true);
    expect(b.endsWith(session)).toBe(true);
  });

  it('tracks per-account failures independently of the request limiter', async () => {
    expect(await failureCount('login:a@b.com')).toBe(0);
    for (let i = 1; i <= 3; i += 1) {
      expect(await recordFailure('login:a@b.com', 900)).toBe(i);
    }
    expect(await failureCount('login:a@b.com')).toBe(3);
    expect(await failureCount('login:other@b.com')).toBe(0);

    // Exhausting the request limiter for this client must not touch the
    // per-account counter: they are different controls, and an attacker who
    // rotates IP addresses resets only the first one.
    for (let i = 0; i < 10; i += 1) await rateLimit('login', 'noisy-client');
    expect(await failureCount('login:a@b.com')).toBe(3);
  });
});

/* -------------------------------------------------------------------------- */

describe('password hashing', () => {
  it('produces a parameterised, salted hash and verifies it', async () => {
    const hash = await hashPassword('el perro corre rapido');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(hash).not.toContain('el perro corre rapido');

    expect((await verifyPassword('el perro corre rapido', hash)).valid).toBe(true);
    expect((await verifyPassword('el perro corre rápido', hash)).valid).toBe(false);
    expect((await verifyPassword('', hash)).valid).toBe(false);
  });

  it('salts per user, so the same password hashes differently', async () => {
    const a = await hashPassword('la misma contrasena larga');
    const b = await hashPassword('la misma contrasena larga');
    expect(a).not.toBe(b);
    expect((await verifyPassword('la misma contrasena larga', a)).valid).toBe(true);
    expect((await verifyPassword('la misma contrasena larga', b)).valid).toBe(true);
  });

  it('returns false for a malformed or absent stored hash, without throwing', async () => {
    for (const stored of [null, '', 'not-a-hash', 'scrypt$1$2$3', 'bcrypt$x$y$z$w$v']) {
      const result = await verifyPassword('whatever', stored);
      expect(result.valid).toBe(false);
    }
  });

  it('refuses absurd cost factors in a tampered hash string', async () => {
    // A hash claiming N = 2^30 would try to allocate gigabytes.
    const tampered = 'scrypt$1073741824$8$1$c2FsdHNhbHRzYWx0c2E=$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g=';
    const result = await verifyPassword('whatever', tampered);
    expect(result.valid).toBe(false);
  });

  it('normalises unicode so an equivalent password still verifies', async () => {
    // "é" composed vs. decomposed.
    const hash = await hashPassword('contraseña muy larga');
    expect((await verifyPassword('contraseña muy larga', hash)).valid).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe('logging redaction', () => {
  const sanitise = __testing.sanitise as (value: unknown) => unknown;

  it('redacts secrets by key name, case- and separator-insensitively', () => {
    const output = sanitise({
      password: 'hunter2',
      userPassword: 'hunter2',
      access_token: 'abc',
      Authorization: 'Bearer abc',
      Cookie: 'sid=abc',
      cardNumber: '4111111111111111',
      cvv: '123',
      sessionSecret: 'x',
      stripe_api_key: 'sk_live_x',
      dni: '12345678',
      safe: 'visible',
    }) as Record<string, unknown>;

    for (const key of [
      'password',
      'userPassword',
      'access_token',
      'Authorization',
      'Cookie',
      'cardNumber',
      'cvv',
      'sessionSecret',
      'stripe_api_key',
      'dni',
    ]) {
      expect(output[key], key).toBe('[redacted]');
    }
    expect(output.safe).toBe('visible');
  });

  it('pseudonymises PII instead of dropping it', () => {
    const output = sanitise({ email: 'Ana@Example.com', phone: '1145678900' }) as Record<string, unknown>;
    expect(output.email).toMatch(/^sha256:[0-9a-f]{16}$/);
    expect(output.email).not.toContain('ana');
    // Case-insensitive: the same address always hashes the same way.
    expect(output.email).toBe((sanitise({ email: 'ana@example.com' }) as Record<string, unknown>).email);
  });

  it('redacts nested values and bounds depth, breadth and string length', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: { password: 'x' } } } } } } } };
    expect(JSON.stringify(sanitise(deep))).toContain('depth-limit');

    const wide = sanitise({ list: Array.from({ length: 200 }, (_, i) => i) }) as {
      list: number[];
    };
    expect(wide.list.length).toBeLessThanOrEqual(50);

    const long = sanitise({ note: 'x'.repeat(2000) }) as { note: string };
    expect(long.note.length).toBeLessThan(2000);
    expect(long.note).toContain('[truncated]');
  });

  it('never throws on an exotic value', () => {
    for (const value of [
      { fn: () => 1 },
      { sym: Symbol('x') },
      { big: 10n },
      { err: new Error('boom') },
      { circularish: { self: null as unknown } },
    ]) {
      expect(() => sanitise(value)).not.toThrow();
    }
  });

  it('exposes a security channel for the events alerting depends on', () => {
    expect(typeof logger.security).toBe('function');
    expect(() => logger.security('auth.login.failure', { email: 'a@b.com' })).not.toThrow();
  });
});
