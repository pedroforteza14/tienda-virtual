import { ProductRender } from '@/components/product/ProductRender';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/Reveal';
import { site } from '@/config/site';
import { EDITORIAL_IS_MOCK, wildEntries } from '@/data/editorial';
import { cn } from '@/lib/utils/cn';

/**
 * SEEN IN THE WILD — social proof as editorial, not an Instagram grid.
 *
 * The brief rules out the generic square grid, and it is right to: a 3×3 of
 * equal tiles reads as a widget. Here the entries sit on an asymmetric layout
 * with captions written like photo credits, and the quotes are set as pull
 * quotes rather than cards with stars.
 *
 * The content is mock, so it says so. Presenting invented quotes as real customer
 * reviews is deceptive, and in Argentina it is a Ley 24.240 problem as well as an
 * ethical one — see src/data/editorial.ts.
 */
export function SeenInTheWild() {
  return (
    <section aria-labelledby="wild-heading" className="u-container u-section">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-6 border-t border-[var(--line)] pt-6">
          <div>
            <p className="u-label">Nuestros clientes</p>
            <h2 id="wild-heading" className="u-display mt-4 text-[var(--text-step-5)]">
              Seen in the
              <span className="u-editorial ml-3 text-[var(--accent)] normal-case">wild</span>
            </h2>
          </div>
          <a
            href={`https://www.instagram.com/${site.contact.instagram}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="u-label inline-flex items-center gap-2 text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
          >
            @{site.contact.instagram}
            <span aria-hidden="true">↗</span>
            <span className="sr-only">(se abre en una pestaña nueva)</span>
          </a>
        </div>
      </Reveal>

      <RevealGroup className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {wildEntries.map((entry) => (
          <RevealItem
            key={entry.id}
            className={cn(entry.span === 2 && 'sm:col-span-2 lg:col-span-2')}
          >
            <figure className="group/product flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-raised)]">
              <div
                className={cn(
                  'relative grid place-items-center bg-[var(--surface-sunken)]',
                  entry.span === 2 ? 'aspect-16/9' : 'aspect-4/5',
                )}
              >
                <span
                  aria-hidden="true"
                  className="absolute aspect-square w-[42%] rounded-full border border-[color-mix(in_oklab,var(--accent)_26%,transparent)]"
                />
                <ProductRender
                  kind={entry.render}
                  color={entry.color}
                  productName={entry.caption}
                  className={entry.span === 2 ? 'h-[70%] w-auto' : 'h-[72%] w-auto'}
                  specular
                />
              </div>

              <figcaption className="flex flex-1 flex-col gap-3 p-5">
                <p className="u-mono text-[var(--text-step--2)] text-[var(--text-faint)]">
                  {entry.city}
                </p>
                <p className="text-[var(--text-step-0)] text-[var(--text)]">{entry.caption}</p>

                {entry.quote ? (
                  <blockquote className="mt-auto border-l border-[var(--accent)] pl-4">
                    <p className="u-editorial text-[var(--text-step-1)] text-[var(--text)]">
                      “{entry.quote}”
                    </p>
                    <cite className="u-label mt-2 block not-italic">{entry.attribution}</cite>
                  </blockquote>
                ) : null}
              </figcaption>
            </figure>
          </RevealItem>
        ))}
      </RevealGroup>

      {EDITORIAL_IS_MOCK ? (
        <p className="u-mono mt-6 text-[var(--text-step--2)] text-[var(--text-faint)]">
          Contenido de demostración: las fotos y los testimonios de esta sección son ejemplos
          escritos para el diseño, no reseñas reales de clientes.
        </p>
      ) : null}
    </section>
  );
}
