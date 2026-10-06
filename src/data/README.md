# Data layer — read this before touching prices

Everything in this directory is **mock data**. It is shaped exactly like the real thing so that
swapping in a live source is an implementation change behind `src/server/catalog/repository.ts`,
not a redesign.

## Prices are invented

Every `priceList` value is a plausible-looking **placeholder in ARS centavos**. None of them was
taken from OWNER STORE, from any competitor, or from any price list. They exist so that layout,
rounding, instalment splitting and the pricing tests have realistic magnitudes to work with.

`PRICES_ARE_MOCK` is exported from `catalog.ts` and is `true`. The UI reads it and renders a visible
"precios de demostración" notice. **Do not flip that flag without replacing the data**, or the
storefront will quietly start presenting invented numbers as real ones.

## Stock is deterministic, not random

`pseudoStock()` derives units-on-hand from a hash of the SKU. This is on purpose: a random value
would make the test suite flaky and would make a screenshot diff meaningless. Real stock comes from
the inventory system.

## Products are a plausible lineup, not a verified one

44 products across six families. Model names, colourways, storage tiers and specifications are
written from general knowledge of Apple's range and **may not match what is actually orderable** —
Apple's line changes several times a year, and a reseller stocks a subset of it rather than all of
it. Treat every row as a fixture, not a source of truth.

## Photography: how to add it

Every product renders as a procedural SVG today. That is the design, not a placeholder — see
`docs/creative-direction.md` §8 — but the catalogue is ready for photographs and the whole pipeline
is wired, so adding one is a data edit and nothing else. No component needs to change.

Two optional fields, both typed `Photo`:

```ts
// On Product — the hero shot, used on cards, search, the mega-menu, the rail.
photography: { src: '/products/iphone-17-pro-max.webp', alt: 'iPhone 17 Pro Max en Titanio Natural', width: 1600, height: 1600 },

// On Variant — this exact colourway. Overrides the product's shot in the configurator.
photography: { src: '/products/iphone-17-pro-max--nat.webp', alt: '…', width: 1600, height: 1600 },
```

Precedence is `variant ?? product ?? procedural render`, in one place
(`src/lib/photos.ts`), tested in `tests/unit/photos.test.ts`.

Conventions worth keeping:

- **Files go in `public/products/`**, named `<slug>.webp` and `<slug>--<colorId>.webp`. The helper
  `photoPath()` builds those names. Nothing enforces it; it just keeps a few hundred files sorted.
- **`width` and `height` are the file's real pixel size and are required.** `next/image` reserves
  the box from that ratio before the bytes arrive. This storefront measures a cumulative layout
  shift of 0.0000 and that number was expensive to get; a photo with the wrong dimensions is how it
  is lost.
- **Square, on a transparent or near-white background**, because the renders are square and the
  layouts reserve a square. A 4:3 photo will letterbox rather than break, but it will look wrong
  next to the products that have no photo yet.
- **`alt` describes the object in Spanish** — "iPhone 17 Pro Max en Titanio Natural", not "foto de
  producto".
- **A partial catalogue is fine.** Products without a photo keep their render, so photographs can
  be added one at a time without an awkward half-state.

### Where the photographs come from

Not from a search engine. Apple's product photography is theirs, and an image found on the web is
someone's copyrighted work regardless of where it was found — on a storefront that takes money,
that is the kind of thing that generates a letter. The two legitimate sources are Apple's own
marketing resources, which authorised resellers can access, and photographs taken of the actual
stock. The second is more work and better: it is unambiguously yours, and it looks like this shop
rather than like every other shop using the same press images.

If the files end up on a CDN rather than in `public/`, add that host to `images.remotePatterns` in
`next.config.ts` — it is deliberately empty, so an unlisted host is refused rather than turning the
optimiser into an open proxy.

## Replacing this with real data

1. Implement `CatalogRepository` against the real source (API, DB, Tiendanube, whatever ships).
2. Keep `sku` stable and unique — it is the **only** product identifier a client is allowed to send,
   and every price lookup is keyed on it.
3. Set `PRICES_ARE_MOCK = false` only once every price is real.
4. Leave the server-side pricing path alone. The client must never send a price. See
   `docs/threat-model.md` §4.1.
