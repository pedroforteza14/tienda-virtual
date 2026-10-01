import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd } from '@/lib/seo/json-ld';
import { breadcrumbSchema } from '@/lib/seo/schema';
import { LEGAL_IS_DRAFT, getLegalPage, legalPages } from '@/data/legal';

export function generateStaticParams() {
  return legalPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getLegalPage(slug);

  if (!page) {
    return buildMetadata({
      title: 'Página no encontrada',
      description: 'La página que buscás no existe.',
      path: '/legal',
      noIndex: true,
    });
  }

  return buildMetadata({
    title: `${page.title} — OWNER STORE`,
    description: page.summary,
    path: `/legal/${page.slug}`,
    ogType: 'article',
  });
}

/**
 * Policy pages, on the **light surface**.
 *
 * Long-form reading and printing beat atmosphere here, and `data-surface="light"`
 * flips the semantic token layer — no component knows or cares which surface it is
 * rendered on.
 */
export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getLegalPage(slug);
  if (!page) notFound();

  return (
    <div
      data-surface="light"
      className="min-h-dvh bg-[var(--surface)] pt-[calc(var(--header-h)+2rem)] text-[var(--text)]"
    >
      <div className="u-container u-section-tight max-w-3xl">
        <nav aria-label="Migas de pan">
          <ol className="u-mono flex flex-wrap items-center gap-2 text-[var(--text-step--2)] text-[var(--text-faint)]">
            <li>
              <Link href="/" className="transition-colors hover:text-[var(--text-dim)]">
                Inicio
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-[var(--text-dim)]">
              {page.title}
            </li>
          </ol>
        </nav>

        <h1 className="u-display mt-6 text-[var(--text-step-4)]">{page.title}</h1>
        <p className="u-prose mt-4 text-[var(--text-step-1)] text-[var(--text-dim)]">
          {page.summary}
        </p>
        <p className="u-mono mt-4 text-[var(--text-step--2)] text-[var(--text-faint)]">
          Última actualización:{' '}
          <time dateTime={page.updated}>
            {new Date(page.updated).toLocaleDateString('es-AR', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
          </time>
        </p>

        {LEGAL_IS_DRAFT ? (
          <p className="u-mono mt-8 rounded-[var(--radius-sm)] border border-[var(--line-strong)] p-4 text-[var(--text-step--2)] text-[var(--text-dim)]">
            Borrador de demostración. Este texto fue redactado como ejemplo y no tiene revisión
            legal. Antes de operar, un abogado debe validar el cumplimiento de la Ley 24.240 y la
            Ley 25.326.
          </p>
        ) : null}

        <div className="mt-12 flex flex-col gap-10">
          {page.sections.map((section, index) => (
            <section key={section.heading} aria-labelledby={`section-${index}`}>
              <h2
                id={`section-${index}`}
                className="u-display-tight border-t border-[var(--line)] pt-5 text-[var(--text-step-2)]"
              >
                {section.heading}
              </h2>
              <div className="mt-4 flex flex-col gap-4">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="u-prose text-[var(--text-step-0)] text-[var(--text-dim)]">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <nav aria-label="Otras políticas" className="mt-16 border-t border-[var(--line)] pt-6">
          <p className="u-label">Otras políticas</p>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            {legalPages
              .filter((candidate) => candidate.slug !== page.slug)
              .map((candidate) => (
                <li key={candidate.slug}>
                  <Link
                    href={`/legal/${candidate.slug}`}
                    className="u-mono text-[var(--text-step--1)] text-[var(--accent)] underline"
                  >
                    {candidate.title}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
      </div>

      <JsonLd
        data={breadcrumbSchema([
          { name: 'Inicio', path: '/' },
          { name: page.title, path: `/legal/${page.slug}` },
        ])}
      />
    </div>
  );
}
