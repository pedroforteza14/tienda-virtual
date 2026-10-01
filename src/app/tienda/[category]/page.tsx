import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CatalogQuerySchema } from '@/lib/validation/schemas';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd } from '@/lib/seo/json-ld';
import { breadcrumbSchema, itemListSchema } from '@/lib/seo/schema';
import { catalog } from '@/server/catalog/repository';
import { CatalogView } from '@/features/products/CatalogView';
import { DEVICE_FAMILIES, type DeviceFamily } from '@/types/catalog';

/** Pre-render every category at build time; there are six and they never change. */
export function generateStaticParams() {
  return DEVICE_FAMILIES.map((category) => ({ category }));
}

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
