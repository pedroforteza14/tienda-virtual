'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { formatARS } from '@/lib/money';
import { apiFetch } from '@/lib/http/client';
import { cn } from '@/lib/utils/cn';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ProductRender } from '@/components/product/ProductRender';
import { USE_CASES, type RenderKind, type UseCase } from '@/types/catalog';

/**
 * ============================================================================
 *  FIND YOUR DEVICE
 * ============================================================================
 *
 * Two questions, then a real recommendation with real prices and real stock.
 *
 * Designed as a product experience rather than a quiz: one question per screen at
 * display scale, each answer an aperture that fills as you choose, and the
 * recommendation arrives as an editorial spread rather than a results table.
 *
 * Accessibility, because step-based flows are usually where it breaks:
 *  - each step is a `<fieldset>` with a `<legend>` — the question is programmatically
 *    the group's name, not just large text above it;
 *  - the heading receives focus on each step change, so a screen-reader user is
 *    told where they are instead of silently landing in a new set of radios;
 *  - progress is announced in a live region;
 *  - every answer is a real radio input, so arrow keys work as expected.
 *
 * The recommendation is computed **server-side** (`POST /api/discovery`): the
 * ranking is merchandising logic, and shipping it to the browser would both expose
 * it and put the whole catalogue in the bundle.
 */

const USE_CASE_COPY: Record<UseCase, { title: string; blurb: string }> = {
  work: { title: 'Trabajo', blurb: 'Compilar, editar planillas, cerrar el mes' },
  creative: { title: 'Creatividad', blurb: 'Dibujar, filmar, producir música' },
  everyday: { title: 'Día a día', blurb: 'Mensajes, fotos, música, mapas' },
  travel: { title: 'Viaje', blurb: 'Liviano, autónomo, resistente' },
  entertainment: { title: 'Entretenimiento', blurb: 'Series, juegos, buen sonido' },
};

const BUDGETS = [
  { id: 'entry', title: 'Hasta $1.000.000', blurb: 'Lo esencial, bien hecho' },
  { id: 'mid', title: 'Hasta $2.500.000', blurb: 'El punto dulce de la línea' },
  { id: 'premium', title: 'Sin techo', blurb: 'Lo mejor que haya' },
  { id: 'any', title: 'Todavía no sé', blurb: 'Mostrame todo' },
] as const;

type Budget = (typeof BUDGETS)[number]['id'];

interface Recommendation {
  slug: string;
  name: string;
  family: string;
  tagline: string;
  summary: string;
  highlights: string[];
  render: RenderKind;
  color: { hex: string; hexAccent: string; name: string; light: boolean };
  from: number;
  fromTransfer: number;
  instalment: number;
  instalmentCount: number;
  inStock: boolean;
}

export function DiscoveryExperience({ initialUseCase }: { initialUseCase: UseCase | null }) {
  const reduced = useReducedMotion();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [step, setStep] = useState<0 | 1 | 2>(initialUseCase ? 1 : 0);
  const [useCase, setUseCase] = useState<UseCase | null>(initialUseCase);
  const [budget, setBudget] = useState<Budget>('any');
  const [results, setResults] = useState<Recommendation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Move focus to the step heading, so the change is announced. */
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const submit = useCallback(
    async (chosenUseCase: UseCase, chosenBudget: Budget) => {
      setLoading(true);
      setError(null);
      const result = await apiFetch<{ results: Recommendation[] }>('/api/discovery', {
        method: 'POST',
        body: { useCase: chosenUseCase, budget: chosenBudget, families: [] },
      });
      setLoading(false);

      if (!result.ok) {
        setError(result.message);
        return;
      }
      setResults(result.data.results);
      setStep(2);
    },
    [],
  );

  const transition = { duration: reduced ? 0 : 0.42, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <div className="u-container u-section">
      {/* Progress read-out — mono, like an instrument. */}
      <div className="flex items-center gap-4">
        <p className="u-label" aria-live="polite">
          Paso {step + 1} de 3
        </p>
        <span aria-hidden="true" className="relative h-px flex-1 bg-[var(--line)]">
          <span
            className="absolute inset-y-0 left-0 bg-[var(--accent)] transition-[width] duration-[var(--dur-slow)] ease-[var(--ease-out-owner)]"
            style={{ width: `${((step + 1) / 3) * 100}%` }}
          />
        </span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {/* ---------------------------- STEP 1 ---------------------------- */}
        {step === 0 ? (
          <motion.div
            key="step-use"
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 1 } : { opacity: 0, y: -18 }}
            transition={transition}
            className="mt-10"
          >
            <fieldset>
              <legend className="contents">
                <h1
                  ref={headingRef}
                  tabIndex={-1}
                  className="u-display max-w-[18ch] text-[var(--text-step-5)] outline-none"
                >
                  What do you
                  <span className="u-editorial ml-3 text-[var(--accent)] normal-case">need</span>?
                </h1>
              </legend>
              <p className="u-prose mt-5 text-[var(--text-step-0)] text-[var(--text-dim)]">
                Elegí lo que más se parezca a tu uso real. No hay respuesta incorrecta.
              </p>

              <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {USE_CASES.map((candidate) => (
                  <li key={candidate}>
                    <OptionCard
                      name="useCase"
                      value={candidate}
                      checked={useCase === candidate}
                      title={USE_CASE_COPY[candidate].title}
                      blurb={USE_CASE_COPY[candidate].blurb}
                      onSelect={() => {
                        setUseCase(candidate);
                        setStep(1);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </fieldset>
          </motion.div>
        ) : null}

        {/* ---------------------------- STEP 2 ---------------------------- */}
        {step === 1 ? (
          <motion.div
            key="step-budget"
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 1 } : { opacity: 0, y: -18 }}
            transition={transition}
            className="mt-10"
          >
            <fieldset>
              <legend className="contents">
                <h1
                  ref={headingRef}
                  tabIndex={-1}
                  className="u-display max-w-[18ch] text-[var(--text-step-5)] outline-none"
                >
                  ¿Hasta cuánto querés
                  <span className="u-editorial ml-3 text-[var(--accent)] normal-case">gastar</span>?
                </h1>
              </legend>
              <p className="u-prose mt-5 text-[var(--text-step-0)] text-[var(--text-dim)]">
                Precios con transferencia. Siempre podés ver el resto después.
              </p>

              <ul className="mt-10 grid gap-3 sm:grid-cols-2">
                {BUDGETS.map((candidate) => (
                  <li key={candidate.id}>
                    <OptionCard
                      name="budget"
                      value={candidate.id}
                      checked={budget === candidate.id}
                      title={candidate.title}
                      blurb={candidate.blurb}
                      onSelect={() => {
                        setBudget(candidate.id);
                        if (useCase) void submit(useCase, candidate.id);
                      }}
                    />
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button variant="ghost" onClick={() => setStep(0)} className="border border-[var(--line)]">
                  ← Volver
                </Button>
                {loading ? (
                  <Button loading disabled>
                    Buscando
                  </Button>
                ) : null}
              </div>

              {error ? (
                <p role="status" className="u-mono mt-4 text-[var(--color-signal-err)]">
                  {error}
                </p>
              ) : null}
            </fieldset>
          </motion.div>
        ) : null}

        {/* ---------------------------- STEP 3 ---------------------------- */}
        {step === 2 && results ? (
          <motion.div
            key="step-results"
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 1 } : { opacity: 0, y: -18 }}
            transition={transition}
            className="mt-10"
          >
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="u-display max-w-[20ch] text-[var(--text-step-5)] outline-none"
            >
              Esto te
              <span className="u-editorial ml-3 text-[var(--accent)] normal-case">serviría</span>.
            </h1>
            <p className="u-prose mt-5 text-[var(--text-step-0)] text-[var(--text-dim)]">
              Para {useCase ? USE_CASE_COPY[useCase].title.toLowerCase() : 'tu uso'}, en orden de lo
              que más recomendamos. Si querés, lo repasamos por WhatsApp.
            </p>

            {results.length === 0 ? (
              <p className="u-mono mt-10 text-[var(--text-dim)]">
                No encontramos nada en ese rango. Probá ampliando el presupuesto.
              </p>
            ) : (
              <ol className="mt-10 flex flex-col gap-10">
                {results.map((item, index) => (
                  <li key={item.slug}>
                    <article className="group/product grid gap-6 border-t border-[var(--line)] pt-6 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10">
                      <Link
                        href={`/producto/${item.slug}`}
                        className="relative grid aspect-square place-items-center rounded-[var(--radius-lg)] bg-[var(--surface-raised)]"
                      >
                        <span
                          aria-hidden="true"
                          className="absolute aspect-square w-[58%] rounded-full border border-[color-mix(in_oklab,var(--accent)_30%,transparent)]"
                        />
                        <ProductRender
                          kind={item.render}
                          color={item.color}
                          productName={item.name}
                          className="h-[76%] w-auto"
                          specular
                        />
                      </Link>

                      <div>
                        <p className="u-label">
                          <span className="text-[var(--accent)]">
                            {String(index + 1).padStart(2, '0')}
                          </span>{' '}
                          · {item.family}
                        </p>
                        <h2 className="u-display-tight mt-3 text-[var(--text-step-3)]">
                          <Link href={`/producto/${item.slug}`}>{item.name}</Link>
                        </h2>
                        <p className="u-editorial mt-1 text-[var(--text-step-1)] text-[var(--accent)]">
                          {item.tagline}
                        </p>
                        <p className="u-prose mt-3 text-[var(--text-step--1)] text-[var(--text-dim)]">
                          {item.summary}
                        </p>

                        <ul className="mt-4 flex flex-col gap-1.5">
                          {item.highlights.map((highlight) => (
                            <li
                              key={highlight}
                              className="flex gap-3 text-[var(--text-step--1)] text-[var(--text-dim)]"
                            >
                              <span
                                aria-hidden="true"
                                className="mt-2 size-1 flex-none rounded-full bg-[var(--accent)]"
                              />
                              {highlight}
                            </li>
                          ))}
                        </ul>

                        <div className="mt-5 flex flex-wrap items-end gap-6">
                          <p className="u-mono">
                            <span className="block text-[var(--text-step-1)] font-semibold">
                              {formatARS(item.fromTransfer)}
                            </span>
                            <span className="block text-[var(--text-step--2)] text-[var(--accent)]">
                              {item.instalmentCount} × {formatARS(item.instalment)}
                            </span>
                          </p>
                          <ButtonLink href={`/producto/${item.slug}`} size="md">
                            Ver y configurar
                          </ButtonLink>
                        </div>
                      </div>
                    </article>
                  </li>
                ))}
              </ol>
            )}

            <div className="mt-12 flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
              <Button
                variant="ghost"
                className="border border-[var(--line)]"
                onClick={() => {
                  setResults(null);
                  setStep(0);
                }}
              >
                Empezar de nuevo
              </Button>
              <ButtonLink href="/tienda" variant="secondary">
                Ver todo el catálogo
              </ButtonLink>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * An answer: an aperture that fills when chosen.
 *
 * A real radio input inside a label, so arrow-key navigation within the group works
 * and the whole card is the hit area.
 */
function OptionCard({
  name,
  value,
  checked,
  title,
  blurb,
  onSelect,
}: {
  name: string;
  value: string;
  checked: boolean;
  title: string;
  blurb: string;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        'group/option flex h-full cursor-pointer flex-col gap-5 rounded-[var(--radius-lg)] border p-6 transition-colors',
        checked
          ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]'
          : 'border-[var(--line)] hover:border-[var(--line-strong)]',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          'grid size-9 place-items-center rounded-full border transition-colors',
          checked ? 'border-[var(--accent)]' : 'border-[color-mix(in_oklab,var(--accent)_45%,transparent)]',
        )}
      >
        <span
          className={cn(
            'size-4 rounded-full bg-[var(--accent)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-owner)]',
            checked ? 'scale-100' : 'scale-0 group-hover/option:scale-50',
          )}
        />
      </span>
      <span>
        <span className="u-display-tight block text-[var(--text-step-2)] text-[var(--text)]">
          {title}
        </span>
        <span className="u-mono mt-1.5 block text-[var(--text-step--2)] text-[var(--text-faint)]">
          {blurb}
        </span>
      </span>
    </label>
  );
}
