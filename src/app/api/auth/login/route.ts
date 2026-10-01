import { cookies } from 'next/headers';
import { AUTH_SESSION_MAX_AGE_SECONDS } from '@/config/constants';
import { LoginSchema } from '@/lib/validation/schemas';
import { guarded, jsonError, jsonOk } from '@/server/security/guard';
import { login, toUserDTO } from '@/server/auth/auth-service';
import { cookieAttributes, cookieName } from '@/server/security/cookies';
import { createSessionId, csrfToken, endAuthSession, signSessionId } from '@/server/security/session';

/**
 * Log in.
 *
 * Defences, layered, because this is where credential stuffing lands:
 *  - rate limited per client by `guarded` (5 attempts / 5 min);
 *  - locked out per **account** after 8 failures, which an attacker cannot evade
 *    by rotating IP addresses;
 *  - one generic message for every failure — never "no such user" or "wrong
 *    password";
 *  - a key derivation runs even when the account does not exist, so response time
 *    does not distinguish the two cases;
 *  - the session id is rotated on success, which is what prevents session fixation.
 */
export const POST = guarded({ bucket: 'login', schema: LoginSchema }, async ({ data, sessionId, requestId }) => {
  const nextSessionId = createSessionId();
  const result = await login(data.email, data.password, nextSessionId);

  if (!result.ok) {
    if (result.reason === 'locked') {
      return jsonError('rate_limited', {
        requestId,
        message: 'Demasiados intentos. Probá de nuevo en 15 minutos.',
        ...(result.retryAfter ? { headers: { 'Retry-After': String(result.retryAfter) } } : {}),
      });
    }
    // Identical for "unknown email" and "wrong password".
    return jsonError('unauthorized', { requestId, message: 'Email o contraseña incorrectos.' });
  }

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

  return jsonOk({ user: toUserDTO(result.user) });
});
