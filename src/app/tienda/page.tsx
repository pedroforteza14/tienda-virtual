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
