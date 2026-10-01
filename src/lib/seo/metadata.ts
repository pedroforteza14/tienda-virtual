import type { Metadata } from 'next';
import { absoluteUrl, site } from '@/config/site';

/**
 * Metadata helper.
 *
 * Centralised so every page gets a canonical URL, correct OpenGraph and Twitter
 * cards, and the right locale — and so a new page cannot ship without them by
 * omission.
 */
export function buildMetadata({
  title,
  description,
  path,
  noIndex = false,
  ogType = 'website',
}: {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
  ogType?: 'website' | 'article' | 'product';
}): Metadata {
  const url = absoluteUrl(path);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: site.name,
      locale: 'es_AR',
      // `product` is valid OG but not in Next's narrowed union, so commerce pages
      // declare `website` and carry the product detail in JSON-LD instead.
      type: ogType === 'product' ? 'website' : ogType,
      images: [{ url: absoluteUrl('/opengraph-image'), width: 1200, height: 630, alt: site.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [absoluteUrl('/opengraph-image')],
    },
    robots: noIndex
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true, 'max-image-preview': 'large' },
  };
}
