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

  /**
   * Where mutable server state lives. `memory` is one process; `upstash` is a
   * shared Redis and the only correct answer on a platform that runs more than
   * one instance of this app — which includes every serverless host.
   *
   * This was `RATE_LIMIT_DRIVER` while rate limiting was the only shared thing.
   * It now also decides where sessions, users, orders, stock reservations and
   * the webhook log are kept, so the old name said something false.
   */
  STORE_DRIVER: z.enum(['memory', 'upstash']).default('memory'),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  /** Key namespace, so one Redis database can serve several environments. */
  STORE_PREFIX: z.string().min(1).max(64).default('owner:'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

type Env = z.infer<typeof schema> & {
  /**
   * Origins allowed to make state-changing requests. See docs/threat-model.md §4.9.
   *
   * The origin of `SITE_URL` — a build-time constant — plus any host the
   * platform says this deployment is served from. See `platformOrigins`.
   */
  allowedOrigins: readonly string[];
  isProduction: boolean;
  isTest: boolean;
  /**
   * Whether we are actually served over a secure origin.
   *
   * This — not `NODE_ENV` — is what decides the `Secure` attribute and the
   * `__Host-` cookie prefix. `NODE_ENV=production` says how the code was built;
   * it says nothing about the transport. A production build smoke-tested on
   * `http://127.0.0.1` would otherwise be issued `Secure; __Host-` cookies that
   * the browser may refuse, and the session would silently never persist.
   */
  isSecureOrigin: boolean;
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
    STORE_DRIVER: process.env.STORE_DRIVER,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || undefined,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || undefined,
    STORE_PREFIX: process.env.STORE_PREFIX || undefined,
    LOG_LEVEL: process.env.LOG_LEVEL,
  });

  if (!parsed.success) {
    // Field names only — never the values, which may be partial secrets.
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration. Check: ${fields}`);
  }

  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';

  /**
   * `next build` runs with `NODE_ENV=production` but **without runtime secrets**:
   * CI compiles assets, and the secret is injected by the host when the app
   * serves. Throwing here would make it impossible to build without production
   * credentials, which is both inconvenient and bad practice — a build artefact
   * should not need them.
   *
   * So during the build phase these become warnings; at request time they still
   * throw. The security property is unchanged: a running production server
   * refuses to serve without a real `SESSION_SECRET`.
   */
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

  if (isProduction && isBuildPhase) {
    const missing = [
      !env.SESSION_SECRET && 'SESSION_SECRET',
      !env.SITE_URL.startsWith('https://') &&
        !isLoopback(env.SITE_URL) &&
        'NEXT_PUBLIC_SITE_URL (must be https)',
    ].filter(Boolean);
    if (missing.length > 0) {
      console.warn(
        `[owner] building without: ${missing.join(', ')}. ` +
          'These are required at runtime and the server will refuse to start without them.',
      );
    }
  }

  if (isProduction && !isBuildPhase) {
    if (!env.SESSION_SECRET) {
      throw new Error(
        'SESSION_SECRET is required in production. Generate one with: ' +
          'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
      );
    }
    // https is required for a real deployment, but a production build is also how
    // you smoke-test and how the e2e suite runs — both on loopback over http, which
    // browsers already treat as a trustworthy origin. Refusing those would push
    // people toward testing a different build than they ship.
    if (!env.SITE_URL.startsWith('https://') && !isLoopback(env.SITE_URL)) {
      throw new Error(
        'NEXT_PUBLIC_SITE_URL must be an https:// origin in production ' +
          '(http is allowed only for localhost/127.0.0.1).',
      );
    }
    if (env.PAYMENT_PROVIDER === 'mercadopago' && !env.MERCADOPAGO_WEBHOOK_SECRET) {
      throw new Error('MERCADOPAGO_WEBHOOK_SECRET is required: unverified webhooks are refused');
    }
    if (env.PAYMENT_PROVIDER === 'stripe' && !env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('STRIPE_WEBHOOK_SECRET is required: unverified webhooks are refused');
    }
    if (env.STORE_DRIVER === 'upstash' && (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN)) {
      throw new Error(
        'STORE_DRIVER=upstash requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN',
      );
    }
    if (env.STORE_DRIVER === 'memory') {
      // A warning, not a failure: a single-instance deploy is legitimate, and
      // refusing to boot would strand someone running this on one VPS.
      //
      // On a serverless host it is not a gap, it is a broken shop: each request
      // may reach a different instance with its own empty memory, so an order
      // created by one is invisible to the next, logins drop at random and the
      // rate limiter counts to `limit × instances`. docs/architecture.md says
      // which stores are affected.
      console.warn(
        '[owner] STORE_DRIVER=memory keeps sessions, orders, stock and rate ' +
          'limits in one process. Correct for a single instance; on a ' +
          'serverless or multi-replica host set STORE_DRIVER=upstash.',
      );
    }
  }

  return {
    ...env,
    SESSION_SECRET: env.SESSION_SECRET ?? DEV_SESSION_SECRET,
    isProduction,
    isTest: env.NODE_ENV === 'test',
    isSecureOrigin: env.SITE_URL.startsWith('https://'),
    allowedOrigins: Object.freeze([new URL(env.SITE_URL).origin, ...platformOrigins()]),
  };
}

/**
 * Origins this deployment is also served from, according to the host.
 *
 * `NEXT_PUBLIC_SITE_URL` is inlined by the bundler at **build** time, so it can
 * only ever name one host — the one known when the artefact was compiled. On
 * Vercel every push also publishes the same artefact at a per-deployment URL,
 * and with only the baked value in the allow-list every mutation on a preview
 * is refused with 403 while the pages themselves render perfectly. That reads
 * like a permissions bug and is a build-time/run-time mismatch.
 *
 * These names are set by the platform at run time, not sent by the client, and
 * each is a host this very deployment answers on — so trusting them as origins
 * for our own forms adds no attacker capability: a cross-site page still cannot
 * make a browser claim one of them.
 */
function platformOrigins(): string[] {
  const hosts = [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ];

  const origins = new Set<string>();
  for (const host of hosts) {
    if (!host) continue;
    try {
      // The platform supplies a bare host (`my-app-abc123.vercel.app`), always
      // served over https. Parsing rejects anything that is not one.
      origins.add(new URL(`https://${host}`).origin);
    } catch {
      // A malformed value is ignored rather than fatal: it would take the whole
      // site down over something no operator typed.
    }
  }
  return [...origins];
}

/** localhost, 127.0.0.0/8 or [::1] — origins browsers already treat as secure. */
function isLoopback(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '[::1]' || /^127\./.test(hostname);
  } catch {
    return false;
  }
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
