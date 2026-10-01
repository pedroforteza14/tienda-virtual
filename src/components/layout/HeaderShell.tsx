'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { formatARS } from '@/lib/money';
import { cn } from '@/lib/utils/cn';
import { useCommerce } from '@/features/cart/CommerceProvider';
import { ProductRender } from '@/components/product/ProductRender';
import { Wordmark } from '@/components/layout/Wordmark';
import type { NavData } from '@/components/layout/nav-data';

/**
 * The header, and the mega-menu.
 *
 * Mega-menu accessibility, which is where most of them fail:
 *  - the trigger is a real `<button>` with `aria-expanded` and `aria-controls`;
 *  - **hover opens it, but hover is not the only way in.** Click and keyboard both
 *    work, and on a keyboard the panel is reachable by Tab without any pointer
 *    event ever firing;
 *  - `Escape` closes and returns focus to the trigger;
 *  - focus leaving the whole header closes it, so Tab cannot strand a visitor in an
 *    open panel;
 *  - there is a short close delay on pointer-leave, because a 1 px gap between
 *    trigger and panel should not slam it shut mid-reach.
 */

const CLOSE_DELAY = 140;

export function HeaderShell({ nav }: { nav: NavData }) {
  const pathname = usePathname();
  const { itemCount, loaded, setCartOpen, setSearchOpen, setMenuOpen } = useCommerce();

  const [megaOpen, setMegaOpen] = useState(false);
  const [condensed, setCondensed] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  /** The header gains a hairline and a backdrop once the page has moved. */
  useEffect(() => {
    function onScroll() {
      setCondensed(window.scrollY > 12);
    }
    onScroll();
    // Passive: this listener must never be able to block scrolling.
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /** Any navigation closes the menu. */
  useEffect(() => {
    setMegaOpen(false);
  }, [pathname]);

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  function openMega() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setMegaOpen(true);
  }

  function scheduleClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setMegaOpen(false), CLOSE_DELAY);
  }

  return (
    <header
      ref={headerRef}
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-[var(--dur-base)]',
        condensed || megaOpen
          ? 'border-b border-line bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent',
      )}
      onBlur={(event) => {
        // Focus left the header entirely — close rather than leave a panel open
        // behind the visitor.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setMegaOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && megaOpen) {
          setMegaOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <div className="u-container flex h-[var(--header-h)] items-center justify-between gap-4">
        <Link
          href="/"
          // 44px tall: this is the primary "go home" target, not an inline link.
          className="flex min-h-11 items-center rounded-[var(--radius-xs)] pr-2"
          aria-label="OWNER STORE, inicio"
        >
          <Wordmark />
        </Link>

        {/* Desktop navigation */}
        <nav aria-label="Principal" className="hidden md:block">
          <ul className="flex items-center gap-1">
            <li onPointerEnter={openMega} onPointerLeave={scheduleClose}>
              <button
                ref={triggerRef}
                type="button"
                aria-expanded={megaOpen}
                aria-controls="mega-menu"
                onClick={() => (megaOpen ? setMegaOpen(false) : openMega())}
                className={cn(
                  'u-label group relative px-3 py-3 text-fg transition-colors',
                  'hover:text-accent-hover',
                )}
              >
                Tienda
                <Underline active={megaOpen || pathname.startsWith('/tienda')} />
              </button>
            </li>

            {nav.categories.slice(0, 5).map((category) => (
              <li key={category.slug} className="hidden lg:block">
                <Link
                  href={`/tienda/${category.slug}`}
                  className="u-label group relative px-3 py-3 transition-colors hover:text-accent-hover"
                >
                  {category.name}
                  <Underline active={pathname === `/tienda/${category.slug}`} />
                </Link>
              </li>
            ))}

            <li>
              <Link
                href="/descubri"
                className="u-label group relative px-3 py-3 transition-colors hover:text-accent-hover"
              >
                Descubrí
                <Underline active={pathname.startsWith('/descubri')} />
              </Link>
            </li>
          </ul>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-0.5">
          <IconButton label="Buscar productos" onClick={() => setSearchOpen(true)}>
            <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden="true">
              <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
              <path d="M12.8 12.8L17 17" stroke="currentColor" strokeWidth="1.3" fill="none" />
            </svg>
          </IconButton>

          <Link
            href="/cuenta"
            className="hidden size-11 place-items-center rounded-[var(--radius-sm)] text-fg-dim transition-colors hover:text-fg md:grid"
            aria-label="Mi cuenta"
          >
            <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden="true">
              <circle cx="10" cy="7" r="3.4" stroke="currentColor" strokeWidth="1.3" fill="none" />
              <path d="M3.6 17c0-3.2 2.9-5.2 6.4-5.2s6.4 2 6.4 5.2" stroke="currentColor" strokeWidth="1.3" fill="none" />
            </svg>
          </Link>

          <IconButton
            label={
              loaded
                ? `Carrito, ${itemCount} ${itemCount === 1 ? 'producto' : 'productos'}`
                : 'Carrito'
            }
            onClick={() => setCartOpen(true)}
          >
            <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden="true">
              <path
                d="M4 6h12l-1.1 9.2a1.6 1.6 0 01-1.6 1.4H6.7a1.6 1.6 0 01-1.6-1.4L4 6z"
                stroke="currentColor"
                strokeWidth="1.3"
                fill="none"
              />
              <path d="M7.4 6V4.9a2.6 2.6 0 015.2 0V6" stroke="currentColor" strokeWidth="1.3" fill="none" />
            </svg>
            {loaded && itemCount > 0 ? (
              <span
                aria-hidden="true"
                className="u-mono absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[0.5625rem] font-semibold text-on-accent"
              >
                {itemCount}
              </span>
            ) : null}
          </IconButton>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="grid size-11 place-items-center rounded-[var(--radius-sm)] text-fg-dim transition-colors hover:text-fg md:hidden"
          >
            <span className="sr-only">Abrir menú</span>
            <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden="true">
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
        </div>
      </div>

      {/* ------------------------------ MEGA MENU ----------------------------- */}
      <div
        id="mega-menu"
        hidden={!megaOpen}
        onPointerEnter={openMega}
        onPointerLeave={scheduleClose}
        className="hidden border-t border-line bg-surface md:block"
      >
        <div className="u-container grid gap-8 py-8 lg:grid-cols-[1.4fr_1fr] lg:gap-14">
          <div>
            <p className="u-label mb-4">Categorías</p>
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {nav.categories.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/tienda/${category.slug}`}
                    className="group/product flex items-center gap-3 rounded-[var(--radius-sm)] py-2.5 pr-2 transition-colors hover:bg-surface-raised"
                  >
                    <span className="relative grid size-12 flex-none place-items-center">
                      <ProductRender
                        kind={category.render}
                        color={category.color}
                        productName={category.name}
                        className="h-11 w-11"
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-tiny font-medium text-fg">
                        {category.name}
                      </span>
                      <span className="u-mono block text-micro text-fg-faint">
                        Desde {formatARS(category.fromTransfer)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <Link
              href="/tienda"
              className="u-label mt-4 inline-flex min-h-11 items-center gap-2 text-accent transition-colors hover:text-accent-hover"
            >
              Ver todo el catálogo
              <span aria-hidden="true">→</span>
            </Link>
          </div>

          <div>
            <p className="u-label mb-4">Destacados</p>
            <ul className="flex flex-col gap-1">
              {nav.featured.map((product) => (
                <li key={product.slug}>
                  <Link
                    href={`/producto/${product.slug}`}
                    className="group/product flex items-center gap-4 rounded-[var(--radius-sm)] p-2.5 transition-colors hover:bg-surface-raised"
                  >
                    <span className="relative grid size-14 flex-none place-items-center">
                      <ProductRender
                        kind={product.render}
                        color={product.color}
                        productName={product.name}
                        className="h-13 w-13"
                        specular
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-tiny font-medium">
                        {product.name}
                      </span>
                      <span className="u-editorial block text-micro text-fg-dim">
                        {product.tagline}
                      </span>
                    </span>
                    <span className="u-mono flex-none text-micro text-fg-dim">
                      {formatARS(product.fromTransfer)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </header>
  );
}

/** The animated navigation underline: brass, scaling from the centre. */
function Underline({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute inset-x-3 bottom-1.5 h-px origin-center bg-accent',
        'transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-owner)]',
        active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100',
      )}
    />
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative grid size-11 place-items-center rounded-[var(--radius-sm)] text-fg-dim transition-colors hover:text-fg"
    >
      <span className="sr-only">{label}</span>
      {children}
    </button>
  );
}
