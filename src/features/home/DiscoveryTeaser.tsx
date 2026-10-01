import Link from 'next/link';
import { Reveal } from '@/components/motion/Reveal';
import { USE_CASES } from '@/types/catalog';

const LABELS: Record<(typeof USE_CASES)[number], { title: string; blurb: string }> = {
  work: { title: 'Trabajo', blurb: 'Compilar, editar, cerrar el mes' },
  creative: { title: 'Creatividad', blurb: 'Dibujar, filmar, producir' },
  everyday: { title: 'Día a día', blurb: 'Mensajes, fotos, música' },
  travel: { title: 'Viaje', blurb: 'Liviano, autónomo, resistente' },
  entertainment: { title: 'Entretenimiento', blurb: 'Series, juegos, sonido' },
};

/**
 * The entry point to "Find your device".
 *
 * Framed as a question rather than a quiz, and each answer is an aperture — the
 * same device as the hero, so the connection between "the brand" and "the tool"
 * is visual rather than explained. Each option is a real link, so this section
 * works with no JavaScript at all and the choice is bookmarkable.
 */
export function DiscoveryTeaser() {
  return (
    <section
      aria-labelledby="discovery-heading"
      className="u-hairline-top border-b border-line bg-surface-sunken"
    >
      <div className="u-container u-section">
        <Reveal>
          <p className="u-label">¿No sabés cuál?</p>
          <h2
            id="discovery-heading"
            className="u-display mt-4 max-w-[14ch] text-h1"
          >
            Find your
            <span className="u-editorial ml-3 text-accent normal-case">device</span>
          </h2>
          <p className="u-prose mt-5 text-body text-fg-dim">
            Contanos para qué lo vas a usar y te armamos una recomendación real, con precios y
            stock. Tarda menos de un minuto.
          </p>
        </Reveal>

        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {USE_CASES.map((useCase, index) => (
            <li key={useCase}>
              <Reveal delay={0.04 * index}>
                {/*
                  A plain Link, not a ButtonLink.
                  `ButtonLink` carries `whitespace-nowrap`, which is right for a
                  button label and wrong for a card with a sentence in it: at
                  1024px these blurbs refused to wrap and pushed the page into a
                  10px horizontal scroll, which visual QA caught. It had also
                  needed five `!important` overrides to look like a card at all —
                  a reliable sign of the wrong component.
                */}
                <Link
                  href={`/descubri?uso=${useCase}`}
                  className="group/option flex h-full min-h-32 flex-col justify-between gap-4 rounded-[var(--radius-lg)] border border-line px-5 py-6 transition-colors hover:border-accent"
                >
                  <span
                    aria-hidden="true"
                    className="size-8 flex-none rounded-full border border-[color-mix(in_oklab,var(--accent)_45%,transparent)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-owner)] group-hover/option:scale-125"
                  />
                  <span className="block">
                    <span className="u-display-tight block text-lead text-fg">
                      {LABELS[useCase].title}
                    </span>
                    <span className="u-mono mt-1 block text-balance text-micro text-fg-faint">
                      {LABELS[useCase].blurb}
                    </span>
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
