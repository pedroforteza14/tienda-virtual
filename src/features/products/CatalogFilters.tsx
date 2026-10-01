import Link from 'next/link';
import { formatARS } from '@/lib/money';
import { SORT_OPTIONS, type SortOption } from '@/lib/validation/schemas';
import { cn } from '@/lib/utils/cn';
import type { DeviceFamily } from '@/types/catalog';

/**
 * Catalogue filters.
 *
 * A plain `<form method="get">` with native controls, and the categories as real
 * links. Three things fall out of that choice:
 *
 *  - **it works with no JavaScript**, which also means it works while the bundle is
 *    still loading on a slow connection — the moment someone from Instagram lands;
 *  - every filter state has a **URL**, so it is bookmarkable, shareable and
 *    crawlable, and the back button behaves;
 *  - native `<select>` gets the platform picker on mobile, which is faster and more
 *    accessible than anything custom.
 *
 * On mobile it collapses into a `<details>` disclosure — again, no JavaScript, and
 * a disclosure is announced correctly by every screen reader.
 */

const SORT_LABELS: Record<SortOption, string> = {
  recommended: 'Recomendados',
  'price-asc': 'Precio: menor a mayor',
  'price-desc': 'Precio: mayor a menor',
  newest: 'Novedades',
};

export interface FilterState {
  family?: DeviceFamily | undefined;
  color?: string | undefined;
  storage?: string | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  availability: 'any' | 'in-stock';
  sort: SortOption;
}

export interface FilterOptionsData {
  categories: { slug: DeviceFamily; name: string; count: number }[];
  colors: { id: string; name: string }[];
  storages: string[];
  priceBounds: { min: number; max: number };
}

export function CatalogFilters({
  state,
  options,
  resultCount,
  basePath,
}: {
  state: FilterState;
  options: FilterOptionsData;
  resultCount: number;
  /** `/tienda` or `/tienda/<category>`; the form posts back to here. */
  basePath: string;
}) {
  const activeCount = [
    state.color,
    state.storage,
    state.minPrice,
    state.maxPrice,
    state.availability === 'in-stock' ? 'x' : undefined,
  ].filter(Boolean).length;

  return (
    <div>
      {/* Categories are links, not form fields: they are navigation. */}
      <nav aria-label="Categorías" className="mb-8">
        <ul className="flex flex-wrap gap-2">
          <li>
            <CategoryChip href="/tienda" active={!state.family}>
              Todo
            </CategoryChip>
          </li>
          {options.categories.map((category) => (
            <li key={category.slug}>
              <CategoryChip
                href={`/tienda/${category.slug}`}
                active={state.family === category.slug}
              >
                {category.name}
                <span className="ml-1.5 text-fg-faint">{category.count}</span>
              </CategoryChip>
            </li>
          ))}
        </ul>
      </nav>

      <details
        // Open by default from `lg` via the `[&]` selector below; a disclosure is
        // the right semantics on mobile and harmless on desktop.
        className="group border-y border-line lg:border-0 lg:[&]:open"
        open
      >
        <summary className="u-label flex cursor-pointer list-none items-center justify-between py-4 lg:hidden">
          <span>
            Filtros{activeCount > 0 ? ` · ${activeCount}` : ''}
          </span>
          <span aria-hidden="true" className="transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>

        <form method="get" action={basePath} className="pb-6 lg:pb-0">
          {/* Keep the sort when a filter is submitted, and vice versa. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            <Select
              id="sort"
              name="sort"
              label="Ordenar por"
              defaultValue={state.sort}
              options={SORT_OPTIONS.map((value) => ({ value, label: SORT_LABELS[value] }))}
            />

            {options.colors.length > 1 ? (
              <Select
                id="color"
                name="color"
                label="Color"
                defaultValue={state.color ?? ''}
                options={[
                  { value: '', label: 'Todos' },
                  ...options.colors.map((color) => ({ value: color.id, label: color.name })),
                ]}
              />
            ) : null}

            {options.storages.length > 0 ? (
              <Select
                id="storage"
                name="storage"
                label="Capacidad"
                defaultValue={state.storage ?? ''}
                options={[
                  { value: '', label: 'Todas' },
                  ...options.storages.map((storage) => ({
                    value: storage.toLowerCase().replace(/\s+/g, ''),
                    label: storage,
                  })),
                ]}
              />
            ) : null}

            <fieldset className="flex flex-col gap-1.5">
              <legend className="u-label mb-1.5">
                Precio (desde {formatARS(options.priceBounds.min)})
              </legend>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  name="minPrice"
                  inputMode="numeric"
                  min={0}
                  max={options.priceBounds.max}
                  step={10000}
                  defaultValue={state.minPrice ?? ''}
                  aria-label="Precio mínimo en centavos"
                  placeholder="Mín"
                  className="u-mono min-h-11 w-full min-w-0 rounded-[var(--radius-sm)] border border-line-strong bg-transparent px-2.5 text-micro focus:border-accent"
                />
                <span aria-hidden="true" className="text-fg-faint">
                  —
                </span>
                <input
                  type="number"
                  name="maxPrice"
                  inputMode="numeric"
                  min={0}
                  max={options.priceBounds.max}
                  step={10000}
                  defaultValue={state.maxPrice ?? ''}
                  aria-label="Precio máximo en centavos"
                  placeholder="Máx"
                  className="u-mono min-h-11 w-full min-w-0 rounded-[var(--radius-sm)] border border-line-strong bg-transparent px-2.5 text-micro focus:border-accent"
                />
              </div>
            </fieldset>

            <div className="flex flex-col gap-3">
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="availability"
                  value="in-stock"
                  defaultChecked={state.availability === 'in-stock'}
                  className="size-4 accent-[var(--accent)]"
                />
                <span className="u-label normal-case tracking-[0.1em]">Sólo con stock</span>
              </label>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="u-mono min-h-11 flex-1 rounded-[var(--radius-sm)] bg-accent px-4 text-micro uppercase tracking-[0.12em] text-on-accent transition-colors hover:bg-accent-hover"
                >
                  Aplicar
                </button>
                {activeCount > 0 ? (
                  <Link
                    href={basePath}
                    className="u-mono grid min-h-11 place-items-center rounded-[var(--radius-sm)] border border-line-strong px-4 text-micro uppercase tracking-[0.12em] text-fg-dim transition-colors hover:text-fg"
                  >
                    Limpiar
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </form>
      </details>

      {/* Announced so a screen-reader user learns the result count changed. */}
      <p aria-live="polite" className="u-mono mt-6 text-micro text-fg-dim">
        {resultCount} {resultCount === 1 ? 'producto' : 'productos'}
      </p>
    </div>
  );
}

function CategoryChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'u-mono inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border px-4 text-micro uppercase tracking-[0.12em] transition-colors',
        active
          ? 'border-accent bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-accent'
          : 'border-line text-fg-dim hover:border-line-strong hover:text-fg',
      )}
    >
      {children}
    </Link>
  );
}

function Select({
  id,
  name,
  label,
  defaultValue,
  options,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="u-label">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        className="min-h-11 w-full rounded-[var(--radius-sm)] border border-line-strong bg-surface-raised px-3 text-tiny focus:border-accent"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
