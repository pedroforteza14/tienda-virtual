import type { MetadataRoute } from 'next';

/**
 * robots.txt.
 *
 * Anything per-session or transactional is disallowed. Note that `Disallow` is a
 * crawling hint, not an access control — those paths are protected by session
 * ownership checks regardless (docs/threat-model.md §4.4). This is here so crawler
 * budget goes to the catalogue, not so order pages stay private.
 *
 * **Keyed on the configured origin, not `NODE_ENV`.** This file is prerendered at
 * build time, and a staging deployment is built with `NODE_ENV=production` too —
 * so checking the environment would publish a permissive robots.txt on staging and
 * let it outrank the real site. Instead, indexing is allowed only when the build
 * was given a real https origin, and `NEXT_PUBLIC_ALLOW_INDEXING=false` turns it
 * off explicitly for a staging host that has one.
 */
function indexingAllowed(): boolean {
  if (process.env.NEXT_PUBLIC_ALLOW_INDEXING === 'false') return false;

  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) return false;

  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return false;
    // Loopback and private hosts are never a public site.
    return !/^(localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.)/.test(hostname);
  } catch {
    return false;
  }
}

export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed()) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL!).origin;

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/checkout', '/pedido/', '/cuenta'],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
