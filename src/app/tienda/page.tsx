import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CatalogQuerySchema } from '@/lib/validation/schemas';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd } from '@/lib/seo/json-ld';
import { breadcrumbSchema, itemListSchema } from '@/lib/seo/schema';
import { catalog } from '@/server/catalog/repository';
import { CatalogView } from '@/features/products/CatalogView';

export const metadata: Metadata = buildMetadata({
  title: 'Catálogo — iPhone, Mac, iPad, Watch y AirPods',
  description:
    'Todo el catálogo de OWNER STORE: iPhone, Mac, iPad, Apple Watch, AirPods y accesorios. ' +
    'Precio transferencia, 12 cuotas sin interés, garantía de 12 meses y envíos a todo el país.',
  path: '/tienda',
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

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;

  // Flatten repeated params to the first value, then validate. A malformed filter
  // is a 404 rather than a silent fallback, so a broken link is visible instead of
  // quietly showing the wrong products.
  const flat = Object.fromEntries(
    Object.entries(raw)
      .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
      .filter(([, value]) => value !== undefined && value !== ''),
  );

  const parsed = CatalogQuerySchema.safeParse(flat);
  if (!parsed.success) notFound();

  const products = catalog().listProducts();

  return (
    <>
      <CatalogView
        query={parsed.data}
        heading="Everything we stand behind."
        intro="Veinte equipos elegidos uno por uno. Si no está acá, no lo vendemos."
      />
      <JsonLd data={itemListSchema(products, '/tienda')} />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Inicio', path: '/' },
          { name: 'Catálogo', path: '/tienda' },
        ])}
      />
    </>
  );
}
