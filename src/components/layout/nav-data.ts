import { catalog, productInStock } from '@/server/catalog/repository';
import { productPricing } from '@/server/pricing/pricing';
import type { DeviceFamily, Photo, RenderKind } from '@/types/catalog';

/**
 * Navigation data, built on the server.
 *
 * The mega-menu needs prices and stock, which only the server may originate. So
 * it is computed here and passed to the client shell as props — rather than the
 * client fetching the catalogue, which would both ship merchandising data to the
 * browser and add a request to every page load.
 */

export interface NavProduct {
  slug: string;
  name: string;
  tagline: string;
  render: RenderKind;
  photography?: Photo;
  color: { hex: string; hexAccent: string; name: string; light: boolean };
  fromTransfer: number;
  inStock: boolean;
}

export interface NavCategory {
  slug: DeviceFamily;
  name: string;
  display: string;
  blurb: string;
  render: RenderKind;
  photography?: Photo;
  color: { hex: string; hexAccent: string; name: string; light: boolean };
  fromTransfer: number;
  count: number;
}

export interface NavData {
  categories: NavCategory[];
  featured: NavProduct[];
}

function colorOf(product: { colors: { hex: string; hexAccent: string; name: string; light?: boolean }[] }) {
  const first = product.colors[0];
  return {
    hex: first?.hex ?? '#888888',
    hexAccent: first?.hexAccent ?? '#999999',
    name: first?.name ?? '',
    light: first?.light ?? false,
  };
}

export function buildNavData(): NavData {
  const repo = catalog();
  const all = repo.listProducts();

  const categories: NavCategory[] = repo.listCategories().map((category) => {
    const members = all.filter((product) => product.family === category.slug);
    const cheapest = members.reduce<number | null>((lowest, product) => {
      const { fromTransfer } = productPricing(product);
      return lowest === null || fromTransfer < lowest ? fromTransfer : lowest;
    }, null);
    // Use the highest-ranked member's colourway, so the menu shows the device
    // people are most likely looking for in its signature finish.
    const hero = [...members].sort((a, b) => b.rank - a.rank)[0];

    return {
      slug: category.slug,
      name: category.name,
      display: category.display,
      blurb: category.blurb,
      render: hero?.render ?? category.render,
      ...(hero?.photography ? { photography: hero.photography } : {}),
      color: hero ? colorOf(hero) : { hex: '#8a8a8a', hexAccent: '#9a9a9a', name: '', light: true },
      fromTransfer: cheapest ?? 0,
      count: members.length,
    };
  });

  const featured: NavProduct[] = all
    .filter((product) => product.featured)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 3)
    .map((product) => ({
      slug: product.slug,
      name: product.name,
      tagline: product.tagline,
      render: product.render,
      ...(product.photography ? { photography: product.photography } : {}),
      color: colorOf(product),
      fromTransfer: productPricing(product).fromTransfer,
      inStock: productInStock(product),
    }));

  return { categories, featured };
}
