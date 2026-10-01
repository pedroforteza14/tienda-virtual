import Link from 'next/link';
import { site } from '@/config/site';
import { PRICES_ARE_MOCK } from '@/data/catalog';
import { DEVICE_FAMILIES } from '@/types/catalog';
import { Wordmark } from '@/components/layout/Wordmark';
import { WhatsAppCta } from '@/components/layout/WhatsAppCta';

const CATEGORY_LABELS: Record<string, string> = {
  iphone: 'iPhone',
  mac: 'Mac',
  ipad: 'iPad',
  watch: 'Watch',
  airpods: 'AirPods',
  accessories: 'Accesorios',
};

/**
 * Footer.
 *
 * Trust signals are stated as sentences in the places they are relevant, not
 * stacked as a wall of badges — the brief's §19 point. Here they are a short
 * list with real specifics (12 months, which card, which courier), because a
 * specific claim reads as true and a generic badge reads as decoration.
 */
export function Footer() {
  return (
    <footer className="u-hairline-top mt-auto bg-surface">
      <WhatsAppCta />

      <div className="u-container u-section-tight grid gap-10 lg:grid-cols-[1.2fr_repeat(3,minmax(0,1fr))]">
        <div>
          <Wordmark />
          <p className="u-prose mt-4 text-tiny text-fg-dim">
            Productos Apple originales en Argentina. Garantía de {site.commerce.warrantyMonths} meses,
            envíos a todo el país y atención por WhatsApp de personas reales.
          </p>
          <p className="u-mono mt-5 text-micro text-fg-faint">
            {site.store.city}, {site.store.province}
          </p>
        </div>

        <nav aria-labelledby="footer-shop">
          <h2 id="footer-shop" className="u-label">
            Tienda
          </h2>
          <ul className="mt-4 flex flex-col gap-2.5">
            {DEVICE_FAMILIES.map((family) => (
              <li key={family}>
                <Link
                  href={`/tienda/${family}`}
                  className="inline-block py-1 text-tiny text-fg-dim transition-colors hover:text-fg"
                >
                  {CATEGORY_LABELS[family] ?? family}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-help">
          <h2 id="footer-help" className="u-label">
            Ayuda
          </h2>
          <ul className="mt-4 flex flex-col gap-2.5">
            {[
              { href: '/descubri', label: 'Encontrá tu equipo' },
              { href: '/legal/garantia', label: 'Garantía' },
              { href: '/legal/envios', label: 'Envíos y retiro' },
              { href: '/legal/pagos', label: 'Medios de pago' },
              { href: '/cuenta', label: 'Mi cuenta' },
            ].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-block py-1 text-tiny text-fg-dim transition-colors hover:text-fg"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="u-label">Confianza</h2>
          <ul className="mt-4 flex flex-col gap-2.5 text-tiny text-fg-dim">
            <li>Equipos nuevos, sellados y liberados</li>
            <li>Garantía escrita de {site.commerce.warrantyMonths} meses</li>
            <li>
              {site.commerce.interestFreeInstalments} cuotas sin interés ·{' '}
              {site.commerce.transferDiscountPercent}% off por transferencia
            </li>
            <li>Envío asegurado o retiro con turno</li>
          </ul>

          <ul className="mt-5 flex gap-4">
            <li>
              <a
                href={`https://www.instagram.com/${site.contact.instagram}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="u-label inline-block py-1.5 text-fg-dim transition-colors hover:text-accent"
              >
                Instagram
                <span className="sr-only"> (se abre en una pestaña nueva)</span>
              </a>
            </li>
            <li>
              <a
                href={`mailto:${site.contact.email}`}
                className="u-label inline-block py-1.5 text-fg-dim transition-colors hover:text-accent"
              >
                Email
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="u-container u-hairline-top flex flex-col gap-3 py-6 md:flex-row md:items-center md:justify-between">
        <p className="u-mono text-micro text-fg-faint">
          © {new Date().getFullYear()} {site.name}
        </p>
        <ul className="flex flex-wrap gap-5">
          {[
            { href: '/legal/terminos', label: 'Términos' },
            { href: '/legal/privacidad', label: 'Privacidad' },
          ].map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="u-mono inline-block py-1.5 text-micro text-fg-faint transition-colors hover:text-fg-dim"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {PRICES_ARE_MOCK ? (
        <div className="border-t border-[color-mix(in_oklab,var(--accent)_30%,transparent)] bg-[color-mix(in_oklab,var(--accent)_7%,transparent)]">
          <p className="u-container u-mono py-3 text-center text-micro text-accent">
            Demo · Los precios, el stock y los datos de pago de este sitio son de demostración y no
            corresponden a valores reales.
          </p>
        </div>
      ) : null}
    </footer>
  );
}
