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

Model names, colourways, storage tiers and specifications are written from general knowledge of
Apple's range and may not match what is actually orderable. Treat them as fixtures.

## Replacing this with real data

1. Implement `CatalogRepository` against the real source (API, DB, Tiendanube, whatever ships).
2. Keep `sku` stable and unique — it is the **only** product identifier a client is allowed to send,
   and every price lookup is keyed on it.
3. Set `PRICES_ARE_MOCK = false` only once every price is real.
4. Leave the server-side pricing path alone. The client must never send a price. See
   `docs/threat-model.md` §4.1.
