import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '@/config/env';

/**
 * HMAC signing for cookie values.
 *
 * Design notes that matter:
 *
 *  - **Purpose-bound keys.** The signing key is derived per purpose
 *    (`HMAC(SESSION_SECRET, purpose)`), so a value signed as a session id can
 *    never be replayed as a CSRF token or a cart. Reusing one key across
 *    contexts is how "valid signature, wrong meaning" bugs happen.
 *  - **Timestamped.** Every token carries its issue time, and verification
 *    enforces a max age, so an exfiltrated cookie expires on its own.
 *  - **Constant-time comparison.** `timingSafeEqual`, after a length check, so a
 *    signature cannot be discovered a byte at a time.
 *  - **base64url, no padding.** Cookie-safe without escaping.
 */

function keyFor(purpose: string): Buffer {
  return createHmac('sha256', Buffer.from(env().SESSION_SECRET!, 'base64'))
    .update(`owner.v1.${purpose}`)
    .digest();
}

function b64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

function computeSignature(purpose: string, payload: string): string {
  return b64url(createHmac('sha256', keyFor(purpose)).update(payload).digest());
}

/** Compare two strings in constant time. Length mismatch returns false early —
 *  the length of a signature is not a secret. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** `value.issuedAt.signature` — the issue time is inside the signed payload. */
export function signValue(value: string, purpose: string, now = Date.now()): string {
  if (value.includes('.')) {
    throw new Error('signValue: value must not contain "."');
  }
  const issuedAt = Math.floor(now / 1000).toString(36);
  const payload = `${value}.${issuedAt}`;
  return `${payload}.${computeSignature(purpose, payload)}`;
}

/** Returns the original value, or `null` for any failure. Never throws on bad
 *  input — a malformed cookie is an everyday event, not an exception. */
export function unsignValue(
  token: string | undefined,
  purpose: string,
  maxAgeSeconds: number,
  now = Date.now(),
): string | null {
  if (!token || token.length > 4096) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [value, issuedAt, signature] = parts as [string, string, string];
  if (!value || !issuedAt || !signature) return null;

  if (!safeEqual(signature, computeSignature(purpose, `${value}.${issuedAt}`))) return null;

  const issued = Number.parseInt(issuedAt, 36);
  if (!Number.isFinite(issued)) return null;

  const ageSeconds = Math.floor(now / 1000) - issued;
  // Reject the future too: a clock-skewed or forged timestamp should not buy
  // an attacker a longer-lived token.
  if (ageSeconds < -60 || ageSeconds > maxAgeSeconds) return null;

  return value;
}

/** Sign an arbitrary JSON-serialisable payload (used for the cart cookie). */
export function signJson(payload: unknown, purpose: string): string {
  return signValue(Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url'), purpose);
}

export function unsignJson(
  token: string | undefined,
  purpose: string,
  maxAgeSeconds: number,
): unknown {
  const raw = unsignValue(token, purpose, maxAgeSeconds);
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    if (json.length > 8192) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** 256 bits, base64url. Used for session ids and order references. */
export function randomToken(bytes = 32): string {
  return b64url(randomBytes(bytes));
}

/**
 * A derived, non-reversible key identifying who owns an order.
 *
 * Stored on the order instead of the session id itself, so a leaked order
 * record does not leak a usable session identifier. See docs/threat-model.md §4.4.
 */
export function deriveOwnerKey(sessionId: string): string {
  return b64url(createHmac('sha256', keyFor('order-owner')).update(sessionId).digest()).slice(0, 32);
}

/** Deterministic CSRF token bound to the session. No extra server state, and it
 *  rotates automatically whenever the session does. */
export function deriveCsrfToken(sessionId: string): string {
  return b64url(createHmac('sha256', keyFor('csrf')).update(sessionId).digest()).slice(0, 43);
}
