import type { Metadata } from 'next';
import { site } from '@/config/site';
import { catalog } from '@/server/catalog/repository';
import { productPricing } from '@/server/pricing/pricing';
import { toCardDataMany } from '@/features/products/card-data';
import { Hero, type HeroProduct } from '@/features/home/Hero';
import { ProductRail, type RailPanel } from '@/features/home/ProductRail';
import { FeaturedEditorial } from '@/features/home/FeaturedEditorial';
import { DiscoveryTeaser } from '@/features/home/DiscoveryTeaser';
import { SeenInTheWild } from '@/features/home/SeenInTheWild';
import { Trust } from '@/features/home/Trust';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildMetadata({
  title: `${site.name} — ${site.tagline}`,
  description: site.description,
  path: '/',
});

/**
 * The home page.
 *
 * ENTRA → DESCUBRE → EXPLORA → INTERACTÚA → ENCUENTRA, in that order, as the
 * brief's arc requires:
 *
 *   Hero             the object arrives through the aperture
 *   ProductRail      object → detail → specification → hand-off (pinned)
 *   FeaturedEditorial  hierarchy, not a grid
 *   DiscoveryTeaser  the door for people who do not know what they want
 *   SeenInTheWild    social proof as editorial
 *   Trust            terms given the weight of specifications
 *
 * This is a **static** page: all data comes from the catalogue at build time, and
 * the cart is fetched client-side, so there is no `cookies()` call to opt it out
 * of static rendering. Only the four narrative components are client components;
 * everything else is server-rendered HTML.
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
 */
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const repo = catalog();

  // The lead is the highest-ranked featured product, so editorial weight follows
  // merchandising rank rather than being hardcoded here.
  const featured = repo
    .listProducts()
    .filter((product) => product.featured)
    .sort((a, b) => b.rank - a.rank);

  const heroSource = featured[0] ?? repo.listProducts()[0]!;
  const heroPricing = productPricing(heroSource);
  const heroColor = heroSource.colors[0]!;

  const hero: HeroProduct = {
    slug: heroSource.slug,
    name: heroSource.name,
    render: heroSource.render,
    color: {
      hex: heroColor.hex,
      hexAccent: heroColor.hexAccent,
      name: heroColor.name,
      light: heroColor.light ?? false,
    },
    fromTransfer: heroPricing.fromTransfer,
    instalment: heroPricing.instalment,
    instalmentCount: heroPricing.instalmentCount,
  };

  const panels = buildRailPanels();
  const featuredCards = await toCardDataMany(featured.slice(0, 4));

  return (
    <>
      <Hero product={hero} />
      <ProductRail panels={panels} />
      <FeaturedEditorial products={featuredCards} />
      <DiscoveryTeaser />
      <SeenInTheWild />
      <Trust />
    </>
  );
}

/**
 * The narrative: one object examined, then handed off to another product.
 *
 * Panel 2 is the "zoom" — the same render scaled past the stage so the camera
 * plateau fills the frame. Dyson's lesson from the reference analysis: showing the
 * inside (or the detail) of an object is the most persuasive thing you can do to it.
 */
function buildRailPanels(): RailPanel[] {
  const repo = catalog();

  const phone = repo.getProductBySlug('iphone-17-pro');
  const mac = repo.getProductBySlug('macbook-pro-14-m5');

  const panels: RailPanel[] = [];

  if (phone) {
    const color = phone.colors[1] ?? phone.colors[0]!;
    const resolved = {
      hex: color.hex,
      hexAccent: color.hexAccent,
      name: color.name,
      light: color.light ?? false,
    };

    panels.push(
      {
        id: 'object',
        eyebrow: 'El objeto',
        title: 'Titanio, no plástico.',
        accent: 'Titanio',
        body:
          'Un cuerpo mecanizado en una sola pieza, con los bordes pulidos a mano. Se nota en la ' +
          'mano antes de que enciendas la pantalla.',
        render: phone.render,
        color: resolved,
      },
      {
        id: 'detail',
        eyebrow: 'El detalle',
        title: 'Tres lentes, una decisión.',
        body:
          'El módulo de cámaras no es un agregado: define el chasis. 48 MP en gran angular, ' +
          'ultra gran angular y teleobjetivo 4x, alineados en la meseta de aluminio.',
        render: phone.render,
        color: resolved,
        // Deliberately overscaled so the stage crops into the camera plateau.
        zoom: 2.6,
      },
      {
        id: 'spec',
        eyebrow: 'La ficha',
        title: 'Lo que importa, medido.',
        body: 'Sin adjetivos. Los números del equipo, como vienen de fábrica.',
        render: phone.render,
        color: resolved,
        specs: phone.specs.slice(0, 4),
        price: productPricing(phone).fromTransfer,
        cta: { href: `/producto/${phone.slug}`, label: `Configurar el ${phone.name}` },
      },
    );
  }

  if (mac) {
    const color = mac.colors[0]!;
    panels.push({
      id: 'handoff',
      eyebrow: 'Y sigue',
      title: 'El teléfono es el principio.',
      accent: 'principio',
      body:
        'El mismo criterio se aplica al resto: Mac, iPad, Watch y AirPods, elegidos uno por uno ' +
        'y con el mismo respaldo.',
      render: mac.render,
      color: {
        hex: color.hex,
        hexAccent: color.hexAccent,
        name: color.name,
        light: color.light ?? false,
      },
      price: productPricing(mac).fromTransfer,
      cta: { href: '/tienda', label: 'Ver todo el catálogo' },
    });
  }

  return panels;
}
