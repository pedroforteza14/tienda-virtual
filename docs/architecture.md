# Architecture

How the code is organised and why, written after building it rather than before.

---

## Shape

```
src/
  app/            Next.js App Router. Routes are thin: they parse, delegate, render.
    api/          Route handlers. Every one wraps a service call in guarded().
  components/
    ui/           The design system. Presentational, mostly server-renderable.
    product/      ProductRender — the procedural device artwork.
    layout/       Header, mega-menu, mobile nav, footer, ledger, wordmark.
    motion/       Reveal, Magnetic, Cursor. Client-only by nature.
  features/       Vertical slices: cart, checkout, products, search, discovery,
                  home, account. A feature owns its components and its client state.
  server/         Everything that must not reach the browser.
    catalog/      Product repository (the only source of price and stock).
    pricing/      priceCart() — the only producer of a monetary figure.
    cart/         Signed-cookie cart.
    orders/       Order service, repository, inventory with atomic reservations.
    auth/         Passwords, user repository, auth service.
    payments/     Provider interface + mock / Mercado Pago / Stripe adapters.
    security/     Signing, sessions, cookies, CSRF, rate limiting, the guard.
    observability/ Structured logging with mandatory redaction.
  lib/            Framework-agnostic: money, validation schemas, http, seo, utils.
  data/           Mock catalogue, commerce rules, editorial and legal copy.
  types/          Shared domain types.
  styles/         tokens.css (the contract) and globals.css (layers + devices).
```

The split that matters is **`server/` versus everything else**. Anything under `server/` may read a
secret, decide a price, or assert an identity. Nothing else may. The boundary is enforced by what
imports what, not by convention: `lib/money` is pure and shared, `server/pricing` is not.

`features/` versus `components/`: a component is reusable and knows nothing about commerce; a feature
knows about commerce and is used once. `Button` is a component. `CartDrawer` is a feature.

---

## The decisions worth defending

### Server-authoritative commerce
The client sends `{ sku, qty }` and gets back a fully priced cart. It performs no arithmetic — not
even a subtotal — so there is no second code path that could disagree with the server, and no
tampering surface. The cost is a round trip per mutation, which is the right trade for money.

### A single request pipeline
`guarded()` applies rate limiting, origin checking, content-type checking, body caps, CSRF, authz and
schema parsing before any handler runs. Per-route security is security that gets forgotten on the
route added next quarter.

### Repository interfaces over a database
`CatalogRepository`, `UserRepository`, `OrderRepository` exist so that the mock data is a *fixture*,
not an architecture. Swapping in a real source is an implementation change behind an interface the
rest of the app already talks to. `docs/threat-model.md` and `SECURITY.md` both mark the remaining
gaps explicitly rather than pretending they are not there.

### One shared store, two drivers
Every piece of mutable server state — rate-limit counters, login lockouts, authenticated sessions,
users, orders, stock reservations, the processed-webhook log — goes through `CommerceStore`
(`src/server/store/`). `STORE_DRIVER` picks the implementation: `memory` for one process, `upstash`
for a shared Redis over its REST API.

This is not a performance decision, it is a correctness one. Those stores were module-level `Map`s,
which is right for one process and **wrong for every serverless platform**, where consecutive
requests may be served by different instances with their own empty memory. The failure is not
subtle: you complete checkout on one instance, the confirmation page is rendered by another, and it
has never heard of your order. Sessions drop at random. The rate limiter counts to
`limit × instances`. Stock is reserved per instance, so the shop oversells by a factor of however
many are running.

The interface is deliberately operation-shaped rather than a generic `get`/`set`, because the
interesting part is atomicity and a key/value interface pushes that back onto callers, where it
cannot be done correctly over a network:

| Operation | Guarantee | Memory driver | Redis driver |
| --- | --- | --- | --- |
| `reserveStock` | Check and commit, all lines or none | A block with no `await` in it | One Lua script |
| `compareAndSet` | Replace only if unchanged | Same | One Lua script |
| `countInWindow` | Increment and expiry set together | Same | One Lua script |

`tests/unit/store-contract.test.ts` runs one suite against **both** drivers, with the Redis half
talking RESP to a real `redis-server`, so the Lua is executed by Redis rather than by a stub. The
application cannot be correct on a laptop and wrong on Vercel because of a difference nobody wrote
down. `tests/integration/shared-store.test.ts` goes further and drives two store objects over two
connections to one database — the relationship two serverless instances actually have — then creates
an order through one and reads it through the other.

REST rather than a Redis client because a serverless function may be frozen between requests and
killed without notice: a pooled TCP client either leaks connections or pays a handshake on every
cold start. A stateless HTTP API has nothing to pool.

### Dynamic rendering everywhere
Not the original plan. Pages were static, with the cart fetched client-side to keep them that way.
Two things forced the change, and both are worth knowing:

1. **Live stock.** Prerendering freezes availability at build time. A customer sees "En stock" for a
   variant that sold out last week.
2. **The CSP nonce.** A per-request nonce cannot exist in a file generated once. We shipped the
   prerendered build against the strict policy and the browser refused every script — the site was
   completely non-interactive in production, and every test, type check and lint passed.

The cost is server rendering per request: a few milliseconds for the catalogue, which is static
data in the process, plus one store round trip per page that shows availability.

### Procedural SVG instead of 3D or photography
Reasoned at length in `docs/creative-direction.md` §8. Briefly: no licensed assets exist, an
approximated 3D device reads as a knock-off, React Three Fiber is ~550 kB before first paint, and
vector geometry gets the same "physical object" impression for ~4 kB while recolouring instantly on
a variant change. A `photography` field on every product is the escape hatch.

### Tokens as a contract, enforced by tests
No component declares a colour, a radius or a duration. `tests/unit/tokens.test.ts` reads
`tokens.css`, recomputes every documented contrast ratio, and fails the build if a palette edit drops
a pair below AA. It rejected the first error red at 3.33 : 1.

---

## Request lifecycles

**Reading a page** — middleware sets a nonce and the CSP → the page renders on the server, reading
the catalogue and live stock → the client hydrates and fetches the cart once.

**Adding to the cart** — `POST /api/cart {sku, qty}` → `guarded()` runs the pipeline → the service
reads the signed cart cookie, appends, and re-prices from the catalogue → the corrected cart is
written back and returned → the provider replaces its copy wholesale.

**Checking out** — `POST /api/checkout` with a customer, a zone, a method and a terms flag, and
**no amount** → the cart comes from the cookie, not the body → re-priced → stock reserved atomically
→ order created as `pending_payment` with the totals snapshotted → the payment provider is asked for
a checkout session → the cart is cleared only after the order exists.

**Getting paid** — the provider POSTs a webhook → signature verified over the raw bytes, timestamp
window enforced, event id deduplicated → for Mercado Pago the authoritative amount is read back from
their API → amount and currency compared with the snapshot → `paid`, or `review` for a human. No
client-callable path can perform this transition.

---

## Testing strategy

Three layers, split by what each can actually prove.

- **Unit** (`tests/unit/`) — pure logic: money, pricing, validation, signing, passwords, inventory,
  redaction, catalogue integrity, contrast, `cn` class resolution.
- **Integration** (`tests/integration/`) — real route handlers for everything that resolves inside
  `guarded()`, plus the webhook handler end to end. The rejection paths all land before a handler
  runs, so they need no Next request context.
- **End-to-end** (`tests/e2e/`) — a real browser for the rest: the cookie-dependent happy paths,
  accessibility (landmarks, focus management, keyboard, reduced motion), and visual QA (overflow,
  clipping, tap targets, sticky collisions, layout shift) at all six required viewports.

The split is deliberate. The security boundary lives in the guard, so that is where it is tested;
the things a browser alone can reveal are tested in a browser. Several bugs in this codebase were
invisible to the first two layers and obvious in the third — see `docs/design-review.md`.

**The e2e suite shares one server, and that is treated as a fact rather than wished away.** An order
placed by one test genuinely consumes stock for another, and parallel workers racing for the same
product exhaust it — which is the application behaving correctly. So the specs do not hardcode a
slug: `openBuyableProduct()` discovers a product that is actually available, checks the quantity
stepper's `max`, and picks at random so workers spread out. A purchase test should assert that *a*
customer can buy *a* product, not that one SKU happened to be in stock on this run.
