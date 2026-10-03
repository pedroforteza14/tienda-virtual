# Design review & self-critique

The brief asks for a review as an Awwwards judge, a senior product designer, a senior frontend
engineer, a security engineer and a conversion designer — and explicitly says not to optimise for
awards, because the thing has to sell.

This is that review, written against the built product rather than the intention. It is deliberately
unflattering where it should be.

---

## 1. What the build actually caught

The most useful section, because it is evidence about *process* rather than taste. Every one of these
passed `tsc`, `eslint` and `next build`. Several passed the entire unit and integration suite. They
were found by looking at the running thing.

| # | Defect | How it presented | Found by |
| --- | --- | --- | --- |
| 1 | **CSP blocked every script in production** | Site completely non-interactive — no cart, no search, no configurator | Reading the browser console during a visual check |
| 2 | `text-[var(--text-hero)]` parsed as a **colour**, not a length | Every heading in the app rendered at 16px | A screenshot |
| 3 | `tailwind-merge` dropped a size or a colour on every element that set both | Silent wrong sizes | Suspicion from #2, confirmed by a 6-line script |
| 4 | Custom CSS outside a cascade layer beat Tailwind utilities | `.aperture` ignored `absolute`; hero overflowed; price and CTA below the fold | Measuring the hero |
| 5 | SVG gradient ids collided with a `display:none` subtree | Hero device drew camera dots and nothing else | A screenshot |
| 6 | `MAX_CENTAVOS` below a legitimate cart | 500 on add-to-cart for five iPhones | Unit test |
| 7 | Prerendering froze stock at build time | Stale availability | Reasoning forced by #1 |
| 8 | Hero commercial strip faded in from opacity 0 | No price, no CTA on the first screen — on mobile, the whole screen | A screenshot |
| 9 | Grid child `min-width: auto` | 6px horizontal scroll at 375px | Visual-QA sweep |
| 10 | `ButtonLink` reused for a card (`whitespace-nowrap`) | 10px horizontal scroll at 1024px | Visual-QA sweep |
| 11 | Heading jump h1 → h3 on listings | Lost structure for screen readers | Accessibility sweep |
| 12 | Heading focused on mount | Skip link unreachable | Accessibility sweep |
| 13 | Tap targets at 31px and 16px | Below the documented minimum | Visual-QA sweep |
| 14 | Module-level `await` reading env | Build failed without production secrets | `next build` |
| 15 | `robots.txt` keyed on `NODE_ENV` while prerendered | Staging could outrank production | Reasoning during #14 |
| 16 | 5 advisories, 2 critical — including XSS in App Router CSP nonces | — | `npm audit` |
| 17 | **Cart drawer stayed open across navigation** | Checkout loaded behind a backdrop that swallowed every click | e2e, after fixing #1 |
| 18 | CLS of 0.56 against a 0.1 budget | The pinned rail grew from `auto` to 220vh after hydration | Visual-QA sweep |
| 19 | Media-query rules lost to Tailwind utilities | The fix for #18 silently did nothing; panels never resized | Measuring the fix |
| 20 | Mobile PDP put two paragraphs of prose above the price | Narrative between the visitor and the sale | Screenshot review |
| 21 | `headers()` returned `headers: []` outside production | **`next dev` refused to boot** — "Invalid header found" | Running `npm run dev` for the first time |
| 22 | `settleOrder` checked the status *before* the update, not inside it | Two concurrent webhook deliveries both settled one order, appending two payment events | A test that drove two store instances at one Redis |

Several of the later ones are worth noting as a pattern: **each fix exposed the next defect.** #1
was hiding #17 (no JavaScript ran, so the drawer could never stay open); #18's fix created #19. A
single pass would have found one of them.

#22 is the same shape as #1 and #17: a defect that only exists in a configuration the tests did not
run. The status check sat outside the mutation, which is correct as long as exactly one process ever
updates an order — true of every test that had ever been written, and false the moment two instances
share a database. Compare-and-set alone did not save it, because the loser re-read the record and
re-applied a decision it had made while the order was still pending. Moving the check inside the
mutation is what fixes it, and the test that found it is the one that models the deployment rather
than the module.

#21 is the sharpest instance of the same lesson in a different direction. The whole verification
pipeline — `npm run verify` and the Playwright web server alike — runs the app through
`next build && next start`, which is `NODE_ENV=production`. The one conditional that produced an
empty header list was the development branch, so the mode nobody tested was the only mode that was
broken, and it was broken completely: the dev server exited instead of starting. 262 unit tests, 220
e2e tests and a clean build all passed over a repository whose `npm run dev` did not run. It was
found the first time anyone typed the command. `tests/unit/next-config.test.ts` now asserts the
header table in all three modes, because a check that only ever exercises one configuration can only
ever vouch for one configuration.

**The lesson, stated plainly:** a type system and a linter verify that code is *well-formed*, not
that it is *right*. Five of these (#1, #2, #3, #5, #19) were tools silently guessing wrong about ambiguous input — a
framework resolving a nonce, a class parser choosing between a length and a colour, a cascade layer
deciding precedence — and no amount of re-reading the source would have surfaced them. The visual-QA and
accessibility sweeps are now permanent tests precisely so they are not a one-time pass.

---

## 2. As an Awwwards judge

**Works.** The identity is genuinely ownable: brass aperture, bone-on-ink warmth, the monospace
ledger and spec rails. Set the home page beside Apple's and nobody would confuse them — the warmth,
the asymmetry, the mono numerals and the visible grid are all decisions Apple would not make. The
hero earns its scale: an editorial stack against a lit object inside a ring, not a centred slab of
copy. The scroll narrative does something — object → detail → specification → hand-off — rather than
just moving.

**Does not work.**

- **The device artwork is the ceiling.** The SVG renders are good *drawings*, and at hero scale they
  read as illustrations rather than objects. A real photographic shoot would lift the whole site more
  than any further motion work. The architecture is ready for it; the assets are not.
- **One narrative section is on the thin side** for this category of brief. There is room for a
  second — a materials or cutaway sequence on the PDP — and it was cut for time, not for taste.
- **The editorial serif is underused.** One italic word per section is the rule, and it is followed,
  but the rule itself may be too timid. A full serif pull-quote somewhere would earn its place.
- **The ledger is almost invisible** at the chosen opacity. It is doing less work than the concept
  claims. Either commit to it or drop it.

**Not chasing.** No custom cursor trail, no scroll-jacked chapters, no WebGL for its own sake, no
preloader. Each would score and none would sell.

---

## 3. As a senior product designer

**Works.** Hierarchy is doing the work on the home page rather than quantity — one lead product at a
scale nothing else gets, two supporting entries at a different rhythm. The PDP puts price, stock,
variants and financing above the fold on every viewport. Mobile is a separate design, not a reflow:
its own bottom nav, its own buy bar, and an inverted content order.

**Does not work.**

- **The catalogue is the least designed page.** It is a competent grid. The home page has a point of
  view and the catalogue does not, which is a missed opportunity given it is where intent-led traffic
  lands.
- **The discovery flow asks two questions and stops.** It is honest and fast, but "find your device"
  implies more intelligence than a use case and a budget ceiling.
- **The empty cart is prettier than the full cart.** The full drawer is functional and a bit dense.
- **The checkout is sparse at desktop width.** Three fields and a summary leave a lot of unused
  canvas; it is calm rather than designed.
- **Five sold-out variants in twenty products** is realistic but makes the first catalogue screen
  feel thinner than the range actually is.

---

## 4. As a conversion designer

**Works.** Both Argentine prices are always visible — transfer and card-in-instalments — because
hiding either costs sales here. The Instagram path is short: land on a PDP, see the price without
scrolling, pick a variant, add, check out with three fields and no account. Pickup collects no
address at all. Trust claims are specific ("12 meses por escrito", "retiro con turno") rather than
badges.

**Does not work.**

- **No "notify me" capture.** A sold-out variant offers WhatsApp, which is a human bottleneck, not a
  list.
- **No abandoned-cart path**, because there is no email capture before checkout.
- **The promo field is visible to everyone**, which reliably sends some share of buyers off to hunt
  for a code they will not find.
- **No reviews with real provenance.** The social proof is honestly labelled as demo content, which
  is correct, but it means the page currently carries no genuine proof at all.

**Deliberately not done.** No countdown timers, no "17 people viewing", no fake scarcity. The stock
figure shown is the real one. That costs some conversion and is the right call for a brand whose
entire proposition is trust.

---

## 5. As a senior frontend engineer

**Works.** One pipeline for every API route. One function that can produce a price. Tokens as a
contract with tests that enforce it. Motion is per-route, so the catalogue and checkout ship none —
measured, not assumed. The device renders cost ~4 kB and recolour instantly.

**Does not work.**

- **167 kB first load on the home page** is honest for the narrative but not impressive. The `motion`
  library is most of the delta. A hand-rolled `IntersectionObserver` plus CSS scroll-driven
  animations would cut it substantially, at the cost of the reduced-motion ergonomics `motion` gives
  for free.
- **Everything is dynamically rendered**, forced by the nonce and live stock. A proper answer is a
  short-TTL cache on catalogue data plus streaming, not a per-request render of a static page.
- **`ProductRender` is a client component purely for `useId()`.** It has no state and no handlers.
  That is a framework limitation being paid for in bundle size, and it deserves a revisit.
- **The in-memory stores are a real limitation, not a stub detail.** They are documented in three
  places, which is the honest treatment, but nothing here has survived a restart.

---

## 6. As a security engineer

**Works.** Price manipulation — the actual threat to an Argentine reseller — is closed structurally
rather than by validation: there is no field to send. Authorization is checked against a derived key
and returns 404 so the endpoint is not an oracle. Webhooks verify over raw bytes, reject replays, are
idempotent, and compare the amount with our own snapshot. Login does not enumerate and locks per
account. The logger redacts by key name recursively, so redaction is not a caller's discipline.

**Does not work.**

- **`style-src 'unsafe-inline'`** remains, because React's `style` prop and Next's critical CSS need
  it. Lower severity than script injection, but it is a gap and it is stated rather than buried.
- **Rate limiting and webhook idempotency are per-process.** Behind two replicas the effective limit
  doubles and a duplicate webhook can settle an order twice. This is the most dangerous of the
  in-memory limitations and belongs at the top of the pre-launch list.
- **No CSRF token rotation** within a session. The token is derived from the session id, so it
  changes only when the session does.
- **The security events go nowhere.** They are emitted and structured; nothing alerts on them.
- **`npm audit` is in `verify` but not in CI**, because there is no CI configured.

---

## 7. The §55 questions, answered honestly

| Question | Answer |
| --- | --- |
| Does it look like a template? | No. The aperture, the ledger, the mono prices and the bone/brass warmth are not from anywhere. |
| Does it look like Apple? | No. Warm neutrals, a width-axis grotesque, an italic serif, a visible grid and mono numerals are all specifically not Apple's vocabulary. |
| Does it look like a generic shop? | The home page and PDP, no. The catalogue, partly. |
| Too much content? | No. If anything the catalogue page is under-written. |
| Too many cards? | No — the home page uses hierarchy instead, and specifications are rails rather than cards. |
| Does the hierarchy work? | Yes, after the hero was rebuilt. It did not before. |
| Is the product the protagonist? | Yes — after being literally invisible twice during the build. |
| Does the user know what to do? | Yes. Price and a primary action are on the first screen of every commercial page. |
| Does mobile work? | Yes, and it is a separate design. |
| Is it fast? | Reasonably. 103 kB baseline, 125 kB catalogue, 168 kB home, and CLS 0.0000 after the rail fix. The home page is the price of the narrative. |
| Are there security risks? | Yes, and they are enumerated above and in `SECURITY.md` rather than being implied away. |

---

## 8. If there were one more day

1. Replace the in-memory stores with Postgres, and rate limiting plus webhook idempotency with Redis.
   This is the only item blocking real money.
2. Commission photography. It would improve the result more than anything else on this list.
3. Give the catalogue a point of view.
4. Drop `motion` from the home page in favour of CSS scroll-driven animations and measure the delta.
5. Add "notify me" on sold-out variants, with double opt-in.
6. Wire the `security.*` events to a sink with alerting.
