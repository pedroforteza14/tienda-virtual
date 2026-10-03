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
| `npm run verify` | typecheck → lint → 266 unit/integration tests → production build |
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

**Quality** — 266 unit and integration tests, 220 browser tests across desktop and mobile covering
the purchase path, accessibility (landmarks, focus management, keyboard, reduced motion) and visual
QA (overflow, clipping, tap targets, layout shift) at all six required viewports.

---

## Repository note

`alo/` predates this work — a small purchase-simulator exercise that was already in the repository.
It is untouched and excluded from linting and the TypeScript project.
