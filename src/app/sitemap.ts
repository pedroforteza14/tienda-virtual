import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/config/site';
import { catalog } from '@/server/catalog/repository';
import { legalPages } from '@/data/legal';

/**
 * Sitemap.
 *
 * Only indexable pages are listed. Checkout, the order page and the account page
 * are per-session and `noIndex`, so including them would be a contradiction — and
 * an order URL in a sitemap would be a privacy leak.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const repo = catalog();
  const now = new Date();

  return [
    { url: absoluteUrl('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/tienda'), lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/descubri'), lastModified: now, changeFrequency: 'monthly', priority: 0.7 },

    ...repo.listCategories().map((category) => ({
      url: absoluteUrl(`/tienda/${category.slug}`),
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),

    ...repo.listProducts().map((product) => ({
      url: absoluteUrl(`/producto/${product.slug}`),
      // Real `lastModified` from the catalogue, not `now` — telling a crawler
      // everything changed today is how a sitemap stops being trusted.
      lastModified: new Date(product.releasedAt),
      changeFrequency: 'weekly' as const,
      priority: product.featured ? 0.9 : 0.7,
    })),

    ...legalPages.map((page) => ({
      url: absoluteUrl(`/legal/${page.slug}`),
      lastModified: new Date(page.updated),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];
}
