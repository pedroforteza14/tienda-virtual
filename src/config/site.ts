/**
 * Public configuration — safe in client components.
 *
 * `process.env.NEXT_PUBLIC_*` is read inline (not through a helper) because
 * Next's bundler must statically see each reference to inline it. Every value
 * here is intentionally public; nothing secret may ever be added.
 */

function digitsOnly(value: string | undefined, fallback: string): string {
  const cleaned = (value ?? '').replace(/\D/g, '');
  return cleaned.length >= 8 ? cleaned : fallback;
}

export const site = {
  name: 'OWNER STORE',
  shortName: 'OWNER',
  tagline: 'Technology, redefined.',
  description:
    'OWNER STORE — iPhone, Mac, iPad, Watch y AirPods en Argentina. Productos originales, ' +
    'garantía oficial, precio transferencia y cuotas sin interés. Envíos a todo el país.',
  locale: 'es-AR',
  /** Rioplatense Spanish for commerce copy, English for display copy. */
  languageTag: 'es-AR',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',

  contact: {
    whatsapp: digitsOnly(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER, '5491100000000'),
    email: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'hola@ownerstore.example',
    instagram: (process.env.NEXT_PUBLIC_INSTAGRAM_HANDLE ?? 'ownerstoreok').replace(/[^\w.]/g, ''),
  },

  /** Mock, and labelled as such everywhere it surfaces. */
  store: {
    city: 'Buenos Aires',
    province: 'CABA',
    country: 'AR',
    pickupNote: 'Retiro en nuestro showroom de Palermo, con turno previo.',
  },

  /** Argentine commercial terms. Mock values — see src/data/README.md. */
  commerce: {
    transferDiscountPercent: 12,
    interestFreeInstalments: 12,
    freeShippingThresholdPesos: 500_000,
    warrantyMonths: 12,
  },
} as const;

/** Absolute URL from a site-relative path. Used by metadata, sitemap and JSON-LD. */
export function absoluteUrl(path = '/'): string {
  return new URL(path, site.url).toString();
}

/**
 * Build a WhatsApp deep link with a pre-filled message.
 * `encodeURIComponent` on the text, and the number is digits-only by
 * construction, so no caller can inject extra query parameters.
 */
export function whatsappLink(message: string): string {
  return `https://wa.me/${site.contact.whatsapp}?text=${encodeURIComponent(message.slice(0, 600))}`;
}
