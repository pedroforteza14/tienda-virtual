import { cookies } from 'next/headers';
import { AUTH_SESSION_MAX_AGE_SECONDS } from '@/config/constants';
import { SignupSchema } from '@/lib/validation/schemas';
import { guarded, jsonOk } from '@/server/security/guard';
import { signup, toUserDTO } from '@/server/auth/auth-service';
import { cookieAttributes, cookieName } from '@/server/security/cookies';
import { createSessionId, csrfToken, endAuthSession, signSessionId } from '@/server/security/session';

/**
 * Create an account.
 *
 * Returns the **same success-shaped response** whether or not the email was
 * already registered. That is not sloppiness — a 409 here is a free account
 * oracle: an attacker can enumerate which of a breached email list has an account
 * with us, which is exactly the targeting information they want before credential
 * stuffing. The duplicate is logged server-side so real abuse stays visible.
 *
 * The session id is **rotated** rather than reused, so a session planted before
 * signup cannot become a privileged one.
 */
export const POST = guarded({ bucket: 'signup', schema: SignupSchema }, async ({ data, sessionId }) => {
  const nextSessionId = createSessionId();
  const result = await signup(data.name, data.email, data.password, nextSessionId);

  if (!result.ok) {
    // Indistinguishable from success, including the absence of a session: the
    // caller is told to log in, which is the correct next step either way.
    return jsonOk({ created: true, user: null });
  }

  // Invalidate the pre-signup session server-side as well as replacing the cookie.
  endAuthSession(sessionId);

  const store = await cookies();
  const name = cookieName('session');
  store.set(
    name,
    signSessionId(nextSessionId),
    cookieAttributes('session', AUTH_SESSION_MAX_AGE_SECONDS),
  );
  store.set(
    name.replace('.sid', '.csrf'),
    csrfToken(nextSessionId),
    cookieAttributes('csrf', AUTH_SESSION_MAX_AGE_SECONDS),
  );

  return jsonOk({ created: true, user: toUserDTO(result.user) }, { status: 201 });
});
