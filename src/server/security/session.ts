import { cookies } from 'next/headers';
import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  SESSION_MAX_AGE_SECONDS,
} from '@/config/constants';
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

export type Role = 'customer' | 'admin';

export interface AuthSession {
  sessionId: string;
  userId: string;
  role: Role;
  createdAt: number;
  expiresAt: number;
}

/**
 * In-memory session store.
 *
 * **[PRE-LAUNCH]** replace with a shared store (Redis or a `sessions` table).
 * Restarting the process logs everyone out, and it does not work across
 * replicas. The interface is deliberately tiny so the swap is mechanical.
 */
const authSessions = new Map<string, AuthSession>();
const MAX_AUTH_SESSIONS = 50_000;

export function startAuthSession(sessionId: string, userId: string, role: Role): AuthSession {
  if (authSessions.size >= MAX_AUTH_SESSIONS) {
    // Shed the oldest rather than refusing logins outright.
    const oldest = authSessions.keys().next().value;
    if (oldest) authSessions.delete(oldest);
  }
  const now = Date.now();
  const session: AuthSession = {
    sessionId,
    userId,
    role,
    createdAt: now,
    expiresAt: now + AUTH_SESSION_MAX_AGE_SECONDS * 1000,
  };
  authSessions.set(sessionId, session);
  return session;
}

/**
 * The ONLY source of identity and role. A handler asking "who is this and what
 * may they do" asks here — never the request body, never a header, never a
 * claim inside the cookie.
 */
export function getAuthSession(sessionId: string | null): AuthSession | null {
  if (!sessionId) return null;
  const session = authSessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    authSessions.delete(sessionId);
    return null;
  }
  return session;
}

/** Server-side invalidation: a logout that only clears the cookie is not a logout. */
export function endAuthSession(sessionId: string | null): void {
  if (sessionId) authSessions.delete(sessionId);
}

/** Drop every session for a user — password change, or incident response. */
export function endAllSessionsForUser(userId: string): number {
  let removed = 0;
  for (const [id, session] of authSessions) {
    if (session.userId === userId) {
      authSessions.delete(id);
      removed += 1;
    }
  }
  return removed;
}

/** Test-only. */
export function resetAuthSessions(): void {
  authSessions.clear();
}
