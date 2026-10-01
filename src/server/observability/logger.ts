import { createHash, randomUUID } from 'node:crypto';
import { env } from '@/config/env';

/**
 * Structured logging with mandatory redaction.
 *
 * The rule from docs/threat-model.md §4.8: a log line is a place secrets leak
 * to. Logs get shipped to third parties, read by contractors, and pasted into
 * tickets. So redaction is not a caller's responsibility — it happens here, on
 * the way out, by key name, recursively, and it cannot be opted out of.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;

/**
 * Keys whose values are replaced wholesale. Matched case-insensitively as a
 * substring, so `userPassword`, `access_token` and `X-Authorization` are all hit.
 */
const REDACT_KEYS = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'cookie',
  'session',
  'csrf',
  'card',
  'cvv',
  'cvc',
  'pan',
  'dni',
  'cuit',
  'signature',
  'apikey',
  'api_key',
  'accesstoken',
  'privatekey',
];

/** Emails are useful for correlation and harmful to store. Hash, don't drop. */
const HASH_KEYS = ['email', 'phone'];

const REDACTED = '[redacted]';
const MAX_DEPTH = 6;
const MAX_STRING = 512;

function pseudonymise(value: string): string {
  return `sha256:${createHash('sha256').update(value.toLowerCase().trim()).digest('hex').slice(0, 16)}`;
}

function matches(key: string, list: string[]): boolean {
  const normalised = key.toLowerCase().replace(/[-_]/g, '');
  return list.some((candidate) => normalised.includes(candidate.replace(/[-_]/g, '')));
}

function sanitise(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[depth-limit]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return '[unloggable]';

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      // Stack traces stay server-side only; they never reach a response body.
      stack: env().isProduction ? undefined : value.stack?.split('\n').slice(0, 8).join('\n'),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitise(item, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (matches(key, REDACT_KEYS)) {
        out[key] = REDACTED;
      } else if (matches(key, HASH_KEYS) && typeof raw === 'string') {
        out[key] = pseudonymise(raw);
      } else {
        out[key] = sanitise(raw, depth + 1);
      }
    }
    return out;
  }

  return '[unloggable]';
}

export interface LogContext {
  /** Correlates a log line with the error reference the client was given. */
  requestId?: string;
  [key: string]: unknown;
}

function write(level: LogLevel, message: string, context?: LogContext): void {
  if (LEVELS[level] < LEVELS[env().LOG_LEVEL]) return;

  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(context ? (sanitise(context) as Record<string, unknown>) : {}),
  };

  const serialised = JSON.stringify(line);
  if (level === 'error') process.stderr.write(`${serialised}\n`);
  else process.stdout.write(`${serialised}\n`);
}

export const logger = {
  debug: (message: string, context?: LogContext) => write('debug', message, context),
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext) => write('error', message, context),

  /**
   * Security-relevant events. Separated so they can be routed to their own sink
   * and alerted on — these are the detection signal in docs/threat-model.md §6.
   */
  security: (
    event:
      | 'auth.login.success'
      | 'auth.login.failure'
      | 'auth.login.locked'
      | 'auth.signup'
      | 'auth.logout'
      | 'authz.denied'
      | 'ratelimit.exceeded'
      | 'csrf.rejected'
      | 'origin.rejected'
      | 'webhook.signature.invalid'
      | 'webhook.replay'
      | 'webhook.amount.mismatch'
      | 'order.created'
      | 'order.paid'
      | 'input.rejected'
      | 'body.too.large',
    context?: LogContext,
  ) => write(event.includes('success') || event === 'auth.signup' ? 'info' : 'warn', `security.${event}`, {
    ...context,
    security: true,
  }),
};

/** A short, safe id handed to the client and attached to every related log line. */
export function newRequestId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

/** Exported for the logger's own tests. */
export const __testing = { sanitise, pseudonymise };
