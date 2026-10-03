import { cookies } from 'next/headers';
import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  SESSION_MAX_AGE_SECONDS,
} from '@/config/constants';
import { store } from '@/server/store';
import { cookieName } from '@/server/security/cookies';
import { readCookie } from '@/server/security/request';
import {
  deriveCsrfToken,
  deriveOwnerKey,
  randomToken,
  signValue,
  unsignValue,
} from '@/server/security/signing';

/**
 * Sessions.
 *
 * Every visitor gets a signed, HttpOnly session id — issued by `middleware.ts`,
 * so by the time any handler runs it already exists. That id does three jobs:
 *
 *   1. keys the cart,
 *   2. derives the order `ownerKey` (authorization for guest orders),
 *   3. derives the CSRF token.
 *
 * Authentication is layered *on top*: a session id becomes privileged only when
 * a server-side record says so. Nothing in the cookie itself ever asserts a user
 * id or a role — those come from the store, keyed by the id. That is the
 * structural reason `role: "admin"` in a request body cannot do anything.
 */

export const SESSION_PURPOSE = 'session';

export function createSessionId(): string {
  // `signValue` splits on ".", so the id must not contain one. base64url cannot.
  return randomToken(24);
}

export function signSessionId(sessionId: string): string {
  return signValue(sessionId, SESSION_PURPOSE);
}

/** Verify a signed session cookie value. Returns the raw id, or null. */
export function verifySessionCookie(value: string | undefined | null): string | null {
  return unsignValue(value ?? undefined, SESSION_PURPOSE, SESSION_MAX_AGE_SECONDS);
}

/** For middleware and route handlers that hold a `Request`. */
export function sessionIdFromRequest(request: Request): string | null {
  return verifySessionCookie(readCookie(request, cookieName('session')));
}

/** For Server Components and Route Handlers using `next/headers`. */
export async function currentSessionId(): Promise<string | null> {
  const store = await cookies();
  return verifySessionCookie(store.get(cookieName('session'))?.value);
}

/** The authorization key stored on orders. Derived, non-reversible. */
export function ownerKey(sessionId: string): string {
  return deriveOwnerKey(sessionId);
}

export function csrfToken(sessionId: string): string {
  return deriveCsrfToken(sessionId);
}

/* -------------------------------------------------------------------------- */
/* Authenticated session records                                              */
/* -------------------------------------------------------------------------- */

/**
 * Authenticated session records, in the shared store.
 *
 * Two keys per session, and the second one is not redundant:
 *
 *   `auth:<sessionId>`      → the record, expiring with the session
 *   `auth:user:<userId>`    → the set of that user's session ids
 *
 * Without the index, "log this user out everywhere" — a password change, or an
 * incident — would mean scanning every session key, which is `SCAN` against a
 * shared Redis and gets slower exactly when it is most needed. The index makes
 * it one read and N deletes.
 *
 * Both keys carry a TTL, so an abandoned session disappears on its own; nothing
 * sweeps, and nothing needs a timer keeping an instance warm.
 */

export type Role = 'customer' | 'admin';

export interface AuthSession {
  sessionId: string;
  userId: string;
  role: Role;
  createdAt: number;
  expiresAt: number;
}

const ROLES: readonly Role[] = ['customer', 'admin'];

function sessionKey(sessionId: string): string {
  return `auth:${sessionId}`;
}

function userIndexKey(userId: string): string {
  return `auth:user:${userId}`;
}

export async function startAuthSession(
  sessionId: string,
  userId: string,
  role: Role,
): Promise<AuthSession> {
  const now = Date.now();
  const session: AuthSession = {
    sessionId,
    userId,
    role,
    createdAt: now,
    expiresAt: now + AUTH_SESSION_MAX_AGE_SECONDS * 1000,
  };

  const kv = store();
  await kv.set(sessionKey(sessionId), JSON.stringify(session), {
    ttlSeconds: AUTH_SESSION_MAX_AGE_SECONDS,
  });
  await kv.setAdd(userIndexKey(userId), sessionId, AUTH_SESSION_MAX_AGE_SECONDS);

  return session;
}

/**
 * The ONLY source of identity and role. A handler asking "who is this and what
 * may they do" asks here — never the request body, never a header, never a
 * claim inside the cookie.
 *
 * The stored record is parsed defensively rather than trusted: it is JSON that
 * came back over a network from a database someone else may also write to, and
 * a malformed or tampered record must produce "not logged in", never a session
 * with an unexpected role.
 */
export async function getAuthSession(sessionId: string | null): Promise<AuthSession | null> {
  if (!sessionId) return null;

  const kv = store();
  const raw = await kv.get(sessionKey(sessionId));
  if (!raw) return null;

  const session = parseSession(raw);
  if (!session || session.sessionId !== sessionId) return null;

  if (session.expiresAt <= Date.now()) {
    await endAuthSession(sessionId);
    return null;
  }
  return session;
}

function parseSession(raw: string): AuthSession | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!decoded || typeof decoded !== 'object') return null;

  const value = decoded as Record<string, unknown>;
  if (
    typeof value.sessionId !== 'string' ||
    typeof value.userId !== 'string' ||
    typeof value.createdAt !== 'number' ||
    typeof value.expiresAt !== 'number' ||
    typeof value.role !== 'string' ||
    !ROLES.includes(value.role as Role)
  ) {
    return null;
  }

  return {
    sessionId: value.sessionId,
    userId: value.userId,
    role: value.role as Role,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
  };
}

/** Server-side invalidation: a logout that only clears the cookie is not a logout. */
export async function endAuthSession(sessionId: string | null): Promise<void> {
  if (!sessionId) return;
  const kv = store();

  // Read the record first so the user index can be cleaned up too; an orphaned
  // id left in the index would be deleted again on the next "log out
  // everywhere", which is harmless but makes the count meaningless.
  const raw = await kv.get(sessionKey(sessionId));
  const session = raw ? parseSession(raw) : null;

  await kv.delete(sessionKey(sessionId));
  if (session) await kv.setRemove(userIndexKey(session.userId), sessionId);
}

/** Drop every session for a user — password change, or incident response. */
export async function endAllSessionsForUser(userId: string): Promise<number> {
  const kv = store();
  const sessionIds = await kv.setMembers(userIndexKey(userId));
  if (sessionIds.length === 0) return 0;

  await kv.delete(...sessionIds.map(sessionKey));
  await kv.delete(userIndexKey(userId));
  return sessionIds.length;
}
