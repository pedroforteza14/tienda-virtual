import { cookies } from 'next/headers';
import { SESSION_MAX_AGE_SECONDS } from '@/config/constants';
import { guarded, jsonOk } from '@/server/security/guard';
import { logger } from '@/server/observability/logger';
import { cookieAttributes, cookieName } from '@/server/security/cookies';
import { createSessionId, csrfToken, endAuthSession, signSessionId } from '@/server/security/session';

/**
 * Log out.
 *
 * The **server-side session record is deleted**, not just the cookie. Clearing a
 * cookie only stops *this* browser presenting it; if the value was captured
 * anywhere, it would still be valid. Deleting the record is what makes the logout
 * real.
 *
 * A fresh guest session is issued in its place, so the visitor keeps browsing and
 * can build a new cart.
 */
export const POST = guarded({ bucket: 'api' }, async ({ sessionId }) => {
  if (sessionId) {
    endAuthSession(sessionId);
    logger.security('auth.logout', {});
  }

  const nextSessionId = createSessionId();
  const store = await cookies();
  const name = cookieName('session');

  store.set(name, signSessionId(nextSessionId), cookieAttributes('session', SESSION_MAX_AGE_SECONDS));
  store.set(
    name.replace('.sid', '.csrf'),
    csrfToken(nextSessionId),
    cookieAttributes('csrf', SESSION_MAX_AGE_SECONDS),
  );
  // The cart belonged to the previous session; it does not follow a logout.
  store.set(cookieName('cart'), '', { ...cookieAttributes('cart', 0), maxAge: 0 });

  return jsonOk({ ok: true });
});
