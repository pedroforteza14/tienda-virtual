# OWNER STORE

> **TECHNOLOGY, REDEFINED.**
> A premium storefront for an Argentine Apple reseller — built as a gallery, priced by the server.

Next.js 15 · React 19 · TypeScript (strict) · Tailwind CSS v4 · Zod · Motion · Vitest · Playwright

---

## Quick start

```bash
npm install
npm run dev                     # http://localhost:3000
```

Development needs no configuration: with no `SESSION_SECRET` set, a fixed
development key is used and a warning is logged. For anything that is not your
own machine, copy the template and fill it in — in production the server
refuses to start without a real secret:

```bash
cp .env.example .env.local
```

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `start` | Production build and server |
| `npm run verify` | typecheck → lint → 318 unit/integration tests → production build |
| `npm run test` | Vitest (unit + integration) |
| `npm run test:e2e` | Playwright — 220 tests: shopping, accessibility, visual QA |
| `npm audit` | Dependency audit. Currently **0 vulnerabilities** |

---

## ⚠️ The data is mock, and says so

Every price, stock level, review and bank detail in this repository is **invented**. None of it came
from OWNER STORE or any competitor. The storefront renders a visible "precios de demostración"
notice wherever money appears, driven by `PRICES_ARE_MOCK` in
[`src/data/catalog.ts`](src/data/catalog.ts). The customer quotes in the social-proof section are
labelled as written examples, and the policy pages state that they have had no legal review.

Those labels are not decoration — presenting invented prices or fabricated reviews as real would be
deceptive, and in Argentina a Ley 24.240 problem. Replace the data before flipping the flags.

**Research note:** the brief asked for an analysis of `instagram.com/ownerstoreok`. That host is
blocked by this environment's network policy, so the visual direction is *not* derived from the real
account — it is argued from the reference set and from Argentine retail convention.
[`docs/creative-direction.md`](docs/creative-direction.md) §0 explains what to re-fit once the
account is reachable: the brand decisions live in ~80 lines of CSS and one data file.

---

## Running it on Vercel (or anything serverless)

Set **`STORE_DRIVER=upstash`**. This is not a tuning knob; with the default `memory` driver the shop
looks fine and is not. Each request may be served by a different instance with its own empty memory,
so an order created by one is invisible to the next — you complete checkout and the confirmation
page 404s — logins drop at random, the rate limiter counts to `limit × instances`, and stock is
reserved per instance, so the shop oversells.

1. Import the repository in Vercel (**Add New → Project**) and pick this branch. The framework is
   detected; the default build and output settings are correct, and there is nothing to override.
2. Create a database at [console.upstash.com](https://console.upstash.com) and copy its REST URL and
   token. Set its eviction policy to `noeviction`: an evicted key here is a lost order.
3. **Put the database and the functions in the same region.** Every page is dynamic and most do at
   least one store round trip, so this is not a micro-optimisation: a function in Washington talking
   to a database in Frankfurt pays ~100 ms on every page, serially, before anything renders. Pick
   the Upstash region closest to your buyers, then set the matching region in Vercel under
   **Project Settings → Functions → Function Region** (the dashboard lists the valid ones; for
   Argentina, São Paulo is the nearest). Do this before the first deploy — changing it later means
   a redeploy anyway.
4. Set the environment variables:

```bash
SESSION_SECRET=…            # required; the server refuses to start without it
NEXT_PUBLIC_SITE_URL=https://your-domain
STORE_DRIVER=upstash
UPSTASH_REDIS_REST_URL=…
UPSTASH_REDIS_REST_TOKEN=…  # server-only — never prefix it NEXT_PUBLIC_
PAYMENT_PROVIDER=mock
NEXT_PUBLIC_ALLOW_INDEXING=false   # until it is the real shop
```

Generate the secret with the command under **Quick start** rather than inventing one, and set it in
Vercel's own environment-variable UI — not in a file, and not pasted into a chat or an issue.

The app boots with `memory` and warns loudly in production; with `upstash` set and either credential
missing it refuses to start rather than falling back to a driver that would quietly lose orders.

Once it is up, the thing worth checking first is the one that used to be broken: complete a checkout,
then reload the confirmation page a few times. Each reload may be served by a different instance, so
if the order survives, the shared store is doing its job.

Every page is `force-dynamic` (a CSP nonce cannot exist in a prerendered file, and stock would be
frozen at build time), so there is nothing to configure for ISR.

---

## Documentation

| Document | What is in it |
| --- | --- |
| [`docs/creative-direction.md`](docs/creative-direction.md) | The reference analysis, the six-point anti-Apple test, the identity devices, the palette with measured contrast, and why there is no WebGL |
| [`docs/design-system.md`](docs/design-system.md) | Tokens, the component contract, responsive posture, accessibility baseline |
| [`docs/motion-system.md`](docs/motion-system.md) | Motion primitives, the scroll rules, reduced motion, measured performance budgets |
| [`docs/architecture.md`](docs/architecture.md) | Code layout, the decisions worth defending, request lifecycles, testing strategy |
| [`docs/threat-model.md`](docs/threat-model.md) | STRIDE per trust boundary, actors, mitigations, residual risk, incident response |
| [`SECURITY.md`](SECURITY.md) | Controls as built, environment variables, and what is still missing |
| [`docs/design-review.md`](docs/design-review.md) | Self-critique: what the build caught, and an honest review from five angles |

---

## The idea in one line

A **technical drawing that grew warm** — instrument-panel precision (hairline grids, monospace
annotation, numbered parts) in bone, ink and brass rather than the usual cold grey, so it reads as a
jeweller's bench rather than a spec sheet.

Recognisable without the logo by four devices: the **brass aperture** the product arrives through,
the **ledger** of hairline columns with coordinates in the margin, **spec rails** instead of cards,
and **every number set in monospace**.

---

## The rule the commerce layer is built around

> **The client may say what it wants to buy. It may never say what it costs.**

A cart line crossing into the server is exactly `{ sku, qty }`. There is no `price` field to ignore —
the schema is closed, so sending one is a `422`. Every monetary figure comes from one function,
[`priceCart()`](src/server/pricing/pricing.ts), computed from the catalogue on every read and again
at order creation. Stock is re-checked and reserved atomically. Only a signature-verified webhook can
mark an order paid.

See [`SECURITY.md`](SECURITY.md) for the rest, including what is **not** done yet.

---

## What works today

**Storefront** — cinematic home with a scroll narrative, catalogue with no-JS filters, product pages
with a live configurator, a two-question device finder, full-screen search, a cart drawer, a
four-step checkout, order confirmation, accounts, and policy pages.

**Commerce** — integer-centavo money, dual Argentine pricing (transfer discount and interest-free
instalments), promo codes, shipping zones with free-shipping thresholds, showroom pickup that
collects no address, atomic stock reservation, and order expiry.

**Payments** — a provider interface with mock, Mercado Pago and Stripe adapters. Hosted checkout
only, so no card data ever reaches this origin.

**Deployable to a serverless host** — sessions, users, orders, stock reservations, the webhook log
and the rate-limit counters all live behind one `CommerceStore` interface with two drivers. See
below.

**Quality** — 318 unit and integration tests, 220 browser tests across desktop and mobile covering
the purchase path, accessibility (landmarks, focus management, keyboard, reduced motion) and visual
QA (overflow, clipping, tap targets, layout shift) at all six required viewports.

---

## Repository note

`alo/` predates this work — a small purchase-simulator exercise that was already in the repository.
It is untouched and excluded from linting and the TypeScript project.
