import Link from 'next/link';
import { DEFAULT_PAGE_SIZE } from '@/config/constants';
import { catalog } from '@/server/catalog/repository';
import { productPricing } from '@/server/pricing/pricing';
import { toCardDataMany } from '@/features/products/card-data';
import { ProductCard } from '@/features/products/ProductCard';
import { CatalogFilters, type FilterOptionsData, type FilterState } from '@/features/products/CatalogFilters';
import { Ledger } from '@/components/layout/Ledger';
import { ButtonLink } from '@/components/ui/Button';
import type { CatalogQuerySchema } from '@/lib/validation/schemas';
import type { z } from 'zod';
import type { DeviceFamily } from '@/types/catalog';

type Query = z.infer<typeof CatalogQuerySchema>;

/**
 * The catalogue listing, shared by `/tienda` and `/tienda/[category]`.
 *
 * Fully server-rendered: the only JavaScript on this page is the header, the
 * overlays and one `QuickAdd` component. The grid, the filters and the pagination
 * are HTML — which is why a listing of twelve products costs a fraction of what the
 * home page does.
 */
export async function CatalogView({
  query,
  family,
  heading,
  intro,
}: {
  query: Query;
  family?: DeviceFamily | undefined;
  heading: string;
  intro: string;
}) {
  const repo = catalog();

  const { items, total } = repo.filter({
    family,
    colorId: query.color,
    storage: query.storage,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    inStockOnly: query.availability === 'in-stock',
    useCase: query.useCase,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize || DEFAULT_PAGE_SIZE,
  });

  // Every card's availability in one store round trip, not one per variant.
  const cards = await toCardDataMany(items);

  const pageSize = query.pageSize || DEFAULT_PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const basePath = family ? `/tienda/${family}` : '/tienda';

  const state: FilterState = {
    family,
    color: query.color,
    storage: query.storage,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    availability: query.availability,
    sort: query.sort,
  };

  const options = buildFilterOptions(family);

  return (
    <div className="relative">
      <Ledger />

      <header className="u-container relative pt-[calc(var(--header-h)+clamp(2.5rem,7vh,4.5rem))]">
        <p className="u-label">{family ? 'Categoría' : 'Catálogo completo'}</p>
        <h1 className="u-display mt-4 max-w-[16ch] text-h1">{heading}</h1>
        <p className="u-prose mt-5 text-body text-fg-dim">{intro}</p>
      </header>

      <div className="u-container mt-12">
        <CatalogFilters
          state={state}
          options={options}
          resultCount={total}
          basePath={basePath}
        />
      </div>

      <section aria-labelledby="results-heading" className="u-container u-section-tight">
        {/*
          A real heading, visually hidden.

          Product cards use `<h3>`, which is correct when they sit under a section
          heading — but on the listing the only heading above them was the page
          `<h1>`, so the document went h1 → h3 and screen-reader users lost a level
          of structure. The accessibility sweep caught it as a heading jump.
        */}
        <h2 id="results-heading" className="sr-only">
          Productos
        </h2>

        {items.length === 0 ? (
          <div className="border-t border-line py-20 text-center">
            <p className="u-display-tight text-h4">Sin resultados</p>
            <p className="u-prose mx-auto mt-3 text-tiny text-fg-dim">
              Probá ampliando el rango de precio o quitando algún filtro.
            </p>
            <ButtonLink href={basePath} variant="secondary" size="md" className="mt-6">
              Limpiar filtros
            </ButtonLink>
          </div>
        ) : (
          <ul className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cards.map((card, index) => (
              <li key={card.slug}>
                <ProductCard
                  product={card}
                  // The first row is above the fold; the rest lazy-load.
                  priority={index < 4}
                />
              </li>
            ))}
          </ul>
        )}

        {pages > 1 ? (
          <nav aria-label="Paginación" className="mt-16 flex items-center justify-between border-t border-line pt-6">
            <PageLink
              basePath={basePath}
              query={query}
              page={query.page - 1}
              disabled={query.page <= 1}
            >
              ← Anterior
            </PageLink>

            <p className="u-mono text-micro text-fg-dim">
              Página {query.page} de {pages}
            </p>

            <PageLink
              basePath={basePath}
              query={query}
              page={query.page + 1}
              disabled={query.page >= pages}
            >
              Siguiente →
            </PageLink>
          </nav>
        ) : null}
      </section>
    </div>
  );
}

/** Build the filter option lists from whatever is actually in scope. */
function buildFilterOptions(family?: DeviceFamily | undefined): FilterOptionsData {
  const repo = catalog();
  const all = repo.listProducts();
  const scoped = family ? all.filter((product) => product.family === family) : all;

  const colors = new Map<string, string>();
  const storages = new Set<string>();
  let min = Number.POSITIVE_INFINITY;
  let max = 0;

  for (const product of scoped) {
    for (const color of product.colors) colors.set(color.id, color.name);
    for (const storage of product.storages) storages.add(storage);
    const { from } = productPricing(product);
    if (from < min) min = from;
    for (const variant of product.variants) {
      if (variant.priceList > max) max = variant.priceList;
    }
  }

  return {
    categories: repo.listCategories().map((category) => ({
      slug: category.slug,
      name: category.name,
      count: all.filter((product) => product.family === category.slug).length,
    })),
    colors: [...colors.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es-AR')),
    storages: [...storages].sort(
      (a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10) || a.localeCompare(b),
    ),
    priceBounds: { min: Number.isFinite(min) ? min : 0, max },
  };
}

function PageLink({
  basePath,
  query,
  page,
  disabled,
  children,
}: {
  basePath: string;
  query: Query;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="u-mono grid min-h-11 place-items-center px-4 text-micro uppercase tracking-[0.12em] text-fg-faint"
      >
        {children}
      </span>
    );
  }

  const params = new URLSearchParams();
  // Only non-default values go into the URL, so links stay readable and the
  // canonical form of a page is stable.
  if (query.sort !== 'recommended') params.set('sort', query.sort);
  if (query.color) params.set('color', query.color);
  if (query.storage) params.set('storage', query.storage);
  if (query.minPrice !== undefined) params.set('minPrice', String(query.minPrice));
  if (query.maxPrice !== undefined) params.set('maxPrice', String(query.maxPrice));
  if (query.availability !== 'any') params.set('availability', query.availability);
  if (page > 1) params.set('page', String(page));

  const search = params.toString();

  return (
    <Link
      href={search ? `${basePath}?${search}` : basePath}
      className="u-mono grid min-h-11 place-items-center rounded-[var(--radius-sm)] border border-line px-4 text-micro uppercase tracking-[0.12em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
    >
      {children}
    </Link>
  );
}
