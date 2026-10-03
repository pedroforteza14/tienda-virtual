import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_SESSION_MAX_AGE_SECONDS, LOGIN_MAX_FAILURES } from '@/config/constants';
import { login, signup } from '@/server/auth/auth-service';
import { userRepository } from '@/server/auth/user-repository';
import {
  createSessionId,
  endAllSessionsForUser,
  endAuthSession,
  getAuthSession,
} from '@/server/security/session';
import { resetStore } from '@/server/store';

/**
 * Authentication and authorization.
 *
 * The properties under test are the ones that are easy to break and hard to
 * notice: no account enumeration, no timing oracle, lockout that an IP rotation
 * cannot evade, session rotation on every privilege change, and a role that can
 * only come from the server-side record.
 */

const PASSWORD = 'el perro corre rapido';

beforeEach(async () => resetStore());
afterEach(async () => resetStore());

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
    expect((await getAuthSession(rotated))?.userId).toBe(user.id);
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
      known.push(await timeOf('ana@example.com'));
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
      const result = await login('ana@example.com', 'wrong', createSessionId());
      expect(result.ok).toBe(false);
    }

    const locked = await login('ana@example.com', PASSWORD, createSessionId());
    expect(locked).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('clears the failure counter on a successful login', async () => {
    await register();
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i += 1) {
      await login('ana@example.com', 'wrong', createSessionId());
    }

    expect((await login('ana@example.com', PASSWORD, createSessionId())).ok).toBe(true);

    // And the next wrong attempt starts from one, not from the brink of lockout.
    expect(await login('ana@example.com', 'wrong', createSessionId())).toMatchObject({
      reason: 'invalid',
    });
  });

  it('locks per account, not globally', async () => {
    await register('ana@example.com');
    await register('beto@example.com');

    for (let i = 0; i < LOGIN_MAX_FAILURES; i += 1) {
      await login('ana@example.com', 'wrong', createSessionId());
    }

    expect(await login('ana@example.com', PASSWORD, createSessionId())).toMatchObject({
      reason: 'locked',
    });
    expect((await login('beto@example.com', PASSWORD, createSessionId())).ok).toBe(true);
  });
});

describe('session lifecycle', () => {
  it('only recognises a session that exists in the server-side store', async () => {
    const { user } = await register();
    const rotated = createSessionId();
    await login('ana@example.com', PASSWORD, rotated);

    expect((await getAuthSession(rotated))?.userId).toBe(user.id);
    // An id that was never registered carries no identity, however well-formed.
    expect(await getAuthSession(createSessionId())).toBeNull();
    expect(await getAuthSession(null)).toBeNull();
  });

  it('invalidates server-side on logout, not just in the browser', async () => {
    const rotated = createSessionId();
    await register();
    await login('ana@example.com', PASSWORD, rotated);

    await endAuthSession(rotated);
    // Even if the cookie were replayed, the session no longer exists.
    expect(await getAuthSession(rotated)).toBeNull();
  });

  it('can drop every session for a user at once', async () => {
    // `register()` signs up, which itself starts a session — so three in total.
    const { user, sessionId: fromSignup } = await register();
    const a = createSessionId();
    const b = createSessionId();
    await login('ana@example.com', PASSWORD, a);
    await login('ana@example.com', PASSWORD, b);

    expect(await endAllSessionsForUser(user.id)).toBe(3);
    for (const sessionId of [fromSignup, a, b]) {
      expect(await getAuthSession(sessionId)).toBeNull();
    }
  });

  /**
   * This used to reach into the returned object and move its `expiresAt` back,
   * which worked only because the object *was* the stored record. It is now a
   * copy parsed out of the store, so mutating it proves nothing. Moving the
   * clock is both the honest version and a stronger one: it exercises the
   * expiry check against a record the test never touched.
   */
  it('expires a session past its lifetime', async () => {
    vi.useFakeTimers();
    try {
      const sessionId = createSessionId();
      await register();
      await login('ana@example.com', PASSWORD, sessionId);
      expect(await getAuthSession(sessionId)).not.toBeNull();

      vi.advanceTimersByTime((AUTH_SESSION_MAX_AGE_SECONDS + 1) * 1000);
      expect(await getAuthSession(sessionId)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a pre-login session id never becomes privileged', async () => {
    const preLogin = createSessionId();
    await register();

    // Log in with a *different*, rotated id — as the route does.
    const rotated = createSessionId();
    await login('ana@example.com', PASSWORD, rotated);

    // The id an attacker might have planted before login carries no identity.
    expect(await getAuthSession(preLogin)).toBeNull();
    expect(await getAuthSession(rotated)).not.toBeNull();
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
