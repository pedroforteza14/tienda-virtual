import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware. One job: a per-request, nonce-based Content-Security-Policy.
 *
 * Why here and not in `next.config.ts`: the nonce must be fresh per response,
 * and static headers cannot be. Everything that *is* static (HSTS,
 * Permissions-Policy, nosniff, …) lives in `next.config.ts` so it is served by
 * the CDN without running any code.
 *
 * This file deliberately contains **no crypto and no session logic**. The Edge
 * runtime has no `node:crypto`, and maintaining a second signing implementation
 * to work around that would be two implementations of the control that protects
 * every cookie. Sessions are issued by `GET /api/session` instead, which runs on
 * Node and reuses the one signing module.
 */

/** Nonce from the Web Crypto API, which the Edge runtime does provide. */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function buildCsp(nonce: string, isDev: boolean): string {
  const directives: string[] = [
    `default-src 'self'`,

    /**
     * `strict-dynamic` means the allow-list is the nonce, not a host list: a
     * script injected into the DOM by markup has no nonce and will not run, even
     * though it is same-origin. That is what makes this policy worth having
     * against a skimmer.
     *
     * `unsafe-eval` in development only — the dev-mode React refresh runtime
     * needs it. Production never gets it.
     */
    isDev
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,

    /**
     * `unsafe-inline` for styles is a considered trade-off, not an oversight.
     * React renders the `style` prop as a `style` attribute during SSR, and
     * Next inlines critical CSS — both need it. The residual risk is style
     * injection (defacement, and exfiltration only in exotic setups), which is
     * an order of magnitude less severe than script execution. Scripts keep the
     * strict policy, which is where it counts.
     */
    `style-src 'self' 'unsafe-inline'`,

    // `data:` for the inline SVG device renders; `blob:` for canvas-derived
    // images. No third-party image host — product photography is self-hosted.
    `img-src 'self' data: blob:`,

    // `next/font` self-hosts at build time, so no Google Fonts origin is needed.
    `font-src 'self'`,

    // Same-origin API only. A dependency compromised at build time still cannot
    // exfiltrate to its own server. Add a PSP origin here only if an embedded
    // payment form is ever introduced.
    `connect-src 'self'`,

    // Nothing is framed, and we cannot be framed. Clickjacking closed both ways.
    `frame-src 'none'`,
    `frame-ancestors 'none'`,

    `object-src 'none'`,
    // Blocks `<base href>` injection, which otherwise re-points every relative
    // URL on the page, including form actions.
    `base-uri 'none'`,
    // Forms may only post to us. A stolen checkout form cannot submit elsewhere.
    `form-action 'self'`,
    `manifest-src 'self'`,
    `worker-src 'self' blob:`,
    `media-src 'self'`,
  ];

  if (!isDev) directives.push('upgrade-insecure-requests');

  return directives.join('; ');
}

export function middleware(request: NextRequest): NextResponse {
  const isDev = process.env.NODE_ENV !== 'production';
  const nonce = generateNonce();
  const csp = buildCsp(nonce, isDev);

  // Start from the incoming headers, then remove anything a client could have
  // sent that we are about to assert ourselves. Without this, a request could
  // arrive carrying its own `x-nonce` and a handler downstream might trust it.
  const headers = new Headers(request.headers);
  headers.delete('x-nonce');
  headers.delete('x-owner-session');
  headers.delete('x-middleware-csp');

  headers.set('x-nonce', nonce);
  // Next parses the nonce out of the *request* CSP header and applies it to the
  // scripts it emits. Both request and response must carry the policy.
  headers.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

export const config = {
  /**
   * Skip static assets and the image optimiser: they are not HTML, cannot
   * execute script, and running middleware for each would add latency to every
   * byte of the page for nothing.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)'],
};
