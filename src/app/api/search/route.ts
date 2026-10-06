import { MAX_SEARCH_RESULTS } from '@/config/constants';
import { SearchQuerySchema } from '@/lib/validation/schemas';
import { guarded, jsonOk } from '@/server/security/guard';
import { catalog, productInStock } from '@/server/catalog/repository';
import { productPricing } from '@/server/pricing/pricing';

/**
 * Search.
 *
 * Three things worth noting:
 *  - the query is length-capped and matched with `includes()` over a pre-built
 *    index. **No RegExp is ever constructed from user input** — that is a ReDoS
 *    primitive with nothing to recommend it here;
 *  - results are hard-capped, so a one-character query cannot ask us to serialise
 *    the whole catalogue;
 *  - the response is an explicit projection, not the product objects. The search
 *    overlay needs six fields; sending the full record (every variant, every SKU,
 *    every stock level) would hand a scraper the entire catalogue per keystroke.
 */
export const GET = guarded(
  { bucket: 'search', schema: SearchQuerySchema, source: 'query' },
  async ({ data }) => {
    const query = data.q.trim();
    if (query.length < 2) {
      return jsonOk({ query, results: [], total: 0 });
    }

    const repo = catalog();
    const matches = repo.search(query, MAX_SEARCH_RESULTS);

    return jsonOk({
      query,
      total: matches.length,
      results: matches.map((product) => {
        const pricing = productPricing(product);
        return {
          slug: product.slug,
          name: product.name,
          // Customer-facing name, not the internal slug.
          family: repo.getCategory(product.family)?.name ?? product.family,
          tagline: product.tagline,
          render: product.render,
          ...(product.photography ? { photography: product.photography } : {}),
          color: {
            hex: product.colors[0]?.hex ?? '#888',
            hexAccent: product.colors[0]?.hexAccent ?? '#999',
            name: product.colors[0]?.name ?? '',
            light: product.colors[0]?.light ?? false,
          },
          from: pricing.from,
          fromTransfer: pricing.fromTransfer,
          inStock: productInStock(product),
        };
      }),
    });
  },
);
