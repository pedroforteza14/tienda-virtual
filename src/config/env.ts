import { z } from 'zod';

/**
 * Server-side environment. **Import this only from server code.**
 *
 * Two jobs:
 *  1. Fail fast and loudly in production if a security-critical value is
 *     missing, rather than silently falling back to a development default.
 *     A deploy that boots without `SESSION_SECRET` is worse than one that
 *     refuses to boot.
 *  2. Keep secrets structurally unable to reach the client. Nothing here is
 *     prefixed `NEXT_PUBLIC_`, so Next's bundler cannot inline any of it into
 *     browser JS. Public values live in `src/config/site.ts`.
 */

const base64Secret = z
  .string()
  .min(32, 'must be at least 32 characters of base64')
  .refine((v) => Buffer.from(v, 'base64').byteLength >= 32, {
    message: 'must decode to at least 32 bytes of entropy',
  });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SITE_URL: z.string().url(),

  SESSION_SECRET: base64Secret.optional(),

  PAYMENT_PROVIDER: z.enum(['mock', 'mercadopago', 'stripe']).default('mock'),
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  RATE_LIMIT_DRIVER: z.enum(['memory', 'upstash']).default('memory'),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

type Env = z.infer<typeof schema> & {
  /** Origins allowed to make state-changing requests. See docs/threat-model.md §4.9. */
  allowedOrigins: readonly string[];
  isProduction: boolean;
  isTest: boolean;
};

/**
 * Development-only session secret. It is a constant, so it is worthless as a
 * secret — which is the point: it can never be mistaken for one, and production
 * refuses to start without a real value.
 */
const DEV_SESSION_SECRET = Buffer.from(
  'owner-store-development-only-session-secret-not-a-real-secret',
).toString('base64');

function load(): Env {
  const parsed = schema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
    SESSION_SECRET: process.env.SESSION_SECRET || undefined,
    PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER,
    MERCADOPAGO_ACCESS_TOKEN: process.env.MERCADOPAGO_ACCESS_TOKEN || undefined,
    MERCADOPAGO_WEBHOOK_SECRET: process.env.MERCADOPAGO_WEBHOOK_SECRET || undefined,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || undefined,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || undefined,
    RATE_LIMIT_DRIVER: process.env.RATE_LIMIT_DRIVER,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || undefined,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || undefined,
    LOG_LEVEL: process.env.LOG_LEVEL,
  });

  if (!parsed.success) {
    // Field names only — never the values, which may be partial secrets.
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration. Check: ${fields}`);
  }

  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';

  if (isProduction) {
    if (!env.SESSION_SECRET) {
      throw new Error(
        'SESSION_SECRET is required in production. Generate one with: ' +
          'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
      );
    }
    if (!env.SITE_URL.startsWith('https://')) {
      throw new Error('NEXT_PUBLIC_SITE_URL must be an https:// origin in production');
    }
    if (env.PAYMENT_PROVIDER === 'mercadopago' && !env.MERCADOPAGO_WEBHOOK_SECRET) {
      throw new Error('MERCADOPAGO_WEBHOOK_SECRET is required: unverified webhooks are refused');
    }
    if (env.PAYMENT_PROVIDER === 'stripe' && !env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('STRIPE_WEBHOOK_SECRET is required: unverified webhooks are refused');
    }
    if (env.RATE_LIMIT_DRIVER === 'memory') {
      // A warning, not a failure: a single-instance deploy is legitimate.
      // Behind more than one replica it is a real gap. See docs/SECURITY.md.
      console.warn(
        '[owner] RATE_LIMIT_DRIVER=memory is per-instance only and does not ' +
          'rate-limit correctly behind multiple replicas.',
      );
    }
  }

  return {
    ...env,
    SESSION_SECRET: env.SESSION_SECRET ?? DEV_SESSION_SECRET,
    isProduction,
    isTest: env.NODE_ENV === 'test',
    allowedOrigins: Object.freeze([new URL(env.SITE_URL).origin]),
  };
}

let cached: Env | null = null;

/** Lazy so that merely importing a module never throws at build-collection time. */
export function env(): Env {
  cached ??= load();
  return cached;
}

/** Test-only: forget the memoised value after mutating `process.env`. */
export function resetEnvCache(): void {
  cached = null;
}
