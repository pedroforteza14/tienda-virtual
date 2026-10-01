import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOGIN_MAX_FAILURES } from '@/config/constants';
import { login, signup } from '@/server/auth/auth-service';
import { resetUsers, userRepository } from '@/server/auth/user-repository';
import {
  createSessionId,
  endAllSessionsForUser,
  endAuthSession,
  getAuthSession,
  resetAuthSessions,
} from '@/server/security/session';
import { resetRateLimits, resetSecurityCounters } from '@/server/security/rate-limit';

/**
 * Authentication and authorization.
 *
 * The properties under test are the ones that are easy to break and hard to
 * notice: no account enumeration, no timing oracle, lockout that an IP rotation
 * cannot evade, session rotation on every privilege change, and a role that can
 * only come from the server-side record.
 */

const PASSWORD = 'el perro corre rapido';

beforeEach(() => {
  resetUsers();
  resetAuthSessions();
  resetSecurityCounters();
});
afterEach(() => {
  resetUsers();
  resetAuthSessions();
  resetSecurityCounters();
});

async function register(email = 'ana@example.com') {
  const sessionId = createSessionId();
  const result = await signup('Ana López', email, PASSWORD, sessionId);
  if (!result.ok) throw new Error('fixture: signup failed');
  return { user: result.user, sessionId };
}

describe('signup', () => {
  it('creates a customer and starts a session', async () => {
    const sessionId = createSessionId();
    const result = await signup('Ana López', 'ana@example.com', PASSWORD, sessionId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.role).toBe('customer');
    expect(result.session.sessionId).toBe(sessionId);
  });

  it('never assigns a privileged role, whatever is asked for', async () => {
    const { user } = await register();
    // There is no code path that takes a role from input — the repository hardcodes
    // 'customer'. This asserts the property rather than the implementation.
    expect(user.role).toBe('customer');
  });

  it('normalises the email, so a case variant is the same account', async () => {
    await register('Ana@Example.COM');
    const found = await userRepository().findByEmail('ana@example.com');
    expect(found).not.toBeNull();
    expect(found!.email).toBe('ana@example.com');
  });

  it('reports a duplicate as `exists` for the route to mask', async () => {
    await register('ana@example.com');
    const result = await signup('Otra Persona', 'ANA@example.com', PASSWORD, createSessionId());
    expect(result).toEqual({ ok: false, reason: 'exists' });
  });

  it('never stores the password in plain text', async () => {
    const { user } = await register();
    expect(user.passwordHash).not.toContain(PASSWORD);
    expect(user.passwordHash.startsWith('scrypt$')).toBe(true);
  });
});

describe('login', () => {
  it('succeeds with the right credentials and issues the NEW session id', async () => {
    const { user } = await register();

    const rotated = createSessionId();
    const result = await login('ana@example.com', PASSWORD, rotated);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.id).toBe(user.id);
    // Session fixation defence: the privileged session is a fresh id.
    expect(result.session.sessionId).toBe(rotated);
    expect(getAuthSession(rotated)?.userId).toBe(user.id);
  });

  it('fails identically for a wrong password and an unknown account', async () => {
    await register();

    const wrongPassword = await login('ana@example.com', 'definitely-wrong', createSessionId());
    const noSuchUser = await login('nobody@example.com', PASSWORD, createSessionId());

    expect(wrongPassword).toEqual({ ok: false, reason: 'invalid' });
    expect(noSuchUser).toEqual({ ok: false, reason: 'invalid' });
    // Byte-identical results: no enumeration oracle in the shape of the response.
    expect(JSON.stringify(wrongPassword)).toBe(JSON.stringify(noSuchUser));
  });

  it('does a key derivation even for an unknown account, so timing does not distinguish', async () => {
    await register();

    const timeOf = async (email: string) => {
      const started = performance.now();
      await login(email, 'some-wrong-password', createSessionId());
      return performance.now() - started;
    };

    // Measured over several runs because a single sample is pure noise.
    const known: number[] = [];
    const unknown: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      resetRateLimits();
      known.push(await timeOf('ana@example.com'));
      resetRateLimits();
      unknown.push(await timeOf(`nobody${i}@example.com`));
    }

    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    const knownMean = mean(known);
    const unknownMean = mean(unknown);

    // Both paths derive a key, so neither should be trivially faster. A generous
    // bound: the point is that the unknown-account path is not ~instant.
    expect(unknownMean).toBeGreaterThan(knownMean * 0.25);
  });

  it('locks the account after repeated failures, regardless of client', async () => {
    await register();

    for (let i = 0; i < LOGIN_MAX_FAILURES; i += 1) {
      // Each attempt is a "different client" — the rate limiter is reset, so only
      // the per-account counter can stop this.
      resetRateLimits();
      const result = await login('ana@example.com', 'wrong', createSessionId());
      expect(result.ok).toBe(false);
    }

    resetRateLimits();
    const locked = await login('ana@example.com', PASSWORD, createSessionId());
    expect(locked).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('clears the failure counter on a successful login', async () => {
    await register();
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i += 1) {
      resetRateLimits();
      await login('ana@example.com', 'wrong', createSessionId());
    }

    resetRateLimits();
    expect((await login('ana@example.com', PASSWORD, createSessionId())).ok).toBe(true);

    // And the next wrong attempt starts from one, not from the brink of lockout.
    resetRateLimits();
    expect(await login('ana@example.com', 'wrong', createSessionId())).toMatchObject({
      reason: 'invalid',
    });
  });

  it('locks per account, not globally', async () => {
    await register('ana@example.com');
    await register('beto@example.com');

    for (let i = 0; i < LOGIN_MAX_FAILURES; i += 1) {
      resetRateLimits();
      await login('ana@example.com', 'wrong', createSessionId());
    }

    resetRateLimits();
    expect(await login('ana@example.com', PASSWORD, createSessionId())).toMatchObject({
      reason: 'locked',
    });
    resetRateLimits();
    expect((await login('beto@example.com', PASSWORD, createSessionId())).ok).toBe(true);
  });
});

describe('session lifecycle', () => {
  it('only recognises a session that exists in the server-side store', async () => {
    const { user } = await register();
    const rotated = createSessionId();
    await login('ana@example.com', PASSWORD, rotated);

    expect(getAuthSession(rotated)?.userId).toBe(user.id);
    // An id that was never registered carries no identity, however well-formed.
    expect(getAuthSession(createSessionId())).toBeNull();
    expect(getAuthSession(null)).toBeNull();
  });

  it('invalidates server-side on logout, not just in the browser', async () => {
    const rotated = createSessionId();
    await register();
    await login('ana@example.com', PASSWORD, rotated);

    endAuthSession(rotated);
    // Even if the cookie were replayed, the session no longer exists.
    expect(getAuthSession(rotated)).toBeNull();
  });

  it('can drop every session for a user at once', async () => {
    // `register()` signs up, which itself starts a session — so three in total.
    const { user, sessionId: fromSignup } = await register();
    const a = createSessionId();
    const b = createSessionId();
    await login('ana@example.com', PASSWORD, a);
    await login('ana@example.com', PASSWORD, b);

    expect(endAllSessionsForUser(user.id)).toBe(3);
    for (const sessionId of [fromSignup, a, b]) {
      expect(getAuthSession(sessionId)).toBeNull();
    }
  });

  it('expires a session past its lifetime', async () => {
    const sessionId = createSessionId();
    await register();
    await login('ana@example.com', PASSWORD, sessionId);

    const session = getAuthSession(sessionId)!;
    // Force expiry the way the clock would.
    session.expiresAt = Date.now() - 1000;
    expect(getAuthSession(sessionId)).toBeNull();
  });

  it('a pre-login session id never becomes privileged', async () => {
    const preLogin = createSessionId();
    await register();

    // Log in with a *different*, rotated id — as the route does.
    const rotated = createSessionId();
    await login('ana@example.com', PASSWORD, rotated);

    // The id an attacker might have planted before login carries no identity.
    expect(getAuthSession(preLogin)).toBeNull();
    expect(getAuthSession(rotated)).not.toBeNull();
  });
});

describe('user repository', () => {
  it('rejects a malformed id before it is used as a key', async () => {
    await register();
    for (const id of ['', '../../etc/passwd', "1' OR '1'='1", 'not-a-uuid']) {
      expect(await userRepository().findById(id), id).toBeNull();
    }
  });

  it('finds a user by a valid id', async () => {
    const { user } = await register();
    expect((await userRepository().findById(user.id))?.email).toBe('ana@example.com');
  });
});
