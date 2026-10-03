import { createHash, randomUUID } from 'node:crypto';
import { store } from '@/server/store';
import type { Role } from '@/server/security/session';

/**
 * User storage, in the shared store.
 *
 * Two keys per user:
 *
 *   `user:<id>`            → the record
 *   `user:email:<sha256>`  → the id, used as the login lookup
 *
 * The email is hashed rather than used directly as a key for two reasons. It
 * keeps a plaintext address out of the key space — keys turn up in slow-query
 * logs, monitoring dashboards and `SCAN` output, where an email address is
 * personal data we have no reason to spread. And it makes every key a fixed-
 * length hex string, so nothing a user types can shape a key: no separator
 * injection, no length limit to enforce, no normalisation surprise.
 */

export interface User {
  id: string;
  name: string;
  /** Normalised (lowercased, trimmed). Stored for display and contact only. */
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(input: { name: string; email: string; passwordHash: string }): Promise<User>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
}

function emailKey(email: string): string {
  return `user:email:${createHash('sha256').update(email.toLowerCase().trim()).digest('hex')}`;
}

function userKey(id: string): string {
  return `user:${id}`;
}

const ROLES: readonly Role[] = ['customer', 'admin'];

function parseUser(raw: string | null): User | null {
  if (!raw) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!decoded || typeof decoded !== 'object') return null;

  const value = decoded as Record<string, unknown>;
  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.email !== 'string' ||
    typeof value.passwordHash !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.role !== 'string' ||
    !ROLES.includes(value.role as Role)
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    email: value.email,
    passwordHash: value.passwordHash,
    role: value.role as Role,
    createdAt: value.createdAt,
  };
}

export const storeUsers: UserRepository = {
  async findByEmail(email) {
    const id = await store().get(emailKey(email));
    return id ? this.findById(id) : null;
  },

  async findById(id) {
    // Validate the shape before using it as a key. The store is not a SQL
    // database, so this is not injection defence — it is a cheap guard against
    // a caller passing something that was never an id and getting a hit on a
    // key in another namespace.
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return parseUser(await store().get(userKey(id)));
  },

  async create({ name, email, passwordHash }) {
    const normalised = email.toLowerCase().trim();
    const key = emailKey(normalised);
    const user: User = {
      id: randomUUID(),
      name,
      email: normalised,
      passwordHash,
      // Roles are never taken from input. A new account is always a customer;
      // promotion is an out-of-band operation.
      role: 'customer',
      createdAt: new Date().toISOString(),
    };

    const kv = store();

    // Claim the address first, conditionally. `ifAbsent` is a single atomic
    // operation, so two simultaneous signups for the same address cannot both
    // win — which a read-then-write would allow, leaving one account
    // unreachable because the email index points at the other.
    const claimed = await kv.set(key, user.id, { ifAbsent: true });
    if (!claimed) {
      // Caller must treat this as a generic failure, never surface it — see
      // docs/threat-model.md §4.3 on user enumeration.
      throw new UserExistsError();
    }

    try {
      await kv.set(userKey(user.id), JSON.stringify(user));
    } catch (error) {
      // Release the claim, or the address is permanently unregisterable.
      await kv.delete(key);
      throw error;
    }

    return user;
  },

  async updatePasswordHash(id, passwordHash) {
    const kv = store();
    const existing = parseUser(await kv.get(userKey(id)));
    if (!existing) return;
    await kv.set(userKey(id), JSON.stringify({ ...existing, passwordHash }));
  },
};

export class UserExistsError extends Error {
  constructor() {
    super('user already exists');
    this.name = 'UserExistsError';
  }
}

export function userRepository(): UserRepository {
  return storeUsers;
}
