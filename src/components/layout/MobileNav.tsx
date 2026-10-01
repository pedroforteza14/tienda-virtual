'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DEVICE_FAMILIES } from '@/types/catalog';
import { cn } from '@/lib/utils/cn';
import { Overlay } from '@/components/ui/Overlay';
import { useCommerce } from '@/features/cart/CommerceProvider';

/**
 * Mobile navigation — a separate design, not a compressed desktop one.
 *
 * The brief's highest-value visitor arrives from an Instagram story on a phone,
 * ready to buy. So the primary actions live in a thumb-reachable bottom bar
 * (Inicio / Tienda / Buscar / Carrito) rather than behind a hamburger, and the
 * hamburger holds only the things you browse rather than the things you do.
 *
 * `env(safe-area-inset-bottom)` keeps the bar clear of the iOS home indicator —
 * without it, the last 20 px of every tap target is unreachable on a modern iPhone.
 */

const CATEGORY_LABELS: Record<string, string> = {
  iphone: 'iPhone',
  mac: 'Mac',
  ipad: 'iPad',
  watch: 'Watch',
  airpods: 'AirPods',
  accessories: 'Accesorios',
};

export function MobileNav() {
  const pathname = usePathname();
  const { itemCount, loaded, setCartOpen, setSearchOpen, menuOpen, setMenuOpen } = useCommerce();

  return (
    <>
      <nav
        aria-label="Navegación principal móvil"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] backdrop-blur-xl md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <ul className="grid grid-cols-4">
          <li>
            <Link href="/" className={tabClass(pathname === '/')}>
              <Glyph name="home" />
              <span>Inicio</span>
            </Link>
          </li>
          <li>
            <Link href="/tienda" className={tabClass(pathname.startsWith('/tienda'))}>
              <Glyph name="grid" />
              <span>Tienda</span>
            </Link>
          </li>
          <li>
            <button type="button" onClick={() => setSearchOpen(true)} className={tabClass(false)}>
              <Glyph name="search" />
              <span>Buscar</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className={tabClass(false)}
              aria-label={
                loaded
                  ? `Carrito, ${itemCount} ${itemCount === 1 ? 'producto' : 'productos'}`
                  : 'Carrito'
              }
            >
              <span className="relative">
                <Glyph name="bag" />
                {loaded && itemCount > 0 ? (
                  <span
                    aria-hidden="true"
                    className="u-mono absolute -right-2 -top-1 grid min-w-3.5 place-items-center rounded-full bg-[var(--accent)] px-1 text-[0.5rem] font-semibold text-[var(--on-accent)]"
                  >
                    {itemCount}
                  </span>
                ) : null}
              </span>
              <span>Carrito</span>
            </button>
          </li>
        </ul>
      </nav>

      <Overlay
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Menú"
        side="full"
        className="md:hidden"
      >
        <div className="u-container py-6">
          <p className="u-label">Categorías</p>
          <ul className="mt-4">
            {DEVICE_FAMILIES.map((family) => (
              <li key={family}>
                <Link
                  href={`/tienda/${family}`}
                  onClick={() => setMenuOpen(false)}
                  className="u-display-tight flex items-baseline justify-between border-b border-[var(--line)] py-4 text-[var(--text-step-3)]"
                >
                  {CATEGORY_LABELS[family] ?? family}
                  <span aria-hidden="true" className="text-[var(--accent)] text-[var(--text-step-0)]">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <ul className="mt-8 flex flex-col gap-1">
            {[
              { href: '/descubri', label: 'Encontrá tu equipo' },
              { href: '/cuenta', label: 'Mi cuenta' },
              { href: '/legal/garantia', label: 'Garantía y envíos' },
            ].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="u-label block py-3 text-[var(--text-dim)]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Overlay>
    </>
  );
}

function tabClass(active: boolean): string {
  return cn(
    // 56px tall: comfortably over the 44px minimum, with the label included.
    'u-mono flex h-14 w-full flex-col items-center justify-center gap-1 text-[0.5625rem] uppercase tracking-[0.1em] transition-colors',
    active ? 'text-[var(--accent)]' : 'text-[var(--text-faint)]',
  );
}

function Glyph({ name }: { name: 'home' | 'grid' | 'search' | 'bag' }) {
  const paths: Record<typeof name, React.ReactNode> = {
    home: <path d="M3 9l7-6 7 6v7.5a1 1 0 01-1 1h-3.5V12h-5v5.5H4a1 1 0 01-1-1V9z" />,
    grid: (
      <>
        <rect x="3" y="3" width="6" height="6" rx="1" />
        <rect x="11" y="3" width="6" height="6" rx="1" />
        <rect x="3" y="11" width="6" height="6" rx="1" />
        <rect x="11" y="11" width="6" height="6" rx="1" />
      </>
    ),
    search: (
      <>
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="M12.8 12.8L17 17" />
      </>
    ),
    bag: (
      <>
        <path d="M4 6h12l-1.1 9.2a1.6 1.6 0 01-1.6 1.4H6.7a1.6 1.6 0 01-1.6-1.4L4 6z" />
        <path d="M7.4 6V4.9a2.6 2.6 0 015.2 0V6" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 20 20"
      className="size-[18px]"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      {paths[name]}
    </svg>
  );
}
