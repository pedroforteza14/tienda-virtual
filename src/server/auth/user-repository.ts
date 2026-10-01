import { createHash, randomUUID } from 'node:crypto';
import type { Role } from '@/server/security/session';

/**
 * User storage.
 *
 * **[PRE-LAUNCH]** in-memory, so users vanish on restart. The interface is what
 * matters: a SQL implementation satisfies it with parameterised queries, and the
 * only lookup key is a hash of the normalised email, so nothing upstream
 * constructs a query string.
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
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

const users = new Map<string, User>();
const byEmail = new Map<string, string>();

export const inMemoryUsers: UserRepository = {
  async findByEmail(email) {
    const id = byEmail.get(emailKey(email));
    return id ? (users.get(id) ?? null) : null;
  },

  async findById(id) {
    // Validate the shape before using it as a key. Cheap here; essential once
    // this is a database and the id reaches a query.
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return users.get(id) ?? null;
  },

  async create({ name, email, passwordHash }) {
    const normalised = email.toLowerCase().trim();
    const key = emailKey(normalised);
    if (byEmail.has(key)) {
      // Caller must treat this as a generic failure, never surface it — see
      // docs/threat-model.md §4.3 on user enumeration.
      throw new UserExistsError();
    }
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
    users.set(user.id, user);
    byEmail.set(key, user.id);
    return user;
  },

  async updatePasswordHash(id, passwordHash) {
    const user = users.get(id);
    if (user) users.set(id, { ...user, passwordHash });
  },
};

export class UserExistsError extends Error {
  constructor() {
    super('user already exists');
    this.name = 'UserExistsError';
  }
}

export function userRepository(): UserRepository {
  return inMemoryUsers;
}

/** Test-only. */
export function resetUsers(): void {
  users.clear();
  byEmail.clear();
}
