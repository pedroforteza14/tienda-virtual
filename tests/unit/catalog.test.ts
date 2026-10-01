import { describe, expect, it } from 'vitest';
import { PRICES_ARE_MOCK, categories, products } from '@/data/catalog';
import { catalog, cheapestVariant, productFromPrice, productInStock } from '@/server/catalog/repository';
import { DEVICE_FAMILIES, RENDER_KINDS, USE_CASES } from '@/types/catalog';
import { assertCentavos } from '@/lib/money';
import { SkuSchema, SlugSchema } from '@/lib/validation/schemas';

/**
 * Catalogue integrity.
 *
 * These are the assertions that catch a data mistake before it becomes a runtime
 * error on a product page — a duplicate SKU, a `pairsWith` pointing at nothing, a
 * colour id that no variant uses. The mock data is hand-written, so it needs this.
 */
describe('catalogue integrity', () => {
  it('declares its prices as mock', () => {
    // If this flips, the UI stops showing the demo notice — so it must only flip
    // deliberately, alongside real data. See src/data/README.md.
    expect(PRICES_ARE_MOCK).toBe(true);
  });

  it('has unique, well-formed slugs', () => {
    const slugs = products.map((product) => product.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(SlugSchema.safeParse(slug).success, slug).toBe(true);
    }
  });

  it('has globally unique, well-formed SKUs', () => {
    const skus = products.flatMap((product) => product.variants.map((variant) => variant.sku));
    expect(skus.length).toBeGreaterThan(50);
    expect(new Set(skus).size).toBe(skus.length);
    for (const sku of skus) {
      expect(SkuSchema.safeParse(sku).success, sku).toBe(true);
    }
  });

  it('gives every product at least one variant and a valid render kind', () => {
    for (const product of products) {
      expect(product.variants.length, product.slug).toBeGreaterThan(0);
      expect(RENDER_KINDS).toContain(product.render);
      expect(DEVICE_FAMILIES).toContain(product.family);
      expect(product.useCases.length, product.slug).toBeGreaterThan(0);
      for (const useCase of product.useCases) expect(USE_CASES).toContain(useCase);
    }
  });

  it('prices every variant as a valid integer amount', () => {
    for (const product of products) {
      for (const variant of product.variants) {
        expect(() => assertCentavos(variant.priceList), variant.sku).not.toThrow();
        expect(variant.priceList).toBeGreaterThan(0);
        expect(Number.isInteger(variant.stock)).toBe(true);
        expect(variant.stock).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('references only colourways the product actually declares', () => {
    for (const product of products) {
      const ids = new Set(product.colors.map((color) => color.id));
      for (const variant of product.variants) {
        expect(ids.has(variant.colorId), `${variant.sku} → ${variant.colorId}`).toBe(true);
      }
      // And every declared colour is used by at least one variant.
      const used = new Set(product.variants.map((variant) => variant.colorId));
      for (const id of ids) {
        expect(used.has(id), `${product.slug} colour ${id} is unused`).toBe(true);
      }
    }
  });

  it('declares storage/size tiers that match the variants', () => {
    for (const product of products) {
      const tiers = product.storages.length > 0 ? product.storages : product.sizes;
      const variantTiers = new Set(
        product.variants.map((variant) => variant.storage ?? variant.size ?? ''),
      );
      if (tiers.length === 0) {
        expect(variantTiers, product.slug).toEqual(new Set(['']));
      } else {
        for (const tier of tiers) {
          expect(variantTiers.has(tier), `${product.slug} missing tier ${tier}`).toBe(true);
        }
      }
    }
  });

  it('resolves every pairsWith SKU — a broken cross-sell is a broken cart button', () => {
    for (const product of products) {
      for (const sku of product.pairsWith) {
        expect(catalog().resolveSku(sku), `${product.slug} → ${sku}`).not.toBeNull();
      }
    }
  });

  it('gives every product SEO copy within sensible limits', () => {
    for (const product of products) {
      expect(product.seo.title.length, product.slug).toBeGreaterThan(20);
      expect(product.seo.title.length, product.slug).toBeLessThanOrEqual(75);
      expect(product.seo.description.length, product.slug).toBeGreaterThan(70);
      expect(product.seo.description.length, product.slug).toBeLessThanOrEqual(200);
      expect(product.specs.length, product.slug).toBeGreaterThanOrEqual(4);
      expect(product.highlights.length, product.slug).toBeGreaterThanOrEqual(3);
    }
  });

  it('has a non-empty category for every family', () => {
    expect(categories).toHaveLength(DEVICE_FAMILIES.length);
    for (const family of DEVICE_FAMILIES) {
      const members = products.filter((product) => product.family === family);
      expect(members.length, family).toBeGreaterThan(0);
    }
  });

  it('exercises the out-of-stock UI somewhere', () => {
    // The pseudo-random stock function is meant to leave some variants at zero so
    // the sold-out states are always reachable in development and in screenshots.
    const soldOut = products.flatMap((product) =>
      product.variants.filter((variant) => variant.stock === 0),
    );
    expect(soldOut.length).toBeGreaterThan(0);
    // But not so many that the catalogue looks closed.
    const total = products.flatMap((product) => product.variants).length;
    expect(soldOut.length / total).toBeLessThan(0.3);
  });
});

describe('repository helpers', () => {
  it('finds the cheapest variant and uses it for "desde"', () => {
    for (const product of products) {
      const cheapest = cheapestVariant(product);
      for (const variant of product.variants) {
        expect(variant.priceList).toBeGreaterThanOrEqual(cheapest.priceList);
      }
      expect(productFromPrice(product)).toBe(cheapest.priceList);
    }
  });

  it('reports stock at the product level', () => {
    for (const product of products) {
      const expected = product.variants.some((variant) => variant.stock > 0);
      expect(productInStock(product), product.slug).toBe(expected);
    }
  });

  it('resolves and rejects SKUs correctly', () => {
    const sku = products[0]!.variants[0]!.sku;
    expect(catalog().resolveSku(sku)?.variant.sku).toBe(sku);
    expect(catalog().resolveSku('OWN-NOPE')).toBeNull();
    expect(catalog().resolveSku('')).toBeNull();
  });
});

describe('search', () => {
  const repo = catalog();

  it('matches a model name', () => {
    const results = repo.search('iphone 17 pro');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.name.toLowerCase()).toContain('iphone 17 pro');
  });

  it('is accent- and case-insensitive', () => {
    expect(repo.search('PÚRPURA').length).toBeGreaterThan(0);
    expect(repo.search('purpura').length).toBeGreaterThan(0);
    expect(repo.search('MACBOOK').length).toBeGreaterThan(0);
  });

  it('requires at least two characters', () => {
    expect(repo.search('a')).toHaveLength(0);
    expect(repo.search('')).toHaveLength(0);
    expect(repo.search(' ')).toHaveLength(0);
  });

  it('returns nothing for a term that matches nothing', () => {
    expect(repo.search('zzzzzzzz')).toHaveLength(0);
    expect(repo.search('samsung galaxy')).toHaveLength(0);
  });

  it('requires every term to match, not just one', () => {
    // "iphone" matches, "tractor" does not, so the conjunction is empty.
    expect(repo.search('iphone tractor')).toHaveLength(0);
  });

  it('respects the result cap', () => {
    expect(repo.search('a e i o u pro max').length).toBeLessThanOrEqual(12);
    expect(repo.search('apple', 3).length).toBeLessThanOrEqual(3);
  });

  it('is not vulnerable to a regex-shaped query', () => {
    // No RegExp is built from input, so these are matched literally and return
    // nothing rather than throwing or hanging.
    for (const query of ['(a+)+$', '[[[[', '.*', '\\', '(?i)iphone', 'a{1000000}']) {
      expect(() => repo.search(query)).not.toThrow();
    }
  });

  it('completes a pathological query quickly', () => {
    const started = performance.now();
    repo.search('a'.repeat(64));
    expect(performance.now() - started).toBeLessThan(100);
  });
});

describe('filtering and recommendations', () => {
  const repo = catalog();

  it('filters by family', () => {
    const { items, total } = repo.filter({ family: 'iphone', pageSize: 50 });
    expect(total).toBeGreaterThan(0);
    for (const product of items) expect(product.family).toBe('iphone');
  });

  it('filters by price range on the "from" price', () => {
    const { items } = repo.filter({ maxPrice: 100_000_000, pageSize: 50 });
    for (const product of items) {
      expect(productFromPrice(product)).toBeLessThanOrEqual(100_000_000);
    }
  });

  it('sorts ascending and descending by price', () => {
    const asc = repo.filter({ sort: 'price-asc', pageSize: 50 }).items.map(productFromPrice);
    const desc = repo.filter({ sort: 'price-desc', pageSize: 50 }).items.map(productFromPrice);
    expect([...asc].sort((a, b) => a - b)).toEqual(asc);
    expect([...desc].sort((a, b) => b - a)).toEqual(desc);
  });

  it('sorts by release date for novedades', () => {
    const dates = repo
      .filter({ sort: 'newest', pageSize: 50 })
      .items.map((product) => product.releasedAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('paginates without overlap or loss', () => {
    const pageSize = 5;
    const first = repo.filter({ pageSize, page: 1 });
    const second = repo.filter({ pageSize, page: 2 });
    expect(first.items).toHaveLength(pageSize);
    const overlap = first.items.filter((product) => second.items.includes(product));
    expect(overlap).toHaveLength(0);
    expect(first.total).toBe(second.total);
  });

  it('returns an empty page past the end rather than erroring', () => {
    expect(repo.filter({ page: 999, pageSize: 12 }).items).toHaveLength(0);
  });

  it('recommends across families rather than four of the same thing', () => {
    for (const useCase of USE_CASES) {
      const results = repo.recommend(useCase, 'any', 4);
      expect(results.length, useCase).toBeGreaterThan(0);
      for (const product of results) {
        expect(product.useCases, product.slug).toContain(useCase);
      }
      // At most one duplicate family in a set of four.
      const families = results.map((product) => product.family);
      expect(new Set(families).size).toBeGreaterThanOrEqual(Math.min(2, results.length));
    }
  });

  it('respects a budget ceiling', () => {
    const entry = repo.recommend('everyday', 'entry', 4);
    for (const product of entry) {
      expect(productFromPrice(product)).toBeLessThanOrEqual(100_000_000);
    }
  });
});
