import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd } from '@/lib/seo/json-ld';
import { breadcrumbSchema, productSchema } from '@/lib/seo/schema';
import { catalog } from '@/server/catalog/repository';
import { availableStockMany } from '@/server/orders/inventory';
import { photoFor } from '@/lib/photos';
import { variantPricing } from '@/server/pricing/pricing';
import { toCardDataMany } from '@/features/products/card-data';
import {
  ProductConfigurator,
  type ConfiguratorVariant,
} from '@/features/products/ProductConfigurator';
import { ProductCard } from '@/features/products/ProductCard';
import { SpecRails } from '@/components/ui/SpecRail';
import { Reveal } from '@/components/motion/Reveal';
import { Ledger } from '@/components/layout/Ledger';
import { PRICES_ARE_MOCK } from '@/data/catalog';

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

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = catalog().getProductBySlug(slug);
  if (!product) notFound();

  const category = catalog().getCategory(product.family);

  /**
   * Prices are computed **here, on the server**, for every variant, and passed to
   * the configurator as data. The client displays them; it never derives them.
   */
  const availability = await availableStockMany(product.variants.map((variant) => variant.sku));

  const variants: ConfiguratorVariant[] = product.variants.map((variant) => {
    const pricing = variantPricing(variant.priceList);
    return {
      sku: variant.sku,
      colorId: variant.colorId,
      tier: variant.storage ?? variant.size ?? null,
      stock: availability.get(variant.sku) ?? 0,
      ...(photoFor(product, variant) ? { photography: photoFor(product, variant) } : {}),
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

  // The two card grids below this page's fold, priced and stocked in one pass
  // each rather than one lookup per variant.
  const [pairCards, relatedCards] = await Promise.all([
    toCardDataMany(pairs.slice(0, 3)),
    toCardDataMany(related),
  ]);

  return (
    <div className="relative">
      <Ledger />

      {/* Breadcrumbs: real links, and mirrored in structured data. */}
      <nav
        aria-label="Migas de pan"
        className="u-container relative pt-[calc(var(--header-h)+1.75rem)]"
      >
        <ol className="u-mono flex flex-wrap items-center gap-2 text-micro text-fg-faint">
          <li>
            <Link href="/" className="inline-block py-1.5 transition-colors hover:text-fg-dim">
              Inicio
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/tienda" className="inline-block py-1.5 transition-colors hover:text-fg-dim">
              Catálogo
            </Link>
          </li>
          {category ? (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <Link
                  href={`/tienda/${category.slug}`}
                  className="inline-block py-1.5 transition-colors hover:text-fg-dim"
                >
                  {category.name}
                </Link>
              </li>
            </>
          ) : null}
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-fg-dim">
            {product.name}
          </li>
        </ol>
      </nav>

      {/*
        Order differs by viewport, via `order` rather than duplicated markup.

        On a phone the price, the variants and the CTA come before the prose: the
        visitor arrived from an Instagram story to find out what it costs, and
        two paragraphs of narrative above the fold is a paragraph of narrative
        between them and the sale. On desktop the summary reads as editorial
        under the title, where there is room for both.
      */}
      <div className="flex flex-col">
        <header className="u-container relative order-1 mt-8">
          <p className="u-label">{category?.name ?? product.family}</p>
          <h1 className="u-display mt-3 max-w-[18ch] text-h1">{product.name}</h1>
          <p className="u-editorial mt-3 text-h4 text-accent">{product.tagline}</p>
        </header>

        <p className="u-container u-prose order-3 mt-10 text-body text-fg-dim lg:order-2 lg:mt-5">
          {product.summary}
        </p>

        <div className="order-2 mt-10 lg:order-3 lg:mt-12">
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
      </div>

      {/* --------------------------- SPECIFICATIONS -------------------------- */}
      <section aria-labelledby="specs-heading" className="u-container u-section">
        <Reveal>
          <div className="border-t border-line pt-6">
            <p className="u-label">Ficha técnica</p>
            <h2 id="specs-heading" className="u-display mt-4 text-h2">
              The <span className="u-editorial text-accent normal-case">numbers</span>.
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
            <h2 id="pairs-heading" className="u-display-tight border-t border-line pt-6 text-h3">
              Completá el equipo
            </h2>
          </Reveal>
          <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {pairCards.map((card) => (
              <li key={card.slug}>
                <ProductCard product={card} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ------------------------------- RELATED ----------------------------- */}
      {related.length > 0 ? (
        <section aria-labelledby="related-heading" className="u-container u-section-tight">
          <Reveal>
            <h2 id="related-heading" className="u-display-tight border-t border-line pt-6 text-h3">
              Otros {category?.name ?? 'modelos'}
            </h2>
          </Reveal>
          <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {relatedCards.map((card) => (
              <li key={card.slug}>
                <ProductCard product={card} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {PRICES_ARE_MOCK ? (
        <p className="u-container u-mono pb-10 text-micro text-fg-faint">
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
