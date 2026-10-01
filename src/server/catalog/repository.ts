import { categories, products } from '@/data/catalog';
import { MAX_SEARCH_RESULTS } from '@/config/constants';
import type { SortOption } from '@/lib/validation/schemas';
import type { Category, DeviceFamily, Product, UseCase, Variant } from '@/types/catalog';

/**
 * The catalogue's read interface.
 *
 * Everything that needs product data goes through this, which is what makes the
 * mock data swappable: implement these methods against a real source and nothing
 * upstream changes. It is read-only on purpose — the storefront has no business
 * writing to the catalogue.
 *
 * Security note: this module is the **single source of truth for price and
 * stock**. No other code is allowed to originate either value. See
 * docs/threat-model.md §4.1–4.2.
 */
export interface CatalogRepository {
  listCategories(): readonly Category[];
  getCategory(slug: string): Category | null;
  listProducts(): readonly Product[];
  getProductBySlug(slug: string): Product | null;
  /** Resolves a SKU to its product and variant, or null. The ONLY SKU→price path. */
  resolveSku(sku: string): { product: Product; variant: Variant } | null;
  search(query: string, limit?: number): Product[];
  filter(options: FilterOptions): { items: Product[]; total: number };
  recommend(useCase: UseCase, budget: BudgetTier, limit?: number): Product[];
}

export type BudgetTier = 'entry' | 'mid' | 'premium' | 'any';

export interface FilterOptions {
  family?: DeviceFamily | undefined;
  colorId?: string | undefined;
  storage?: string | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  inStockOnly?: boolean;
  useCase?: UseCase | undefined;
  sort?: SortOption;
  page?: number;
  pageSize?: number;
}

/* -------------------------------------------------------------------------- */

/** Cheapest variant — what "desde $X" means on a card. */
export function cheapestVariant(product: Product): Variant {
  // Every product is authored with at least one variant; the fallback keeps the
  // return type honest without an assertion.
  let cheapest = product.variants[0];
  if (!cheapest) throw new Error(`Catalogue integrity: ${product.slug} has no variants`);
  for (const variant of product.variants) {
    if (variant.priceList < cheapest.priceList) cheapest = variant;
  }
  return cheapest;
}

export function productFromPrice(product: Product): number {
  return cheapestVariant(product).priceList;
}

export function productInStock(product: Product): boolean {
  return product.variants.some((variant) => variant.stock > 0);
}

function normalise(value: string): string {
  // Strip diacritics so "ipad air" matches "iPad Air" and "púrpura" matches "purpura".
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/** Searchable text, precomputed once at module load rather than per keystroke. */
const searchIndex: ReadonlyMap<string, string> = new Map(
  products.map((product) => [
    product.slug,
    normalise(
      [
        product.name,
        product.family,
        product.tagline,
        product.summary,
        ...product.colors.map((c) => c.name),
        ...product.storages,
        ...product.sizes,
        ...product.specs.map((s) => `${s.label} ${s.value}`),
      ].join(' '),
    ),
  ]),
);

const bySku: ReadonlyMap<string, { product: Product; variant: Variant }> = (() => {
  const map = new Map<string, { product: Product; variant: Variant }>();
  for (const product of products) {
    for (const variant of product.variants) {
      if (map.has(variant.sku)) {
        throw new Error(`Catalogue integrity: duplicate SKU ${variant.sku}`);
      }
      map.set(variant.sku, { product, variant });
    }
  }
  return map;
})();

const bySlug: ReadonlyMap<string, Product> = new Map(products.map((p) => [p.slug, p]));

const BUDGET_CEILINGS: Record<Exclude<BudgetTier, 'any'>, number> = {
  entry: 100_000_000, // ARS 1.000.000
  mid: 250_000_000, // ARS 2.500.000
  premium: Number.MAX_SAFE_INTEGER,
};

export const inMemoryCatalog: CatalogRepository = {
  listCategories: () => categories,

  getCategory: (slug) => categories.find((category) => category.slug === slug) ?? null,

  listProducts: () => products,

  getProductBySlug: (slug) => bySlug.get(slug) ?? null,

  resolveSku: (sku) => bySku.get(sku) ?? null,

  /**
   * Substring scoring over a bounded in-memory index.
   *
   * Explicitly **not** a user-built RegExp: `new RegExp(userInput)` is a
   * ReDoS primitive, and there is no version of it worth the risk here.
   * `includes()` on a pre-normalised string is O(n·m) over ~20 products.
   */
  search: (query, limit = MAX_SEARCH_RESULTS) => {
    const needle = normalise(query);
    if (needle.length < 2) return [];

    const terms = needle.split(/\s+/).filter(Boolean).slice(0, 6);
    const scored: { product: Product; score: number }[] = [];

    for (const product of products) {
      const haystack = searchIndex.get(product.slug) ?? '';
      const name = normalise(product.name);

      let score = 0;
      let matchedAll = true;

      for (const term of terms) {
        if (name.startsWith(term)) score += 100;
        else if (name.includes(term)) score += 60;
        else if (haystack.includes(term)) score += 20;
        else matchedAll = false;
      }

      if (matchedAll && score > 0) {
        scored.push({ product, score: score + product.rank / 100 });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(limit, MAX_SEARCH_RESULTS))
      .map((entry) => entry.product);
  },

  filter: (options) => {
    const {
      family,
      colorId,
      storage,
      minPrice,
      maxPrice,
      inStockOnly = false,
      useCase,
      sort = 'recommended',
      page = 1,
      pageSize = 12,
    } = options;

    let items = products.filter((product) => {
      if (family && product.family !== family) return false;
      if (useCase && !product.useCases.includes(useCase)) return false;
      if (colorId && !product.colors.some((c) => c.id === colorId)) return false;
      if (storage) {
        const wanted = storage.toLowerCase().replace(/\s+/g, '');
        const has = product.variants.some(
          (v) => (v.storage ?? '').toLowerCase().replace(/\s+/g, '') === wanted,
        );
        if (!has) return false;
      }
      if (inStockOnly && !productInStock(product)) return false;

      const from = productFromPrice(product);
      if (minPrice !== undefined && from < minPrice) return false;
      if (maxPrice !== undefined && from > maxPrice) return false;

      return true;
    });

    items = [...items].sort((a, b) => {
      switch (sort) {
        case 'price-asc':
          return productFromPrice(a) - productFromPrice(b);
        case 'price-desc':
          return productFromPrice(b) - productFromPrice(a);
        case 'newest':
          return b.releasedAt.localeCompare(a.releasedAt) || b.rank - a.rank;
        case 'recommended':
        default:
          return b.rank - a.rank || a.name.localeCompare(b.name, 'es-AR');
      }
    });

    const total = items.length;
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total };
  },

  recommend: (useCase, budget, limit = 4) => {
    const ceiling = budget === 'any' ? Number.MAX_SAFE_INTEGER : BUDGET_CEILINGS[budget];

    const matches = products
      .filter((product) => product.useCases.includes(useCase))
      .filter((product) => productFromPrice(product) <= ceiling)
      .sort((a, b) => {
        // Prefer products whose primary use case is the one asked for.
        const aPrimary = a.useCases[0] === useCase ? 1 : 0;
        const bPrimary = b.useCases[0] === useCase ? 1 : 0;
        return bPrimary - aPrimary || b.rank - a.rank;
      });

    // Spread across families so a recommendation is a kit, not four iPhones.
    const seen = new Set<DeviceFamily>();
    const spread: Product[] = [];
    for (const product of matches) {
      if (seen.has(product.family)) continue;
      seen.add(product.family);
      spread.push(product);
      if (spread.length >= limit) break;
    }
    // Backfill if we ran out of distinct families.
    for (const product of matches) {
      if (spread.length >= limit) break;
      if (!spread.includes(product)) spread.push(product);
    }
    return spread;
  },
};

/** The single accessor. Swapping data sources happens here and nowhere else. */
export function catalog(): CatalogRepository {
  return inMemoryCatalog;
}
