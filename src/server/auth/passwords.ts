import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';
import { env } from '@/config/env';

/** Hand-rolled rather than `promisify`d: the callback overload that takes
 *  options is not expressible through `promisify`'s type definitions. */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/**
 * Password hashing with `scrypt`.
 *
 * Why scrypt and not Argon2id: Argon2id is the better choice, and the threat
 * model lists it as the pre-launch upgrade. scrypt ships in Node's standard
 * library, so it adds no native dependency and no supply-chain surface, and
 * correctly parameterised it is a perfectly respectable memory-hard KDF. An
 * unmaintained npm Argon2 binding would be a worse trade than well-tuned scrypt.
 *
 * Properties:
 *  - 16-byte random salt per user, so identical passwords hash differently and a
 *    rainbow table is useless;
 *  - parameters stored *in* the hash string, so they can be raised later and old
 *    hashes still verify (and can be upgraded on next login);
 *  - `timingSafeEqual` for comparison;
 *  - a bounded input length, so a 10 MB "password" cannot be used to burn CPU.
 */

interface ScryptParams {
  N: number;
  r: number;
  p: number;
  keylen: number;
}

/**
 * N = 2^15 (32 768) with r = 8 needs ~32 MiB per hash — the current OWASP
 * recommendation for scrypt. Tests use a much cheaper setting because the suite
 * verifies the *protocol* (salting, comparison, upgrade path), not the KDF's
 * cost factor, and 200 hashes at full strength would add minutes for nothing.
 */
const PRODUCTION_PARAMS: ScryptParams = { N: 32_768, r: 8, p: 1, keylen: 64 };
const TEST_PARAMS: ScryptParams = { N: 1_024, r: 8, p: 1, keylen: 64 };

function currentParams(): ScryptParams {
  return env().isTest ? TEST_PARAMS : PRODUCTION_PARAMS;
}

/** `scrypt$N$r$p$saltB64$hashB64` */
function serialise(params: ScryptParams, salt: Buffer, hash: Buffer): string {
  return [
    'scrypt',
    params.N,
    params.r,
    params.p,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

function parse(stored: string): { params: ScryptParams; salt: Buffer; hash: Buffer } | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts as [string, string, string, string, string, string];
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);

  // Bound the parsed cost factors: a tampered hash string must not be able to
  // ask us to allocate gigabytes.
  if (![N, r, p].every(Number.isInteger)) return null;
  if (N < 1_024 || N > 1_048_576 || r < 1 || r > 32 || p < 1 || p > 16) return null;

  const salt = Buffer.from(rawSalt, 'base64');
  const hash = Buffer.from(rawHash, 'base64');
  if (salt.byteLength < 8 || hash.byteLength < 32) return null;

  return { params: { N, r, p, keylen: hash.byteLength }, salt, hash };
}

async function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  return scrypt(password.normalize('NFKC'), salt, params.keylen, {
    N: params.N,
    r: params.r,
    p: params.p,
    // 128 · N · r, with headroom. Without this, Node's 32 MiB default refuses
    // the recommended parameters outright.
    maxmem: 256 * params.N * params.r,
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length > 1024) throw new Error('password too long to hash');
  const params = currentParams();
  const salt = randomBytes(16);
  return serialise(params, salt, await derive(password, salt, params));
}

/**
 * Verify a password.
 *
 * Returns `needsRehash` when the stored hash used weaker parameters than we use
 * now, so the caller can transparently upgrade it on a successful login.
 *
 * On a malformed stored hash it still performs a dummy derivation before
 * returning false, so "no such user" and "wrong password" cost the same —
 * otherwise response time leaks which accounts exist.
 */
export async function verifyPassword(
  password: string,
  stored: string | null,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  const parsed = stored ? parse(stored) : null;

  if (!parsed) {
    const params = currentParams();
    await derive(password, Buffer.alloc(16), params);
    return { valid: false, needsRehash: false };
  }

  const candidate = await derive(password, parsed.salt, parsed.params);

  const valid =
    candidate.byteLength === parsed.hash.byteLength && timingSafeEqual(candidate, parsed.hash);

  const target = currentParams();
  return { valid, needsRehash: valid && parsed.params.N < target.N };
}

/**
 * A hash to compare against when the account does not exist, so the login path
 * does the same work either way.
 *
 * Lazy and memoised, deliberately. As a module-level `const` this ran during
 * Next's build-time page-data collection, which calls `env()` with
 * `NODE_ENV=production` and no `SESSION_SECRET` present — and so failed the build.
 * A module must not read configuration as a side effect of being imported; that is
 * a deployment hazard well beyond this one symptom.
 */
let dummyHash: Promise<string> | null = null;

export function dummyHashPromise(): Promise<string> {
  dummyHash ??= hashPassword('owner-store-nonexistent-account');
  return dummyHash;
}
