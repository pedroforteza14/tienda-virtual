import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd } from '@/lib/seo/json-ld';
import { breadcrumbSchema } from '@/lib/seo/schema';
import { DiscoveryExperience } from '@/features/discovery/DiscoveryExperience';
import { Ledger } from '@/components/layout/Ledger';
import { USE_CASES, type UseCase } from '@/types/catalog';

export const metadata: Metadata = buildMetadata({
  title: 'Encontrá tu equipo — recomendador de OWNER STORE',
  description:
    'Contanos para qué lo vas a usar y cuánto querés gastar, y te recomendamos el iPhone, Mac, ' +
    'iPad o Watch que mejor te sirve. Con precios reales y stock.',
  path: '/descubri',
});

export default async function DiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ uso?: string | string[] }>;
}) {
  const { uso } = await searchParams;
  const raw = Array.isArray(uso) ? uso[0] : uso;

  // Deep-linkable from the home page. An unrecognised value simply starts at
  // step one rather than erroring — a bad query string should not be a dead end.
  const initialUseCase: UseCase | null =
    raw && (USE_CASES as readonly string[]).includes(raw) ? (raw as UseCase) : null;

  return (
    <div className="relative pt-[calc(var(--header-h)+1rem)]">
      <Ledger />
      <DiscoveryExperience initialUseCase={initialUseCase} />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Inicio', path: '/' },
          { name: 'Encontrá tu equipo', path: '/descubri' },
        ])}
      />
    </div>
  );
}
