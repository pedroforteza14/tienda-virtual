import type { Metadata } from 'next';
import { shippingOptions } from '@/data/commerce';
import { buildMetadata } from '@/lib/seo/metadata';
import { CheckoutFlow } from '@/features/checkout/CheckoutFlow';

export const metadata: Metadata = buildMetadata({
  title: 'Checkout',
  description: 'Completá tu compra en OWNER STORE.',
  path: '/checkout',
  // A checkout page has nothing to offer a search engine and should never be a
  // landing page, so it is excluded from the index.
  noIndex: true,
});

/**
 * Dynamically rendered, for two reasons that happen to point the same way.
 *
 * 1. **Live stock.** This page shows availability. Prerendering it at build time
 *    freezes stock until the next deploy, which is wrong in a way customers
 *    notice only at checkout.
 * 2. **The Content-Security-Policy nonce.** A per-request nonce cannot exist in a
 *    file generated once at build time, so a prerendered page's script tags carry
 *    no nonce and the strict CSP blocks every one of them. That is not a
 *    hypothetical: it shipped, and the entire site was non-interactive in
 *    production — no cart, no search, no configurator — while every build, lint
 *    and type check passed. See docs/threat-model.md §4.5.
 */
export const dynamic = 'force-dynamic';

export default function CheckoutPage() {
  return (
    <div className="pt-[calc(var(--header-h)+1rem)]">
      {/* Shipping options are server data: the client gets labels and rates to
          display, and sends back only a zone. */}
      <CheckoutFlow shippingOptions={[...shippingOptions]} />
    </div>
  );
}
