'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatARS } from '@/lib/money';
import { MAX_SEARCH_QUERY_LENGTH } from '@/config/constants';
import { apiFetch } from '@/lib/http/client';
import { cn } from '@/lib/utils/cn';
import { Overlay } from '@/components/ui/Overlay';
import { ProductRender } from '@/components/product/ProductRender';
import { useCommerce } from '@/features/cart/CommerceProvider';
import type { RenderKind } from '@/types/catalog';

/**
 * Full-screen search.
 *
 * Security: the query goes to the server, which matches it against a pre-built
 * index with `includes()`. **No RegExp is ever built from input** — not here and
 * not on the server. The input is also length-capped at the schema's limit before
 * it is ever sent, so the client cannot be used to probe the cap.
 *
 * Interaction, per docs/design-system.md:
 *  - 180 ms debounce, and every in-flight request is aborted when a newer keystroke
 *    arrives — so results cannot land out of order and show the wrong thing;
 *  - `↑`/`↓` move through results, `Enter` opens the active one, `Escape` closes;
 *  - the listbox pattern: `role="listbox"`, `aria-activedescendant`, and the result
 *    count announced in a live region, so a screen-reader user knows what happened;
 *  - the input keeps focus throughout, which is what makes type-and-arrow work.
 */
export function SearchOverlay() {
  const { searchOpen, setSearchOpen } = useCommerce();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');

  const run = useCallback(async (value: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (value.trim().length < 2) {
      setResults([]);
      setStatus('idle');
      return;
    }

    setStatus('loading');
    const result = await apiFetch<{ results: SearchResult[] }>(
      `/api/search?q=${encodeURIComponent(value.trim())}`,
      { signal: controller.signal },
    );

    if (controller.signal.aborted) return;
    setResults(result.ok ? result.data.results : []);
    setActive(0);
    setStatus('done');
  }, []);

  /* Debounce. 180 ms is below the threshold where typing feels laggy and well
     above the rate that would hammer the endpoint. */
  useEffect(() => {
    const timer = window.setTimeout(() => void run(query), 180);
    return () => window.clearTimeout(timer);
  }, [query, run]);

  /* Reset on close, so reopening is a fresh start rather than stale results. */
  useEffect(() => {
    if (!searchOpen) {
      setQuery('');
      setResults([]);
      setStatus('idle');
      abortRef.current?.abort();
    }
  }, [searchOpen]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function open(slug: string) {
    setSearchOpen(false);
    router.push(`/producto/${slug}`);
  }

  return (
    <Overlay
      open={searchOpen}
      onClose={() => setSearchOpen(false)}
      title="Buscar"
      side="top"
      className="rounded-b-[var(--radius-lg)]"
    >
      <div className="u-container py-6">
        <div className="relative border-b border-[var(--line-strong)] pb-3 focus-within:border-[var(--accent)]">
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="search-results"
            aria-autocomplete="list"
            aria-activedescendant={results.length > 0 ? `search-result-${active}` : undefined}
            aria-label="Buscar productos"
            autoComplete="off"
            spellCheck={false}
            maxLength={MAX_SEARCH_QUERY_LENGTH}
            placeholder="iPhone, MacBook, AirPods…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((current) => Math.min(current + 1, results.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((current) => Math.max(current - 1, 0));
              } else if (event.key === 'Enter') {
                const target = results[active];
                if (target) {
                  event.preventDefault();
                  open(target.slug);
                }
              }
            }}
            className="u-display-tight w-full border-0 bg-transparent pr-10 text-[var(--text-step-3)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none"
          />
          <span
            aria-hidden="true"
            className={cn(
              'absolute right-0 top-2 size-4 rounded-full border border-[var(--accent)] transition-opacity',
              status === 'loading' ? 'animate-pulse opacity-100' : 'opacity-25',
            )}
          />
        </div>

        {/* Announced, not just rendered: a sighted user sees the list change, a
            screen-reader user needs to be told. */}
        <p aria-live="polite" className="sr-only">
          {status === 'done'
            ? results.length === 0
              ? 'Sin resultados'
              : `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'}`
            : ''}
        </p>

        {results.length > 0 ? (
          <ul id="search-results" role="listbox" aria-label="Resultados" className="mt-5">
            {results.map((result, index) => (
              <li
                key={result.slug}
                id={`search-result-${index}`}
                role="option"
                aria-selected={index === active}
              >
                <button
                  type="button"
                  // -1: the input keeps focus, and the listbox is driven by
                  // `aria-activedescendant`. That is what makes arrow keys work.
                  tabIndex={-1}
                  onClick={() => open(result.slug)}
                  onPointerEnter={() => setActive(index)}
                  className={cn(
                    'group/product flex w-full items-center gap-4 border-t border-[var(--line)] px-2 py-3 text-left transition-colors',
                    index === active && 'bg-[var(--surface-raised)]',
                  )}
                >
                  <span className="relative grid size-14 flex-none place-items-center">
                    <ProductRender
                      kind={result.render as RenderKind}
                      color={result.color}
                      productName={result.name}
                      className="h-12 w-12"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[var(--text-step-0)] font-medium">
                      {result.name}
                    </span>
                    <span className="u-label block normal-case tracking-[0.1em]">
                      {result.family} · {result.inStock ? 'En stock' : 'Sin stock'}
                    </span>
                  </span>
                  <span className="u-mono flex-none text-right text-[var(--text-step--1)]">
                    {formatARS(result.fromTransfer)}
                    <span className="block text-[var(--text-step--2)] text-[var(--text-faint)]">
                      transferencia
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {status === 'done' && results.length === 0 ? (
          <div className="mt-6 border-t border-[var(--line)] pt-6">
            <p className="text-[var(--text-step-0)] text-[var(--text-dim)]">
              No encontramos nada para{' '}
              {/* Rendered as a text node by React, never as markup. */}
              <span className="u-mono text-[var(--text)]">{query}</span>.
            </p>
            <p className="u-prose mt-2 text-[var(--text-step--1)] text-[var(--text-faint)]">
              Probá con el modelo (iPhone 17, MacBook Air) o escribinos y lo buscamos.
            </p>
          </div>
        ) : null}

        {status === 'idle' ? (
          <div className="mt-6">
            <p className="u-label">Búsquedas frecuentes</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {['iPhone 17 Pro', 'MacBook Air', 'AirPods Pro', 'iPad Pro', 'Watch Ultra'].map(
                (term) => (
                  <li key={term}>
                    <button
                      type="button"
                      onClick={() => {
                        setQuery(term);
                        inputRef.current?.focus();
                      }}
                      className="u-mono rounded-[var(--radius-sm)] border border-[var(--line)] px-3 py-2 text-[var(--text-step--2)] text-[var(--text-dim)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text)]"
                    >
                      {term}
                    </button>
                  </li>
                ),
              )}
            </ul>
          </div>
        ) : null}
      </div>
    </Overlay>
  );
}

interface SearchResult {
  slug: string;
  name: string;
  family: string;
  tagline: string;
  render: string;
  color: { hex: string; hexAccent: string; name: string; light: boolean };
  from: number;
  fromTransfer: number;
  inStock: boolean;
}
