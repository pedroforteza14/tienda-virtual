# OWNER STORE — Threat Model

Method: STRIDE per trust boundary, scored by what an attacker actually gains. Scope is the
storefront as built (Next.js App Router, Route Handlers, repositories over a shared store behind interfaces)
plus the payment integration the architecture is prepared for.

> **Status.** This is a storefront with a server-authoritative commerce core and **mock catalogue
> data**. There is no production database and no live payment credential. Items marked
> **[PRE-LAUNCH]** are controls that cannot be completed until a real datastore and a real PSP
> account exist; they are listed because shipping without them would be a vulnerability, not
> because they are optional.

---

## 1. Assets, by what their loss costs

| # | Asset | Why an attacker wants it | Impact if lost |
| --- | --- | --- | --- |
| A1 | **Money / order integrity** | Buy a `$2.400.000` MacBook for `$1` | Direct, unrecoverable financial loss. **Highest.** |
| A2 | **Customer PII** (name, email, phone, address, DNI) | Resale, phishing, SIM-swap on a market with high fraud | Legal exposure under Ley 25.326; brand-fatal for a trust-led reseller. |
| A3 | **Session / account takeover** | Read someone's orders, change a delivery address | PII loss + fraud. |
| A4 | **Inventory truth** | Oversell, or denial-of-inventory by holding stock | Revenue loss, operational chaos. |
| A5 | **Payment credentials** (PSP secret keys, webhook secrets) | Forge paid orders, issue refunds to self | Catastrophic. |
| A6 | **Order history / references** | Enumerate the business's volume; social-engineer support | Competitive and fraud exposure. |
| A7 | **Brand surface** (the storefront itself) | Stored XSS, defacement, skimmer injection | A skimmer on checkout is the worst realistic outcome short of A5. |
| A8 | **Availability** | Extortion, or just competitive sabotage during a launch | Lost revenue, concentrated at exactly the worst moment. |

---

## 2. Threat actors

| Actor | Capability | Motive | Realistic? |
| --- | --- | --- | --- |
| **Opportunistic shopper** | Browser devtools, a `curl` they found on a forum | Discount for themselves | **Very.** This is the #1 real threat to an Argentine reseller: tampering with price in the add-to-cart request. |
| **Commodity bot / scanner** | Automated OWASP-style probes, credential stuffing lists, scraping | Account takeover, inventory scraping, spam | **Very.** Constant background noise. |
| **Carding / reseller fraud ring** | Stolen cards, proxy pools, scripted checkout | Convert stolen cards into resellable hardware | **Very.** High-value, small-item electronics is the canonical target. |
| **Targeted attacker** | XSS/CSRF chains, dependency and supply-chain attacks | Skimmer on checkout, PII dump | Plausible given order values. |
| **Malicious / compromised dependency** | Arbitrary code at build or runtime | Skimming, cryptomining, exfiltration | Plausible — the npm ecosystem's standing risk. |
| **Insider (future admin panel)** | Legitimate credentials | Fraud, data theft | Plausible once an admin exists. |

---

## 3. Trust boundaries

```
 ┌─ UNTRUSTED ────────────────────────────────────────────────────────────┐
 │  Browser: React client components, URL, all form input, all headers,   │
 │  cookies as presented, localStorage, DOM.                             │
 │  ⇒ EVERY byte crossing inward is parsed by a Zod schema. No exception. │
 └───────────────────────────────┬────────────────────────────────────────┘
          B1: HTTP request       │   middleware.ts → CSP nonce, origin check,
                                 │   bot/rate pre-filter
 ┌───────────────────────────────▼────────────────────────────────────────┐
 │  TRUSTED (server): Route Handlers, Server Components, src/server/*     │
 │  Sole authority over: price, stock, totals, order state, identity.     │
 └───────┬──────────────────────────────┬─────────────────────┬──────────┘
         │ B2: datastore                │ B3: PSP API         │ B4: inbound webhook
 ┌───────▼────────┐          ┌──────────▼─────────┐  ┌────────▼──────────────────┐
 │ Repositories   │          │ Mercado Pago /     │  │ PSP → /api/webhooks/*     │
 │ (shared store  │          │ Stripe (outbound,  │  │ ⇒ UNTRUSTED until the     │
 │  SQL [PRE-     │          │  server-only keys) │  │   HMAC verifies.          │
 │  LAUNCH])      │          └────────────────────┘  └───────────────────────────┘
 └────────────────┘
```

**The load-bearing rule:** the client may send *what* it wants (`sku`, `qty`) but never *what it
costs*. Crossing B1, a cart line is `{ sku: string, qty: int }` and nothing else. Price, discount,
shipping and total are derived server-side, every time, from the catalogue.

---

## 4. Threats and mitigations (STRIDE)

### 4.1 Tampering — price manipulation **[A1 · the primary threat]**

| Attack | Mitigation | Verified by |
| --- | --- | --- |
| `POST /api/cart {sku, qty, price: 1}` | `CartLineInput` schema is `.strict()`; an unknown `price` key is a **400**, not an ignored field. Prices are never accepted from input in any shape. | `tests/integration/price-manipulation.test.ts` |
| Tamper the line total or cart subtotal | The cart cookie stores **only** `{sku, qty}` pairs. Every read recomputes money from the catalogue via `priceCart()`. There is no stored total to tamper with. | ✅ |
| Negative / fractional / huge quantity | `z.number().int().min(1).max(MAX_QTY_PER_LINE)`; integer-only; also clamped at order creation. | ✅ |
| Negative-quantity line to drive the total down | Same schema, plus `priceCart()` rejects any non-positive quantity defensively. | ✅ |
| Forged or stacked discount code | Codes resolve server-side against a fixed table; one code per order; the discount is recomputed, never read from input; expiry and minimum are checked server-side. | ✅ |
| Shipping set to a cheaper tier than the zone allows | Shipping is derived from the validated destination + subtotal by `quoteShipping()`. The client sends a zone, never an amount. | ✅ |
| Float drift (`0.1 + 0.2`) used to shave a total | **All money is integer ARS centavos.** No float arithmetic anywhere in the pricing path. | `tests/unit/money.test.ts` |
| Replay a stale order total after a price change | The order snapshots server-computed prices at creation, and the PSP amount is verified against that snapshot on webhook. | ✅ |

### 4.2 Tampering — stock manipulation **[A4]**

| Attack | Mitigation |
| --- | --- |
| Claim stock the client says exists | Stock is read from the catalogue server-side at add-to-cart *and* re-checked at order creation. Client stock is display-only. |
| Oversell via concurrent checkout (race) | `CommerceStore.reserveStock` checks availability and commits the reservation as one indivisible operation: a block with no `await` in the memory driver, a Lua script in the Redis one. All lines or none. Driven concurrently against a real `redis-server` in `tests/unit/store-contract.test.ts`. |
| Denial of inventory by filling carts | Carts never hold stock. Only a created order decrements, and unpaid orders expire. |
| Double-settling one order from two instances | The status check happens **inside** the compare-and-set mutation, not before it, so a retry re-evaluates against the current record and declines. Exactly one caller transitions an order to paid, and only the caller that actually cancels one releases its stock. |

### 4.3 Spoofing — identity & session **[A3]**

| Attack | Mitigation |
| --- | --- |
| Forge a session cookie | Cookie is `id.timestamp.HMAC-SHA256`, signed with `SESSION_SECRET`, compared in **constant time**, and rejected past `SESSION_MAX_AGE`. |
| Steal the cookie via JS | `HttpOnly`, `Secure` (production), `SameSite=Lax`, `Path=/`, host-only. No token is ever in `localStorage` or `sessionStorage`. |
| Session fixation after login | The session id is **rotated** on every privilege change (login, logout) and the cart is migrated to the new id. |
| Credential stuffing | Rate limit per IP **and** per account on `/api/auth/login`; generic failure message; constant-time-ish response path; a lockout window per account. |
| Password cracking after a dump | `scrypt` (N=2^15, r=8, p=1) with a 16-byte per-user salt, verified with `timingSafeEqual`. **[PRE-LAUNCH]** move to Argon2id when a native dependency is acceptable. |
| User enumeration via signup/login/reset | All three return the same shape and timing regardless of whether the email exists. |
| Logout that doesn't log out | Logout deletes the server-side session record, not just the cookie. |

### 4.4 Elevation of privilege — authorization & IDOR **[A3 · A6]**

| Attack | Mitigation |
| --- | --- |
| `GET /api/orders/{someone-elses-id}` | Every order read goes through `assertOrderAccess()`, which compares the order's `ownerKey` to the **server-derived** session. A mismatch is **404**, not 403 — a 403 confirms the resource exists. |
| Enumerate `/orders/1`, `/orders/2` | Order ids are `crypto.randomUUID()`; the customer-facing reference is `OWN-` + 10 chars of `crypto.randomBytes`. Neither is sequential. |
| Claim admin by sending `role: "admin"` | Roles are never read from input, body, header or cookie payload — only from the server-side session record. `requireRole()` guards every privileged handler. |
| Guest claims a registered user's order | Guest orders are bound to the signed guest session id; claiming one at signup requires matching the order's email **and** reference. |
| Horizontal escalation between guests | `ownerKey` is derived from the signed session; a different session is a different key. |

### 4.5 Injection / XSS **[A7 — a checkout skimmer is the worst realistic outcome]**

| Vector | Mitigation |
| --- | --- |
| Reflected XSS via `?q=` | React escapes all text by default. The search term is validated, length-capped, and rendered as a text node. |
| DOM XSS | `dangerouslySetInnerHTML` is **lint-banned** (`react/no-danger: error`). The single exception is JSON-LD, which goes through `safeJsonLd()` — it serialises typed objects and escapes `<`, `>`, `&`, ` `, ` `. No user input ever reaches it. |
| Stored XSS via a future review/Q&A | All user-authored text is validated on write, stored as text, rendered as a text node. Rich text is not supported; if it ever is, it is server-side sanitised to an allow-list. |
| `javascript:` URL in a product link | Outbound URLs are built from a fixed base; any user-supplied URL is parsed and rejected unless the protocol is `https:`. |
| Script injection through a dependency | Strict CSP with a per-request **nonce** and `strict-dynamic`, no `unsafe-inline` for scripts, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, `frame-ancestors 'none'`. A skimmer injected into a bundle still cannot exfiltrate to an unlisted origin, because `connect-src 'self'` is an allow-list. **A nonce requires dynamic rendering**: a per-request value cannot exist in a file generated once at build time. We shipped a prerendered build against this policy and the browser refused every script — the site was wholly non-interactive in production while all tests, types and lints passed. Every page therefore sets `export const dynamic = 'force-dynamic'`; removing it silently reintroduces the outage. |
| Style injection | `style-src` does carry `'unsafe-inline'`, because React renders the `style` prop as an attribute and Next inlines critical CSS. Accepted knowingly: style injection is defacement and, in exotic setups, exfiltration — an order of magnitude below script execution, which keeps the strict policy. |
| SVG XSS | `images.dangerouslyAllowSVG: false`; device renders are compiled React components, not uploaded files. |
| SQL / NoSQL injection | No raw queries. Store keys are built from fixed prefixes plus either a UUID validated before it is used, a hash of the input, or a value the server generated; nothing a user types shapes a key. **[PRE-LAUNCH]** the repository interfaces are designed for a parameterised/ORM implementation. |

### 4.6 Repudiation — payments & webhooks **[A1 · A5]**

| Attack | Mitigation |
| --- | --- |
| Client reports `payment: approved` | Impossible by design: **only a verified webhook or a server-side PSP query can move an order to `paid`.** There is no client-callable transition. |
| Forged webhook | HMAC-SHA256 over the raw body, constant-time compared, secret from env. Unverified → **401**, and the order is untouched. |
| Replayed webhook | The event id is **claimed with a conditional write** before anything touches an order, so two concurrent deliveries of the same event cannot both settle it; a losing claim is acknowledged with **200** and no state change. A timestamp outside a 5-minute window is rejected. A claim is released if processing throws, so a transient failure does not make the event permanently unprocessable. |
| Paid-amount mismatch (pay `$1` for a `$2.4M` order) | The webhook compares `amount`, `currency` **and** order reference to the server-side snapshot. Any mismatch → the order is flagged for manual review, never auto-fulfilled. |
| Secret leakage to the browser | PSP secrets are read only in server modules; no `NEXT_PUBLIC_` secret exists. A `tests/unit/env.test.ts` assertion fails the suite if a secret-shaped name gains a `NEXT_PUBLIC_` prefix. |
| Card data touching our servers | **We never see a PAN.** The PSP's hosted checkout / tokenised fields own it. No card field exists in our schemas, and none may be added. |

### 4.7 Denial of service **[A8]**

| Vector | Mitigation |
| --- | --- |
| Request flood on expensive routes | Token-bucket rate limiting per route class, keyed by IP + session, with `Retry-After`. Tightest on login, signup, checkout and contact. |
| Oversized body | Content-Length and byte-cap checks before parsing; `413` over the limit. |
| Deep/huge JSON | Zod schemas are closed (`.strict()`), arrays are `.max()`-bounded, strings are length-capped — a 10 000-line cart cannot be constructed. |
| Unbounded pagination | `limit` clamped to 48, `offset` clamped; search results hard-capped. |
| Algorithmic blowup in search | Substring matching over a bounded in-memory catalogue; the query is length-capped and the regex path is avoided entirely (no user-built regex). |
| Memory growth from sessions/rate-limit state | Every key carries a TTL and expires on its own; the memory driver is additionally size-capped with oldest-first eviction. Nothing sweeps on a timer, so an idle instance can be frozen. |

### 4.8 Information disclosure **[A2 · A6]**

| Vector | Mitigation |
| --- | --- |
| Stack traces in a response | A single error boundary maps everything to a generic message + a correlation id. Detail goes to the server log only. Production never returns an error `cause`. |
| Verbose validation errors leaking schema internals | Zod issues are mapped to field-level, human messages; raw issues are logged, never returned. |
| PII in logs | The logger redacts `password`, `token`, `authorization`, `cookie`, `secret`, `card`, `cvv`, `dni`. Emails are hashed before they reach a log line. |
| Over-fetching in API responses | Explicit DTO mappers — a repository entity is never serialised directly. |
| `Referer` leaking an order reference | `Referrer-Policy: strict-origin-when-cross-origin`. |
| Framework fingerprinting | `poweredByHeader: false`. |

### 4.9 CSRF — analysed, not assumed

The brief asks for an architecture decision rather than a checklist tick.

**Finding: we are exposed, and we mitigate in depth.** Session auth is cookie-based, so
`SameSite` alone is not sufficient. Three reasons: `SameSite=Lax` still permits top-level
**GET** navigations (so no GET may ever mutate), `Lax` is the *browser default* and we must not
depend on a default for a security control, and older/embedded webviews — common for traffic
arriving from Instagram — have inconsistent `SameSite` support.

Controls, layered:
1. **`SameSite=Lax`** on the session cookie.
2. **Origin/Referer validation** on every state-changing request, against an explicit allow-list.
   A missing or foreign `Origin` on a mutation is **403**. The allow-list is the origin of
   `NEXT_PUBLIC_SITE_URL` — which the bundler **inlines at build time**, so it names only the host
   known when the artefact was compiled — plus, at run time, the hosts the platform reports this
   deployment answers on (`VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`), each
   over `https`. Those are supplied by the host rather than by a request, and each is already a host
   this deployment serves, so they add no attacker capability — while without them the same artefact
   served from a preview URL would reject every mutation and look like an authorisation bug.
   SECURITY.md has the operator-facing version.
3. **All mutations are `POST`/`PATCH`/`DELETE` with `Content-Type: application/json`**, which a
   simple cross-origin HTML form cannot produce — a cross-origin `fetch` with that content type is
   a preflighted request, and our CORS policy denies the preflight.
4. **Double-submit token** on authentication and checkout: a `__Host-owner.csrf` cookie paired with
   an `x-csrf-token` header, compared in constant time. Scoped to the mutations that actually
   matter rather than applied blindly site-wide.

### 4.10 CORS

Default is **no CORS headers at all** — the storefront is same-origin, and silence is the strictest
policy. `Access-Control-Allow-Origin: *` is never emitted for a credentialed route. If a route ever
needs cross-origin access it must opt in with an explicit origin from that same allow-list;
`credentials: true` with a reflected origin is forbidden.

### 4.11 Supply chain

- 8 runtime dependencies, all first-tier maintained. Exact pinned versions, no ranges.
- Audited and remediated rather than noted: the first run found 5 advisories including two
  **critical** — among them an XSS in Next's App Router CSP-nonce handling, i.e. in the exact control
  described above. Resolved by upgrading Next to 15.5.27, Vitest to 5, and pinning `postcss` through
  an `overrides` entry because Next ships a vulnerable version internally. Currently **0
  vulnerabilities**; removing the override reintroduces four.
- `package-lock.json` committed; CI uses `npm ci`.
- `npm audit` is part of `npm run verify` and gated in CI.
- Lockfile reviewed for `postinstall` scripts.
- CSP `connect-src`/`script-src` allow-lists mean a compromised dependency cannot exfiltrate to an
  arbitrary host.
- **[PRE-LAUNCH]** Dependabot/Renovate, `npm audit signatures`, and SRI on any external script.

---

## 5. Residual risk, accepted knowingly

| Risk | Why accepted | Trigger to fix |
| --- | --- | --- |
| In-memory repositories lose data on restart | No datastore in scope; interfaces make the swap mechanical | Before any real order |
| In-memory rate limiting is per-instance | Correct for single-instance; a stub for the real thing | Before horizontal scaling |
| `scrypt`, not Argon2id | Node built-in, zero native deps, properly parameterised | When a native dep is acceptable |
| No CAPTCHA / bot scoring | Rate limiting handles commodity volume | On real carding pressure |
| No WAF, no bot management | Platform-layer concern | At launch |
| Mock catalogue prices | Explicitly required by the brief | On real catalogue integration |
| No 2FA | No real accounts yet | Before admin exists |
| No audit log persistence | Structured logs exist; no sink | With the admin panel |

---

## 6. Basic incident response

1. **Detect** — `security.*` structured log events: auth failures, authz denials, rate-limit trips,
   webhook signature failures, amount mismatches. These are the alerting signal.
2. **Contain** — rotate `SESSION_SECRET` (invalidates every session), rotate PSP keys, and set
   `PAYMENT_PROVIDER=mock` to stop order creation while keeping the storefront readable.
3. **Assess** — correlate by the request id present on every log line and returned with every error.
4. **Notify** — Ley 25.326 obligations for PII; PSP notification for payment incidents; customers
   directly if order data is involved.
5. **Recover** — redeploy from a known-good commit; `npm ci` from the committed lockfile; re-verify
   webhook secrets before re-enabling payments.
6. **Learn** — a regression test for the specific vector goes into `tests/integration/` before the
   incident is closed.
