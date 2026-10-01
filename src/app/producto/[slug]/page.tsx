import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd } from '@/lib/seo/json-ld';
import { breadcrumbSchema, productSchema } from '@/lib/seo/schema';
import { catalog } from '@/server/catalog/repository';
import { availableStock } from '@/server/orders/inventory';
import { variantPricing } from '@/server/pricing/pricing';
import { toCardData } from '@/features/products/card-data';
import {
  ProductConfigurator,
  type ConfiguratorVariant,
} from '@/features/products/ProductConfigurator';
import { ProductCard } from '@/features/products/ProductCard';
import { SpecRails } from '@/components/ui/SpecRail';
import { Reveal } from '@/components/motion/Reveal';
import { Ledger } from '@/components/layout/Ledger';
import { PRICES_ARE_MOCK } from '@/data/catalog';

/** Every product is pre-rendered at build time. */
export function generateStaticParams() {
  return catalog()
    .listProducts()
    .map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = catalog().getProductBySlug(slug);

  if (!product) {
    return buildMetadata({
      title: 'Producto no encontrado',
      description: 'El producto que buscás no existe o ya no está disponible.',
      path: '/tienda',
      noIndex: true,
    });
  }

  return buildMetadata({
    title: product.seo.title,
    description: product.seo.description,
    path: `/producto/${product.slug}`,
    ogType: 'product',
  });
}

/**
 * The product detail page.
 *
 * Order on **mobile** is price → variants → CTA → story; on desktop the story sits
 * beside the configurator. That inversion is deliberate (docs/design-system.md,
 * Responsive): the phone visitor arrived from an Instagram story and is here to
 * find out the price and buy, and narrative above the fold costs that sale.
 *
 * Only the configurator is a client component. Specs, cross-sells, breadcrumbs and
 * structured data are all server-rendered.
 */
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = catalog().getProductBySlug(slug);
  if (!product) notFound();

  const category = catalog().getCategory(product.family);

  /**
   * Prices are computed **here, on the server**, for every variant, and passed to
   * the configurator as data. The client displays them; it never derives them.
   */
  const variants: ConfiguratorVariant[] = product.variants.map((variant) => {
    const pricing = variantPricing(variant.priceList);
    return {
      sku: variant.sku,
      colorId: variant.colorId,
      tier: variant.storage ?? variant.size ?? null,
      stock: availableStock(variant.sku),
      list: pricing.list,
      transfer: pricing.transfer,
      instalment: pricing.instalment,
      instalmentCount: pricing.instalmentCount,
    };
  });

  const tiers = product.storages.length > 0 ? product.storages : product.sizes;
  const tierLabel =
    product.storages.length > 0 ? 'Capacidad' : product.sizes.length > 0 ? 'Tamaño' : null;

  const related = catalog()
    .listProducts()
    .filter((candidate) => candidate.family === product.family && candidate.slug !== product.slug)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 4);

  const pairs = product.pairsWith
    .map((sku) => catalog().resolveSku(sku)?.product)
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .filter((candidate) => candidate.slug !== product.slug);

  return (
    <div className="relative">
      <Ledger />

      {/* Breadcrumbs: real links, and mirrored in structured data. */}
      <nav
        aria-label="Migas de pan"
        className="u-container relative pt-[calc(var(--header-h)+1.75rem)]"
      >
        <ol className="u-mono flex flex-wrap items-center gap-2 text-[var(--text-step--2)] text-[var(--text-faint)]">
          <li>
            <Link href="/" className="transition-colors hover:text-[var(--text-dim)]">
              Inicio
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/tienda" className="transition-colors hover:text-[var(--text-dim)]">
              Catálogo
            </Link>
          </li>
          {category ? (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <Link
                  href={`/tienda/${category.slug}`}
                  className="transition-colors hover:text-[var(--text-dim)]"
                >
                  {category.name}
                </Link>
              </li>
            </>
          ) : null}
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-[var(--text-dim)]">
            {product.name}
          </li>
        </ol>
      </nav>

      <header className="u-container relative mt-8">
        <p className="u-label">{category?.name ?? product.family}</p>
        <h1 className="u-display mt-3 max-w-[18ch] text-[var(--text-step-5)]">{product.name}</h1>
        <p className="u-editorial mt-3 text-[var(--text-step-2)] text-[var(--accent)]">
          {product.tagline}
        </p>
        <p className="u-prose mt-5 text-[var(--text-step-0)] text-[var(--text-dim)]">
          {product.summary}
        </p>
      </header>

      <div className="mt-12">
        <ProductConfigurator
          name={product.name}
          render={product.render}
          colors={product.colors.map((color) => ({
            id: color.id,
            name: color.name,
            hex: color.hex,
            hexAccent: color.hexAccent,
            light: color.light ?? false,
          }))}
          tiers={tiers}
          tierLabel={tierLabel}
          variants={variants}
          highlights={product.highlights}
        />
      </div>

      {/* --------------------------- SPECIFICATIONS -------------------------- */}
      <section aria-labelledby="specs-heading" className="u-container u-section">
        <Reveal>
          <div className="border-t border-[var(--line)] pt-6">
            <p className="u-label">Ficha técnica</p>
            <h2 id="specs-heading" className="u-display mt-4 text-[var(--text-step-4)]">
              The <span className="u-editorial text-[var(--accent)] normal-case">numbers</span>.
            </h2>
          </div>
        </Reveal>
        <Reveal delay={0.06}>
          <SpecRails specs={product.specs} className="mt-8 max-w-4xl" />
        </Reveal>
      </section>

      {/* ----------------------------- COMPLETE IT --------------------------- */}
      {pairs.length > 0 ? (
        <section aria-labelledby="pairs-heading" className="u-container u-section-tight">
          <Reveal>
            <h2 id="pairs-heading" className="u-display-tight border-t border-[var(--line)] pt-6 text-[var(--text-step-3)]">
              Completá el equipo
            </h2>
          </Reveal>
          <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {pairs.slice(0, 3).map((candidate) => (
              <li key={candidate.slug}>
                <ProductCard product={toCardData(candidate)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ------------------------------- RELATED ----------------------------- */}
      {related.length > 0 ? (
        <section aria-labelledby="related-heading" className="u-container u-section-tight">
          <Reveal>
            <h2 id="related-heading" className="u-display-tight border-t border-[var(--line)] pt-6 text-[var(--text-step-3)]">
              Otros {category?.name ?? 'modelos'}
            </h2>
          </Reveal>
          <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((candidate) => (
              <li key={candidate.slug}>
                <ProductCard product={toCardData(candidate)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {PRICES_ARE_MOCK ? (
        <p className="u-container u-mono pb-10 text-[var(--text-step--2)] text-[var(--text-faint)]">
          Los precios y el stock de esta página son de demostración.
        </p>
      ) : null}

      <JsonLd data={productSchema(product)} />
      <JsonLd
        data={breadcrumbSchema(
          [
            { name: 'Inicio', path: '/' },
            { name: 'Catálogo', path: '/tienda' },
            ...(category ? [{ name: category.name, path: `/tienda/${category.slug}` }] : []),
            { name: product.name, path: `/producto/${product.slug}` },
          ],
        )}
      />
    </div>
  );
}
