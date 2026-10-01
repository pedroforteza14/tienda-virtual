import { absoluteUrl, site } from '@/config/site';
import { PRICES_ARE_MOCK } from '@/data/catalog';
import { productPricing } from '@/server/pricing/pricing';
import { cheapestVariant, productInStock } from '@/server/catalog/repository';
import type { Product } from '@/types/catalog';

/**
 * Structured data builders.
 *
 * One honesty constraint runs through all of this: structured data is a *claim*
 * made to search engines and aggregators. While the catalogue is mock, every
 * `Offer` is marked `priceValidUntil` in the past and availability is reported
 * from the real stock figure, so a crawler is never told an invented price is
 * a current, binding one. Replacing the mock data flips `PRICES_ARE_MOCK` and the
 * offers become ordinary.
 */

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': absoluteUrl('/#organization'),
    name: site.name,
    url: site.url,
    description: site.description,
    email: site.contact.email,
    sameAs: [`https://www.instagram.com/${site.contact.instagram}/`],
    address: {
      '@type': 'PostalAddress',
      addressLocality: site.store.city,
      addressRegion: site.store.province,
      addressCountry: site.store.country,
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'sales',
      telephone: `+${site.contact.whatsapp}`,
      availableLanguage: ['es-AR'],
      areaServed: 'AR',
    },
  };
}

export function webSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': absoluteUrl('/#website'),
    name: site.name,
    url: site.url,
    inLanguage: site.locale,
    publisher: { '@id': absoluteUrl('/#organization') },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: absoluteUrl('/tienda?q={search_term_string}'),
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function productSchema(product: Product) {
  const pricing = productPricing(product);
  const cheapest = cheapestVariant(product);
  const inStock = productInStock(product);

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': absoluteUrl(`/producto/${product.slug}#product`),
    name: product.name,
    description: product.summary,
    category: product.family,
    brand: { '@type': 'Brand', name: 'Apple' },
    sku: cheapest.sku,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'ARS',
      lowPrice: (pricing.from / 100).toFixed(2),
      highPrice: (
        Math.max(...product.variants.map((variant) => variant.priceList)) / 100
      ).toFixed(2),
      offerCount: product.variants.length,
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      // While prices are mock, they are published as already expired so no
      // aggregator treats them as a live quote.
      priceValidUntil: PRICES_ARE_MOCK ? '2020-01-01' : undefined,
      seller: { '@id': absoluteUrl('/#organization') },
      url: absoluteUrl(`/producto/${product.slug}`),
    },
    additionalProperty: product.specs.map((spec) => ({
      '@type': 'PropertyValue',
      name: spec.label,
      value: spec.value,
    })),
  };
}

export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function itemListSchema(products: readonly Product[], path: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    url: absoluteUrl(path),
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(`/producto/${product.slug}`),
      name: product.name,
    })),
  };
}
