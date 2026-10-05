# Security

How this storefront is defended, what it deliberately does not do yet, and how to report a problem.

The design rationale is in [`docs/threat-model.md`](docs/threat-model.md). This document is the
operational one: what is implemented, where it lives, and what has to happen before real money
moves through it.

---

## Reporting a vulnerability

Email **security@ownerstore.example** with a description and reproduction steps. Please do not open
a public issue. We will acknowledge within 72 hours. We will not pursue anyone who reports a finding
in good faith and does not access, modify or retain other people's data.

---

## The one rule everything else supports

> **The client may say what it wants to buy. It may never say what it costs.**

A cart line that crosses into the server is exactly `{ sku: string, qty: int }`. There is no `price`
field to ignore, because the schema is `.strict()` and an unexpected key is a **422**, not a silently
dropped one. Every monetary figure in the application is produced by one function,
[`priceCart()`](src/server/pricing/pricing.ts), from the catalogue, on every read and again at order
creation.

Verified by `tests/unit/pricing.test.ts` and `tests/integration/api-security.test.ts`.

---

## Implemented controls

### Input validation
Every byte entering the server is parsed by a Zod schema in
[`src/lib/validation/schemas.ts`](src/lib/validation/schemas.ts), shared with the client so the two
cannot drift. Every schema is **closed** (`.strict()`) and **bounded** — every string has a maximum
length, every array a maximum size, every number a range. Free-text fields additionally reject `<`
and `>`, so even a future `innerHTML` mistake could not open a tag.

### The request pipeline
No route handler implements its own security. All of them go through
[`guarded()`](src/server/security/guard.ts), which applies, in order: rate limit → origin check →
content-type check → body-size cap → CSRF → authentication/authorization → schema parse. A new route
cannot be written without them, which is the point.

### Money
Integer ARS centavos throughout. No float ever touches a total; rounding happens once per operation
and is explicit. `MAX_CENTAVOS` is asserted to exceed the largest cart the limits allow, so the rail
cannot start rejecting legitimate orders as prices rise.

### Sessions
HMAC-SHA256 signed, purpose-bound (a session token cannot be replayed as a CSRF token), timestamped
and max-aged, compared in constant time. `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` with the
`__Host-` prefix **whenever the origin is https** — keyed on the actual transport rather than on
`NODE_ENV`, because a production build smoke-tested over `http://127.0.0.1` would otherwise be issued
cookies the browser refuses. Nothing is ever stored in `localStorage`.

### Authentication
`scrypt` (N=2^15, r=8, p=1), 16-byte per-user salt, parameters stored in the hash so they can be
raised and old hashes upgraded on next login. Login and signup are **non-enumerating**: identical
responses and a key derivation even for an account that does not exist. Lockout is per account
(8 failures / 15 min) *in addition to* the per-client rate limit, so rotating IP addresses does not
help. The session id is **rotated** on login, signup and logout, which is what prevents session
fixation, and logout deletes the server-side record rather than only clearing the cookie.

### Authorization
Identity and role come **only** from the server-side session record — never from a request body, a
header or a cookie payload. Order access is checked against a key derived from the signed session,
and a failed check returns **404, not 403**, so the endpoint cannot be used to confirm that a
reference exists. Order references are 10 characters of CSPRNG output over a 32-symbol alphabet.

### CSRF
Analysed rather than assumed (threat model §4.9). Cookie-based sessions are exposed, so four layers:
`SameSite=Lax`; Origin/Referer validation that **fails closed** when neither is present; a required
`application/json` content type, which a cross-origin HTML form cannot produce; and a double-submit
token derived as `HMAC(sessionId, 'csrf')`, compared in constant time, that an attacker can neither
read nor compute.

### CORS
None. The storefront is same-origin and emits no CORS headers at all — silence is the strictest
policy. `Access-Control-Allow-Origin: *` is never emitted for a credentialed route.

### Content-Security-Policy
Per-request nonce with `strict-dynamic`, emitted by [`src/middleware.ts`](src/middleware.ts). No
`unsafe-inline` for scripts, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`,
`frame-ancestors 'none'`, and `connect-src 'self'` — so even a compromised dependency cannot
exfiltrate to its own host.

> **This is why every page is dynamically rendered.** A per-request nonce cannot exist in a file
> generated once at build time. We shipped a prerendered build against this policy and the browser
> refused every script: the site was completely non-interactive in production while all tests, types
> and lints passed. If you ever see `export const dynamic` removed from a page, this breaks again.

`style-src` does carry `unsafe-inline`: React renders the `style` prop as an attribute and Next
inlines critical CSS. Style injection is an order of magnitude less severe than script execution,
and scripts keep the strict policy.

### Other headers
`Strict-Transport-Security` (production, 2 years, preload), `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive
`Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, and `poweredByHeader: false`.
See [`next.config.ts`](next.config.ts).

### XSS
React escapes by default. `dangerouslySetInnerHTML` is **lint-banned** (`react/no-danger: error`)
with exactly one narrowly-scoped exception: JSON-LD, which is serialised by `safeJsonLd()` (escaping
`<`, `>`, `&`, U+2028, U+2029) and is never fed user input. SVG through the image optimiser is
disabled.

### Payments
We never see a card number. There is no card field in any schema, and none may be added — the PAN is
entered on the provider's own hosted page. Secrets are read only in server modules; no `NEXT_PUBLIC_`
secret exists. **Only a verified webhook can move an order to `paid`**; there is no client-callable
transition. Webhooks verify an HMAC over the **raw bytes** in constant time, reject anything outside
a 5-minute window, are idempotent per provider event id, and compare amount *and* currency against
our own snapshot — a mismatch flags the order for human review and is never fulfilled.

### Stock
Checked server-side at add-to-cart and re-checked at order creation inside an atomic
check-and-decrement with no `await` between the two, so concurrent checkouts cannot oversell.
Unpaid orders expire and return their stock.

### Rate limiting
Per route class, keyed on IP **and** the signed session id — an attacker can forge the IP portion but
not the session, so rotating it still shares a bucket. Tightest on login (5/5 min), signup (3/10 min)
and checkout (10/10 min). Standard `RateLimit-*` and `Retry-After` headers.

### Errors and logging
Every error response carries a machine code, customer-safe copy and a correlation id — never a stack
trace, a path, a database error or a schema internal. The logger **redacts by key name, recursively**
(passwords, tokens, cookies, card fields, DNI…) and pseudonymises email and phone to a SHA-256
prefix. Redaction is not the caller's responsibility; it cannot be opted out of.

### Dependencies
Eight runtime dependencies, all exact-pinned, lockfile committed. `npm audit` is part of
`npm run verify`. At the last run: **0 vulnerabilities**. A `postcss` override is in place because
Next pins a vulnerable version internally; removing it reintroduces four advisories.

---

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `SESSION_SECRET` | **Production** | 32+ random bytes, base64. Rotating it invalidates every session and guest cart. The server refuses to serve without it. |
| `NEXT_PUBLIC_SITE_URL` | Yes | Must be https in production (loopback excepted). Drives canonical URLs and the origin allow-list. |
| `NEXT_PUBLIC_ALLOW_INDEXING` | No | `false` on staging, so robots.txt disallows everything. |
| `PAYMENT_PROVIDER` | No | `mock` \| `mercadopago` \| `stripe`. |
| `MERCADOPAGO_ACCESS_TOKEN` / `_WEBHOOK_SECRET` | If used | Server-only. Production refuses to start without the webhook secret. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | If used | Server-only. Same. |
| `STORE_DRIVER` | **Serverless** | `memory` \| `upstash`. Holds sessions, users, orders, stock reservations, the webhook log and rate-limit counters. `memory` is per-instance and warns at boot in production; on a serverless or multi-replica host it must be `upstash`. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | If `upstash` | Server-only; production refuses to start with the driver set and either missing. Never prefix the token `NEXT_PUBLIC_`. |
| `STORE_PREFIX` | No | Key namespace, so one Redis database can serve staging and production. |
| `LOG_LEVEL` | No | `debug` \| `info` \| `warn` \| `error`. |

`.env.example` is the template. `.env*` files are gitignored. No secret is committed.

---

## Not done yet — required before taking real money

These are tracked honestly rather than quietly. Each is a gap, not a preference.

1. **Durability, not just sharing.** With `STORE_DRIVER=upstash` the state is shared across
   instances and survives a restart, which is what makes the shop correct on a serverless host.
   It is still Redis: an eviction policy that drops keys under memory pressure would drop orders.
   Before real money, orders belong in a database with a backup, and Redis keeps the things it is
   good at — counters, locks, sessions. Set the database's eviction policy to `noeviction` in the
   meantime.
2. **A unique constraint on the webhook log.** Idempotency currently rests on `SET NX`, which is
   atomic and correct, but the claim expires after seven days and a key eviction would un-claim it
   early. A table with a unique constraint on `(provider, event_id)` cannot.
3. **Stock in the same transaction as the order.** Reservation and order creation are two
   operations today: the reservation is atomic, and the order write that follows it is a separate
   round trip. A crash between them leaks a reservation until the order expires — bounded, and
   self-healing, but not the same as one transaction.
4. **Argon2id** in place of scrypt, once a native dependency is acceptable.
5. **Real legal review.** The copy in `src/data/legal.ts` is a draft; Ley 24.240 and Ley 25.326
   compliance needs a lawyer.
6. **Bot management and WAF** at the platform layer; no CAPTCHA or bot scoring exists.
7. **A log sink with alerting** on the `security.*` events, which are emitted but go nowhere.
   `ratelimit.degraded` is the one to alert on first: it means the store refused a rate-limit write
   and the request was let through uncounted. The limiter fails **open** by design — see
   `src/server/security/rate-limit.ts` for why a store outage should not also be a total outage —
   and that choice is only defensible if someone finds out it happened.
8. **A deploy against Upstash itself.** How far the verification goes today: the Lua scripts are
   executed by a real `redis-server`; the REST transport's envelope is tested with a supplied
   `fetch`; and the full 220-test browser suite has been run against a production build with
   `STORE_DRIVER=upstash`, talking REST to a local service that relays to that `redis-server` —
   so the whole purchase path, orders and stock reservations included, has gone through the Redis
   driver end to end. What is still untested is Upstash's own endpoint: its TLS, its auth, its
   rate limits, its latency and whatever its REST implementation does differently. Expect the
   first deploy to surface something none of that could.
8. **Automated dependency updates** (Dependabot/Renovate) and `npm audit signatures` in CI.
9. **2FA**, before any admin role exists.

---

## Verifying

```bash
npm run verify     # typecheck → lint → 261 unit/integration tests → production build
npm audit          # expected: 0 vulnerabilities
npm run test:e2e   # 206 browser tests: shopping, accessibility, visual QA
```

The security tests are not illustrative. They cover price manipulation over HTTP, quantity and SKU
tampering, CSRF and origin enforcement, body-size limits, IDOR on orders, rate limiting, webhook
signature forgery, replay and amount mismatch, account enumeration, lockout, and session rotation.
