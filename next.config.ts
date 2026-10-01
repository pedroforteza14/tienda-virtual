import type { NextConfig } from 'next';

/**
 * Security headers that are identical for every response live here, so they are
 * applied by the edge/CDN layer without running middleware.
 *
 * `Content-Security-Policy` is deliberately NOT here: it needs a per-request
 * nonce, so it is emitted by `src/middleware.ts`. See docs/threat-model.md.
 */
const securityHeaders = [
  // Opt out of Google's FLoC/Topics and lock down powerful features we never use.
  {
    key: 'Permissions-Policy',
    value: [
      'accelerometer=()',
      'autoplay=(self)',
      'camera=()',
      'display-capture=()',
      'encrypted-media=()',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'payment=(self)',
      'usb=()',
      'xr-spatial-tracking=()',
      'browsing-topics=()',
    ].join(', '),
  },
  // Never let a browser sniff a response into a different type than we declared.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Legacy clickjacking defence. Modern browsers use CSP `frame-ancestors`.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Send the origin cross-site (needed by payment providers for referrer checks)
  // but never the full path, which can carry order references.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Do not let Chrome/Safari treat us as a DNS-prefetch source for third parties.
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  // Isolate our browsing context group: blocks cross-origin popups from reaching
  // back into `window.opener`, and is required for a trustworthy checkout.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Fail the production build on a type or lint error instead of shipping it.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  experimental: {
    // Only ship the parts of `motion` that a route actually imports.
    optimizePackageImports: ['motion'],
  },

  images: {
    // Product photography is served from our own origin or an explicitly
    // allow-listed CDN. A wildcard here would let any host inject content
    // through our optimiser (and burn our bandwidth doing it).
    remotePatterns: [],
    formats: ['image/avif', 'image/webp'],
    // Only the widths our layouts actually request.
    deviceSizes: [390, 640, 828, 1080, 1280, 1536, 1920],
    imageSizes: [96, 160, 256, 384],
    // SVG through the optimiser is an XSS vector; our device renders are inline
    // React components, never optimiser input.
    dangerouslyAllowSVG: false,
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // HSTS only makes sense over TLS, and preloading a localhost dev server
        // would be hostile, so it is scoped to production builds.
        source: '/:path*',
        headers:
          process.env.NODE_ENV === 'production'
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : [],
      },
      {
        // Immutable, content-hashed font files.
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // Every API response is per-session and must never be cached by a shared
        // proxy. Individual routes may relax this.
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0, must-revalidate' },
          { key: 'Vary', value: 'Origin, Cookie' },
        ],
      },
    ];
  },
};

export default nextConfig;
