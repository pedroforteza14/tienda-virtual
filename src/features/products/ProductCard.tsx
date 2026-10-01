import Link from 'next/link';
import { StockBadge } from '@/components/ui/Badge';
import { FromPrice } from '@/components/ui/PriceBlock';
import { ProductRender } from '@/components/product/ProductRender';
import { QuickAdd } from '@/features/products/QuickAdd';
import { cn } from '@/lib/utils/cn';
import type { ProductCardData } from '@/features/products/card-data';

/**
 * Product card.
 *
 * Not a generic ecommerce card: the device sits inside an aperture that dilates on
 * hover, the price is mono, and the variant count is stated rather than implied.
 *
 * Deliberately a **server** component. The only interactive part is `QuickAdd`,
 * which is its own small client island — so a 12-card listing ships one component's
 * worth of JavaScript rather than twelve.
 *
 * One link wraps the whole card (so the hit area is the card), the aperture and
 * the specular sweep are decorative, and the hover reveal is opacity-only so
 * nothing reflows.
 */
export function ProductCard({
  product,
  priority = false,
  className,
}: {
  product: ProductCardData;
  priority?: boolean;
  className?: string;
}) {
  const color = product.colors[0] ?? {
    hex: '#8a8a8a',
    hexAccent: '#9a9a9a',
    name: '',
    light: true,
  };

  return (
    <article
      className={cn(
        'group/product relative flex flex-col border-t border-line pt-5',
        className,
      )}
    >
      <Link
        href={`/producto/${product.slug}`}
        className="flex flex-1 flex-col rounded-[var(--radius-sm)] focus-visible:outline-offset-4"
      >
        {/* Stage: aperture behind, device in front. */}
        <div className="relative mb-5 grid aspect-4/5 place-items-center overflow-hidden">
          <span
            aria-hidden="true"
            className={cn(
              'absolute aspect-square w-[62%] rounded-full border border-[color-mix(in_oklab,var(--accent)_38%,transparent)]',
              'transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out-owner)]',
              'group-hover/product:scale-108',
            )}
          />
          <div
            className={cn(
              'relative h-[82%] w-[82%] transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out-owner)]',
              'group-hover/product:-translate-y-1.5 group-hover/product:rotate-y-[1.5deg]',
            )}
          >
            <ProductRender
              kind={product.render}
              color={color}
              productName={product.name}
              className="h-full w-full"
              specular
              priority={priority}
            />
          </div>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="u-display-tight text-lead text-fg">
              {product.name}
            </h3>
            <p className="u-editorial mt-0.5 text-tiny text-fg-dim">
              {product.tagline}
            </p>
          </div>
          <StockBadge stock={product.stock} />
        </div>

        <FromPrice from={product.from} fromTransfer={product.fromTransfer} className="mt-4" />

        <p className="u-mono mt-1.5 text-micro text-accent">
          {product.instalmentCount} cuotas sin interés
        </p>

        {/* Revealed on hover by opacity only — changing layout here would make the
            whole grid jump as the pointer crosses it. */}
        <p className="u-label mt-3 opacity-0 transition-opacity duration-[var(--dur-base)] group-hover/product:opacity-100 motion-reduce:opacity-100">
          {product.colors.length} {product.colors.length === 1 ? 'color' : 'colores'}
          {product.storageOptions > 0 ? ` · ${product.storageOptions} capacidades` : ''}
        </p>
      </Link>

      {product.quickAddSku ? (
        <QuickAdd sku={product.quickAddSku} productName={product.name} className="mt-4" />
      ) : (
        <p className="u-label mt-4 text-fg-faint">Avisanos y te escribimos</p>
      )}
    </article>
  );
}
