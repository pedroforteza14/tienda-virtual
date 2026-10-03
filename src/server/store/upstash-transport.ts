import type { RedisArg, RedisTransport } from '@/server/store/redis-store';

/**
 * Upstash REST transport.
 *
 * One HTTPS request per command: the body is the command as a JSON array, the
 * reply is `{"result": …}` or `{"error": "…"}`. There is no connection to open,
 * pool, or leak, which is the only reason this works from a function that may be
 * frozen mid-request and resumed on another machine.
 *
 * Three things here are load-bearing:
 *
 *  - **The token never leaves this file.** It goes in an `Authorization` header
 *    built from `env()`, which is server-only and un-inlinable into client
 *    bundles. No error raised here includes the URL or the token, because
 *    `RedisStoreError` messages can reach a log aggregator.
 *  - **Errors are translated, not forwarded.** An Upstash error string can
 *    contain the command that failed, and commands carry session ids and order
 *    references. Only the command *name* is kept.
 *  - **Requests time out.** A hung fetch in a serverless function burns the
 *    whole invocation budget and the user sees a platform 504 instead of our
 *    error page. `AbortSignal.timeout` bounds it.
 */

export class UpstashError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstashError';
  }
}

export interface UpstashOptions {
  url: string;
  token: string;
  /** Per-request budget. Redis replies in single-digit ms; this is a backstop. */
  timeoutMs?: number;
  /** Retries for a transport-level failure. Not for command errors. */
  retries?: number;
  fetchImpl?: typeof fetch;
}

interface UpstashReply {
  result?: unknown;
  error?: string;
}

export function createUpstashTransport(options: UpstashOptions): RedisTransport {
  const base = options.url.replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? 4_000;
  const retries = options.retries ?? 1;
  const doFetch = options.fetchImpl ?? fetch;

  async function post(path: string, body: unknown): Promise<unknown> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await doFetch(`${base}${path}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
          // Redis replies are never cacheable, and Next patches `fetch` to cache
          // by default inside a render.
          cache: 'no-store',
        });

        if (!response.ok) {
          // The status alone, never the body: an Upstash error body echoes the
          // command, and commands carry session ids and order references.
          throw new UpstashError(`redis transport failed with status ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        lastError = error;
        // A command that Redis rejected is not going to succeed on a retry.
        if (error instanceof UpstashError) throw error;
        if (attempt === retries) break;
        // One short backoff. Anything longer and we are better off failing: the
        // request already has a user waiting on the other end of it.
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }

    throw new UpstashError(
      lastError instanceof Error && lastError.name === 'TimeoutError'
        ? `redis transport timed out after ${timeoutMs}ms`
        : 'redis transport is unreachable',
    );
  }

  function unwrap(reply: unknown, commandName: string): unknown {
    if (!reply || typeof reply !== 'object') {
      throw new UpstashError(`malformed reply to ${commandName}`);
    }
    const { result, error } = reply as UpstashReply;
    if (typeof error === 'string') {
      // Only the command name survives — see the note on leakage above.
      throw new UpstashError(`redis rejected ${commandName}`);
    }
    return result ?? null;
  }

  return {
    label: 'upstash',

    async exec(command) {
      const name = String(command[0] ?? 'UNKNOWN');
      return unwrap(await post('', command.map(String)), name);
    },

    async pipeline(commands) {
      if (commands.length === 0) return [];
      const payload = commands.map((command) => command.map(String));
      const reply = await post('/pipeline', payload);
      if (!Array.isArray(reply)) {
        throw new UpstashError('malformed pipeline reply');
      }
      return reply.map((entry, index) =>
        unwrap(entry, String(commands[index]?.[0] ?? 'UNKNOWN')),
      );
    },
  };
}

export type { RedisArg };
