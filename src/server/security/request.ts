import { CSRF_HEADER } from '@/config/constants';
import { env } from '@/config/env';
import { logger } from '@/server/observability/logger';
import { cookieName } from '@/server/security/cookies';
import { deriveCsrfToken, safeEqual } from '@/server/security/signing';

/** Methods that change state and therefore need CSRF/origin protection. */
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isMutating(method: string): boolean {
  return MUTATING.has(method.toUpperCase());
}

/**
 * Origin / Referer validation for state-changing requests.
 *
 * Layer 2 of the CSRF defence (docs/threat-model.md §4.9). A cross-site form
 * POST either omits `Origin` or sends the attacker's, and neither is in our
 * allow-list. `Referer` is the fallback for the handful of clients that omit
 * `Origin` on same-origin requests.
 *
 * Strict by default: a mutation with **no** usable origin signal is rejected.
 * Being lenient here would hand back exactly what the check exists to stop.
 */
export function checkOrigin(request: Request): { ok: true } | { ok: false; reason: string } {
  if (!isMutating(request.method)) return { ok: true };

  const allowed = env().allowedOrigins;
  const origin = request.headers.get('origin');

  if (origin) {
    return allowed.includes(origin)
      ? { ok: true }
      : { ok: false, reason: 'origin-not-allowed' };
  }

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      return allowed.includes(new URL(referer).origin)
        ? { ok: true }
        : { ok: false, reason: 'referer-not-allowed' };
    } catch {
      return { ok: false, reason: 'referer-malformed' };
    }
  }

  return { ok: false, reason: 'origin-missing' };
}

/**
 * Double-submit CSRF check, bound to the session.
 *
 * The token is `HMAC(sessionId, 'csrf')`: the browser can read it from a
 * non-HttpOnly cookie and echo it in a header, but a cross-origin attacker can
 * neither read the cookie (same-origin policy) nor compute the value (no key).
 * Binding it to the session also means a token from another visitor is useless.
 */
export function checkCsrf(
  request: Request,
  sessionId: string | null,
): { ok: true } | { ok: false; reason: string } {
  if (!isMutating(request.method)) return { ok: true };
  if (!sessionId) return { ok: false, reason: 'no-session' };

  const header = request.headers.get(CSRF_HEADER);
  if (!header) return { ok: false, reason: 'header-missing' };

  const expected = deriveCsrfToken(sessionId);
  if (!safeEqual(header, expected)) return { ok: false, reason: 'token-mismatch' };

  // The cookie must also be present and match, which is what makes this a
  // *double* submit: a header alone could be set by a same-origin XSS without
  // the cookie, and a cookie alone is what CSRF gives an attacker for free.
  const cookie = readCookie(request, cookieName('csrf'));
  if (!cookie || !safeEqual(cookie, expected)) return { ok: false, reason: 'cookie-mismatch' };

  return { ok: true };
}

/** Minimal cookie reader for a plain `Request` (middleware and route handlers). */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}

/**
 * Reject an oversized body before reading it.
 *
 * `Content-Length` is a hint a client controls, so the actual byte count is also
 * checked after reading in `readJsonBody`. This check exists to avoid buffering
 * a declared-huge body at all.
 */
export function checkBodySize(request: Request, maxBytes: number): { ok: boolean; declared: number } {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(declared)) return { ok: false, declared: 0 };
  return { ok: declared <= maxBytes, declared };
}

/**
 * Require JSON. A cross-origin HTML form can only send
 * `application/x-www-form-urlencoded`, `multipart/form-data` or `text/plain`, so
 * insisting on `application/json` removes the simple-request CSRF path entirely
 * (layer 3 in docs/threat-model.md §4.9).
 */
export function checkContentType(request: Request): boolean {
  const type = request.headers.get('content-type') ?? '';
  return type.split(';')[0]?.trim().toLowerCase() === 'application/json';
}

export function logRejection(
  kind: 'csrf' | 'origin',
  reason: string,
  /**
   * `received` and `allowed` are optional and only an origin rejection sends
   * them. Neither is a secret — one is the public site URL, the other a header
   * anyone can set — and without them the log says two values differed without
   * saying which, which is the difference between a five-minute fix and a lost
   * afternoon for the misconfiguration that causes this most often.
   */
  context: { requestId: string; path: string; received?: string; allowed?: string },
): void {
  logger.security(kind === 'csrf' ? 'csrf.rejected' : 'origin.rejected', { reason, ...context });
}
