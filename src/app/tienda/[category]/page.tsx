import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CatalogQuerySchema } from '@/lib/validation/schemas';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd } from '@/lib/seo/json-ld';
import { breadcrumbSchema, itemListSchema } from '@/lib/seo/schema';
import { catalog } from '@/server/catalog/repository';
import { CatalogView } from '@/features/products/CatalogView';
import { DEVICE_FAMILIES, type DeviceFamily } from '@/types/catalog';

function resolveCategory(value: string): DeviceFamily | null {
  return (DEVICE_FAMILIES as readonly string[]).includes(value) ? (value as DeviceFamily) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const family = resolveCategory(category);
  const data = family ? catalog().getCategory(family) : null;

  if (!data) {
    return buildMetadata({
      title: 'Categoría no encontrada',
      description: 'La categoría que buscás no existe.',
      path: '/tienda',
      noIndex: true,
    });
  }

  return buildMetadata({
    title: `${data.name} — precios en Argentina, cuotas y stock`,
    description: `${data.blurb} Precio transferencia, 12 cuotas sin interés y envío a todo el país.`,
    path: `/tienda/${data.slug}`,
  });
}

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
 *
 * `generateStaticParams` was removed rather than left in place: with
 * `force-dynamic` it does nothing, and leaving it would suggest these routes are
 * prerendered when they must not be. An unknown slug is still a `notFound()`.
 */
export const dynamic = 'force-dynamic';

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ category }, raw] = await Promise.all([params, searchParams]);

  const family = resolveCategory(category);
  if (!family) notFound();

  const data = catalog().getCategory(family);
  if (!data) notFound();

  const flat = Object.fromEntries(
    Object.entries(raw)
      .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
      .filter(([, value]) => value !== undefined && value !== ''),
  );

  const parsed = CatalogQuerySchema.safeParse(flat);
  if (!parsed.success) notFound();

  const products = catalog()
    .listProducts()
    .filter((product) => product.family === family);

  return (
    <>
      <CatalogView
        query={parsed.data}
        family={family}
        heading={data.display}
        intro={data.blurb}
      />
      <JsonLd data={itemListSchema(products, `/tienda/${family}`)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Inicio', path: '/' },
          { name: 'Catálogo', path: '/tienda' },
          { name: data.name, path: `/tienda/${family}` },
        ])}
      />
    </>
  );
}
