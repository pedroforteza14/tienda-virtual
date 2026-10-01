import { cookies } from 'next/headers';
import { SESSION_MAX_AGE_SECONDS } from '@/config/constants';
import { jsonOk } from '@/lib/http/responses';
import { cookieAttributes, cookieName } from '@/server/security/cookies';
import {
  createSessionId,
  csrfToken,
  signSessionId,
  verifySessionCookie,
} from '@/server/security/session';

/**
 * Session bootstrap.
 *
 * Issues the signed guest session on first visit and returns the CSRF token the
 * client needs for its first mutation.
 *
 * Why this route exists at all: the Edge runtime that middleware runs in has no
 * `node:crypto`, and maintaining a second signing implementation for it would mean
 * two implementations of the control protecting every cookie. One Node route is
 * the smaller risk. It costs a brand-new visitor one small request, at the moment
 * they first interact — returning visitors never call it, because the client reads
 * the token from the cookie that is already there.
 *
 * It is a GET and it is idempotent: calling it with a valid session returns the
 * same token and does not rotate anything.
 */
export async function GET(): Promise<Response> {
  const store = await cookies();
  const name = cookieName('session');

  const existing = verifySessionCookie(store.get(name)?.value);
  const sessionId = existing ?? createSessionId();

  if (!existing) {
    store.set(name, signSessionId(sessionId), cookieAttributes('session', SESSION_MAX_AGE_SECONDS));
  }

  const token = csrfToken(sessionId);

  // Readable by our own JS — that is what makes a double-submit token work. It is
  // useless to another origin, which can neither read it nor compute it.
  store.set(name.replace('.sid', '.csrf'), token, cookieAttributes('csrf', SESSION_MAX_AGE_SECONDS));

  return jsonOk({ csrfToken: token });
}
