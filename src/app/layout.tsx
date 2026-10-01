import type { Metadata, Viewport } from 'next';
import { Archivo, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import { site } from '@/config/site';
import { JsonLd } from '@/lib/seo/json-ld';
import { organizationSchema, webSiteSchema } from '@/lib/seo/schema';
import { CommerceProvider } from '@/features/cart/CommerceProvider';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { MobileNav } from '@/components/layout/MobileNav';
import { CartDrawer } from '@/features/cart/CartDrawer';
import { SearchOverlay } from '@/features/search/SearchOverlay';
import { ToastRegion } from '@/components/ui/ToastRegion';
import { Cursor } from '@/components/motion/Cursor';
import '@/styles/globals.css';

/**
 * Fonts are self-hosted at build time by `next/font`.
 *
 * Two consequences worth stating: there is no runtime request to
 * `fonts.googleapis.com`, which removes a third-party dependency from the
 * critical path *and* means our CSP needs no external font origin; and the
 * generated `@font-face` carries `size-adjust`, so the fallback and the real face
 * occupy the same space and swapping causes no layout shift.
 *
 * `wdth` is requested explicitly on Archivo: the width axis is the single most
 * distinctive thing in the type system (docs/creative-direction.md §5), and
 * without it the display face is just another grotesque.
 */
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--font-archivo',
  // Preloaded: it paints the hero.
  preload: true,
});

const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-instrument',
  // Used for one word per section, below the fold more often than not.
  preload: false,
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
  // Every price is set in it, so it is above the fold on every commerce page.
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  authors: [{ name: site.name }],
  creator: site.name,
  publisher: site.name,
  formatDetection: { telephone: false, address: false, email: false },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    siteName: site.name,
    url: site.url,
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true, 'max-image-preview': 'large' },
  category: 'shopping',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never block zoom. Capping it is an accessibility failure, and it is the most
  // common one on a "premium" site.
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0c' },
    { media: '(prefers-color-scheme: light)', color: '#0b0b0c' },
  ],
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es-AR"
      className={`${archivo.variable} ${instrument.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-surface text-fg antialiased">
        {/* The first focusable element on every page. */}
        <a href="#main" className="skip-link">
          Saltar al contenido
        </a>

        <CommerceProvider>
          <Header />

          {/* `pb-20 md:pb-0` leaves room for the mobile bottom nav. */}
          <main id="main" className="pb-20 md:pb-0">
            {children}
          </main>

          <Footer />

          {/* Overlays are portalled, so their position in the tree is irrelevant —
              but they are mounted once, here, so there is only ever one of each. */}
          <CartDrawer />
          <SearchOverlay />
          <MobileNav />
          <ToastRegion />
          <Cursor />
        </CommerceProvider>

        <JsonLd data={organizationSchema()} id="ld-organization" />
        <JsonLd data={webSiteSchema()} id="ld-website" />
      </body>
    </html>
  );
}
