import Link from 'next/link';
import { formatARS } from '@/lib/money';
import { ButtonLink } from '@/components/ui/Button';
import { StockBadge } from '@/components/ui/Badge';
import { ProductRender } from '@/components/product/ProductRender';
import { Reveal } from '@/components/motion/Reveal';
import { cn } from '@/lib/utils/cn';
import type { ProductCardData } from '@/features/products/card-data';

/**
 * Featured products, as an editorial spread rather than a grid.
 *
 * The brief's anti-pattern is "too many cards", and a 4-up equal grid on the home
 * page is exactly that. Here one product is the lead at a scale nothing else gets,
 * with two supporting entries beside it at a different rhythm — so hierarchy is
 * doing the work, not quantity.
 */
export function FeaturedEditorial({ products }: { products: ProductCardData[] }) {
  const [lead, ...rest] = products;
  if (!lead) return null;

  return (
    <section aria-labelledby="featured-heading" className="u-container u-section">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-6 border-t border-line pt-6">
          <div>
            <p className="u-label">Lo más buscado</p>
            <h2 id="featured-heading" className="u-display mt-4 text-h1">
              The short
              <span className="u-editorial ml-3 text-accent normal-case">list</span>
            </h2>
          </div>
          <ButtonLink href="/tienda" variant="ghost" size="sm" className="border border-line">
            Ver los {products.length > 3 ? 'demás' : 'otros'} modelos
          </ButtonLink>
        </div>
      </Reveal>

      {/*
        `min-w-0` on both grid children is load-bearing, not decoration.

        A grid item defaults to `min-width: auto`, so its min-content width can
        force the track wider than the container — silently, and only at narrow
        viewports. Here the support list's min-content pushed the home page into a
        6px horizontal scroll at 375px, which the visual-QA sweep caught and which
        no amount of reading the markup would have revealed.
      */}
      <div className="mt-10 grid gap-x-8 gap-y-12 lg:grid-cols-[1.35fr_1fr]">
        {/* ------------------------------ THE LEAD ---------------------------- */}
        <Reveal className="min-w-0">
          <Link
            href={`/producto/${lead.slug}`}
            className="group/product flex h-full flex-col rounded-[var(--radius-lg)] focus-visible:outline-offset-4"
          >
            <div className="relative grid flex-1 place-items-center overflow-hidden rounded-[var(--radius-lg)] bg-surface-raised py-10">
              <span
                aria-hidden="true"
                className="absolute aspect-square w-[46%] rounded-full border border-[color-mix(in_oklab,var(--accent)_34%,transparent)] transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out-owner)] group-hover/product:scale-105"
              />
              <ProductRender
                kind={lead.render}
                color={lead.colors[0] ?? { hex: '#888', hexAccent: '#999', name: '' }}
                photography={lead.photography}
                sizes="(max-width: 64rem) 90vw, 40rem"
                productName={lead.name}
                className="h-[min(52vh,26rem)] w-auto transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out-owner)] group-hover/product:-translate-y-2"
                specular
              />
            </div>

            <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="u-display-tight text-h3">{lead.name}</h3>
                  <StockBadge stock={lead.stock} />
                </div>
                <p className="u-editorial mt-1 text-lead text-fg-dim">
                  {lead.tagline}
                </p>
              </div>
              <div className="text-right">
                <p className="u-mono text-h4 font-semibold">
                  {formatARS(lead.fromTransfer)}
                </p>
                <p className="u-mono text-micro text-accent">
                  {lead.instalmentCount} × {formatARS(lead.instalment)}
                </p>
              </div>
            </div>
          </Link>
        </Reveal>

        {/* ---------------------------- THE SUPPORT --------------------------- */}
        <ul className="flex min-w-0 flex-col">
          {rest.slice(0, 3).map((product, index) => (
            <li key={product.slug}>
              <Reveal delay={0.06 * (index + 1)}>
                <Link
                  href={`/producto/${product.slug}`}
                  className={cn(
                    'group/product flex items-center gap-5 border-t border-line py-6',
                    'rounded-[var(--radius-sm)] focus-visible:outline-offset-4',
                  )}
                >
                  <div className="relative grid size-24 flex-none place-items-center sm:size-28">
                    <span
                      aria-hidden="true"
                      className="absolute aspect-square w-full rounded-full border border-[color-mix(in_oklab,var(--accent)_22%,transparent)] transition-transform duration-[var(--dur-slow)] group-hover/product:scale-108"
                    />
                    <ProductRender
                      kind={product.render}
                      color={product.colors[0] ?? { hex: '#888', hexAccent: '#999', name: '' }}
                      photography={product.photography}
                      sizes="(max-width: 40rem) 45vw, 18rem"
                      productName={product.name}
                      className="h-[86%] w-auto"
                      specular
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="u-display-tight text-lead">{product.name}</h3>
                    <p className="u-editorial text-tiny text-fg-dim">
                      {product.tagline}
                    </p>
                    <p className="u-mono mt-2 text-tiny">
                      {formatARS(product.fromTransfer)}
                      <span className="ml-2 text-micro text-fg-faint">
                        transferencia
                      </span>
                    </p>
                  </div>

                  <span
                    aria-hidden="true"
                    className="u-mono flex-none text-accent opacity-0 transition-opacity group-hover/product:opacity-100 motion-reduce:opacity-100"
                  >
                    →
                  </span>
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
