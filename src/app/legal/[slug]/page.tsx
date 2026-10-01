import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd } from '@/lib/seo/json-ld';
import { breadcrumbSchema } from '@/lib/seo/schema';
import { LEGAL_IS_DRAFT, getLegalPage, legalPages } from '@/data/legal';

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
/**
 * Dynamically rendered, for two reasons that happen to point the same way.
 *
 * 1. **Live stock.** This page shows availability. Prerendering it at build time
 *    freezes stock until the next deploy, which is wrong in a way customers
 *    notice only at checkout.
 * 2. **The Content-Security-Policy nonce.** A per-request nonce cannot exist in a
 *    file generated once at build time, so a prerendered page's script tags carry
 *    no nonce and the strict CSP blocks every one of them. That is not a
 *    hypothetical: it shipped, and the entire site was non-interactive in
 *    production — no cart, no search, no configurator — while every build, lint
 *    and type check passed. See docs/threat-model.md §4.5.
 *
 * `generateStaticParams` was removed rather than left in place: with
 * `force-dynamic` it does nothing, and leaving it would suggest these routes are
 * prerendered when they must not be. An unknown slug is still a `notFound()`.
 */
export const dynamic = 'force-dynamic';

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getLegalPage(slug);
  if (!page) notFound();

  return (
    <div
      data-surface="light"
      className="min-h-dvh bg-surface pt-[calc(var(--header-h)+2rem)] text-fg"
    >
      <div className="u-container u-section-tight max-w-3xl">
        <nav aria-label="Migas de pan">
          <ol className="u-mono flex flex-wrap items-center gap-2 text-micro text-fg-faint">
            <li>
              <Link href="/" className="inline-block py-1.5 transition-colors hover:text-fg-dim">
                Inicio
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-fg-dim">
              {page.title}
            </li>
          </ol>
        </nav>

        <h1 className="u-display mt-6 text-h2">{page.title}</h1>
        <p className="u-prose mt-4 text-lead text-fg-dim">
          {page.summary}
        </p>
        <p className="u-mono mt-4 text-micro text-fg-faint">
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
          <p className="u-mono mt-8 rounded-[var(--radius-sm)] border border-line-strong p-4 text-micro text-fg-dim">
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
                className="u-display-tight border-t border-line pt-5 text-h4"
              >
                {section.heading}
              </h2>
              <div className="mt-4 flex flex-col gap-4">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="u-prose text-body text-fg-dim">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <nav aria-label="Otras políticas" className="mt-16 border-t border-line pt-6">
          <p className="u-label">Otras políticas</p>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            {legalPages
              .filter((candidate) => candidate.slug !== page.slug)
              .map((candidate) => (
                <li key={candidate.slug}>
                  <Link
                    href={`/legal/${candidate.slug}`}
                    className="u-mono inline-block py-1.5 text-tiny text-accent underline"
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
