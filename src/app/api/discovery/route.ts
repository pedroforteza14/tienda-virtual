import { DiscoveryAnswersSchema } from '@/lib/validation/schemas';
import { guarded, jsonOk } from '@/server/security/guard';
import { catalog, productInStock } from '@/server/catalog/repository';
import { productPricing } from '@/server/pricing/pricing';

/**
 * "Find your device" recommendations.
 *
 * Deliberately a server route rather than client-side filtering: the ranking is
 * merchandising logic, and merchandising logic shipped to the browser is logic a
 * competitor can read and a customer can tamper with. It also keeps the whole
 * catalogue out of the initial bundle.
 */
export const POST = guarded(
  { bucket: 'api', schema: DiscoveryAnswersSchema },
  async ({ data }) => {
    const repo = catalog();
    const recommendations = repo.recommend(data.useCase, data.budget, 4);

    return jsonOk({
      useCase: data.useCase,
      results: recommendations.map((product) => {
        const pricing = productPricing(product);
        return {
          slug: product.slug,
          name: product.name,
          // The customer-facing category name, not the internal slug: the
          // recommendation eyebrow was reading "ACCESSORIES" at people.
          family: repo.getCategory(product.family)?.name ?? product.family,
          tagline: product.tagline,
          summary: product.summary,
          highlights: product.highlights.slice(0, 2),
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
          instalment: pricing.instalment,
          instalmentCount: pricing.instalmentCount,
          inStock: productInStock(product),
        };
      }),
    });
  },
);
