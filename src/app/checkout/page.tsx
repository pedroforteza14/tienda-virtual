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

export default function CheckoutPage() {
  return (
    <div className="pt-[calc(var(--header-h)+1rem)]">
      {/* Shipping options are server data: the client gets labels and rates to
          display, and sends back only a zone. */}
      <CheckoutFlow shippingOptions={[...shippingOptions]} />
    </div>
  );
}
