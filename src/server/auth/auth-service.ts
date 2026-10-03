import { LOGIN_LOCKOUT_SECONDS, LOGIN_MAX_FAILURES } from '@/config/constants';
import { logger } from '@/server/observability/logger';
import { dummyHashPromise, hashPassword, verifyPassword } from '@/server/auth/passwords';
import { UserExistsError, userRepository, type User } from '@/server/auth/user-repository';
import { clearFailures, failureCount, recordFailure } from '@/server/security/rate-limit';
import { startAuthSession, type AuthSession } from '@/server/security/session';

/**
 * Authentication.
 *
 * Two behaviours are load-bearing and easy to get wrong:
 *
 *  1. **No user enumeration.** Login and signup must not reveal whether an email
 *     is registered — not in the message, not in the status code, and not in the
 *     response time. So login always performs a key derivation (against a dummy
 *     hash when the account does not exist), and signup returns success-shaped
 *     output for an existing address instead of a conflict.
 *  2. **Session fixation is prevented by rotation.** The caller is handed a
 *     *new* session id on login and on logout, and must set it. A session id
 *     that survives a privilege change is a session an attacker could have
 *     planted before it became privileged.
 */

export type LoginResult =
  | { ok: true; user: User; session: AuthSession }
  | { ok: false; reason: 'invalid' | 'locked'; retryAfter?: number };

function lockKey(email: string): string {
  return `login:${email.toLowerCase().trim()}`;
}

/**
 * @param newSessionId A freshly generated id. The caller sets it as a cookie —
 *        this function never reuses the id the request arrived with.
 */
export async function login(
  email: string,
  password: string,
  newSessionId: string,
): Promise<LoginResult> {
  const key = lockKey(email);

  // Per-account lockout, in addition to the per-client rate limit. The limiter
  // alone is bypassable by rotating IPs; this is not.
  if ((await failureCount(key)) >= LOGIN_MAX_FAILURES) {
    logger.security('auth.login.locked', { email });
    return { ok: false, reason: 'locked', retryAfter: LOGIN_LOCKOUT_SECONDS };
  }

  const repo = userRepository();
  const user = await repo.findByEmail(email);

  // Always derive, even with no user, so timing does not distinguish the cases.
  const stored = user?.passwordHash ?? (await dummyHashPromise());
  const { valid, needsRehash } = await verifyPassword(password, stored);

  if (!user || !valid) {
    const failures = await recordFailure(key, LOGIN_LOCKOUT_SECONDS);
    logger.security('auth.login.failure', { email, failures });
    return { ok: false, reason: 'invalid' };
  }

  await clearFailures(key);

  if (needsRehash) {
    // Transparent upgrade when KDF parameters have been raised since signup.
    await repo.updatePasswordHash(user.id, await hashPassword(password));
  }

  const session = await startAuthSession(newSessionId, user.id, user.role);
  logger.security('auth.login.success', { userId: user.id, email });

  return { ok: true, user, session };
}

export type SignupResult =
  | { ok: true; user: User; session: AuthSession }
  | { ok: false; reason: 'exists' };

export async function signup(
  name: string,
  email: string,
  password: string,
  newSessionId: string,
): Promise<SignupResult> {
  const repo = userRepository();
  const passwordHash = await hashPassword(password);

  try {
    const user = await repo.create({ name, email, passwordHash });
    const session = await startAuthSession(newSessionId, user.id, user.role);
    logger.security('auth.signup', { userId: user.id, email });
    return { ok: true, user, session };
  } catch (error) {
    if (error instanceof UserExistsError) {
      // The route maps this to the same response as success. We log it so real
      // abuse is still visible server-side.
      logger.security('auth.signup', { email, duplicate: true });
      return { ok: false, reason: 'exists' };
    }
    throw error;
  }
}

/** The DTO that crosses to the browser. No hash, no role beyond what the UI needs. */
export function toUserDTO(user: User): { name: string; email: string } {
  return { name: user.name, email: user.email };
}
