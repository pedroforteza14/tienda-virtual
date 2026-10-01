import Link from 'next/link';
import { ButtonLink } from '@/components/ui/Button';
import { Aperture } from '@/components/ui/Aperture';
import { DEVICE_FAMILIES } from '@/types/catalog';

const CATEGORY_LABELS: Record<string, string> = {
  iphone: 'iPhone',
  mac: 'Mac',
  ipad: 'iPad',
  watch: 'Watch',
  airpods: 'AirPods',
  accessories: 'Accesorios',
};

/**
 * 404.
 *
 * Also the page an unauthorised order lookup lands on — which is why it is a real,
 * useful page with routes out of it rather than a dead end. It must not hint that
 * something exists but is hidden.
 */
export default function NotFound() {
  return (
    <div className="u-container grid min-h-[70svh] place-items-center py-[var(--section-y)]">
      <div className="text-center">
        <Aperture size="7rem" className="mx-auto" />
        <p className="u-label mt-10">Error 404</p>
        <h1 className="u-display mt-4 text-[var(--text-step-5)]">
          Nothing <span className="u-editorial text-[var(--accent)] normal-case">here</span>.
        </h1>
        <p className="u-prose mx-auto mt-5 text-[var(--text-step-0)] text-[var(--text-dim)]">
          La página que buscás no existe, cambió de dirección, o el enlace no es tuyo.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/tienda" size="lg">
            Ver catálogo
          </ButtonLink>
          <ButtonLink href="/" variant="secondary" size="lg">
            Volver al inicio
          </ButtonLink>
        </div>

        <nav aria-label="Categorías" className="mt-12">
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {DEVICE_FAMILIES.map((family) => (
              <li key={family}>
                <Link
                  href={`/tienda/${family}`}
                  className="u-mono text-[var(--text-step--2)] uppercase tracking-[0.12em] text-[var(--text-faint)] transition-colors hover:text-[var(--accent)]"
                >
                  {CATEGORY_LABELS[family] ?? family}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
