import { productPricing } from '@/server/pricing/pricing';
import { availableStockMany } from '@/server/orders/inventory';
import type { Product, RenderKind } from '@/types/catalog';

/**
 * The projection a product card needs — and nothing more.
 *
 * Explicit rather than passing `Product` through: a card does not need every
 * variant, every SKU and every stock level, and serialising all of that into the
 * page would hand a scraper the whole catalogue on a listing view. It also keeps
 * the RSC payload small, which is the listing page's main cost.
 */
export interface ProductCardData {
  slug: string;
  name: string;
  family: string;
  tagline: string;
  render: RenderKind;
  colors: { id: string; hex: string; hexAccent: string; name: string; light: boolean }[];
  from: number;
  fromTransfer: number;
  instalment: number;
  instalmentCount: number;
  /** Total units available across variants. Drives the stock badge. */
  stock: number;
  /** Cheapest in-stock SKU, for quick-add. Null when nothing is available. */
  quickAddSku: string | null;
  storageOptions: number;
}

/**
 * Build the card data for several products at once.
 *
 * Availability comes from the shared store, so this is deliberately a batch
 * API: a listing page renders dozens of cards, and one lookup per variant would
 * be dozens of sequential round trips on the critical path of the page people
 * land on from Instagram. Every SKU on the page is fetched in a single call.
 */
export async function toCardDataMany(
  products: readonly Product[],
): Promise<ProductCardData[]> {
  const skus = products.flatMap((product) => product.variants.map((variant) => variant.sku));
  const availability = await availableStockMany(skus);
  return products.map((product) => toCardDataWith(product, availability));
}

export async function toCardData(product: Product): Promise<ProductCardData> {
  const [card] = await toCardDataMany([product]);
  // `toCardDataMany` returns one entry per input, so this is unreachable; the
  // throw exists because `noUncheckedIndexedAccess` is on and a silent
  // non-null assertion is how a real absence becomes a confusing crash later.
  if (!card) throw new Error('toCardData: no card produced');
  return card;
}

function toCardDataWith(
  product: Product,
  availability: ReadonlyMap<string, number>,
): ProductCardData {
  const pricing = productPricing(product);

  let stock = 0;
  let quickAddSku: string | null = null;
  let quickAddPrice = Number.POSITIVE_INFINITY;

  for (const variant of product.variants) {
    const available = availability.get(variant.sku) ?? 0;
    stock += available;
    if (available > 0 && variant.priceList < quickAddPrice) {
      quickAddPrice = variant.priceList;
      quickAddSku = variant.sku;
    }
  }

  return {
    slug: product.slug,
    name: product.name,
    family: product.family,
    tagline: product.tagline,
    render: product.render,
    colors: product.colors.map((color) => ({
      id: color.id,
      hex: color.hex,
      hexAccent: color.hexAccent,
      name: color.name,
      light: color.light ?? false,
    })),
    from: pricing.from,
    fromTransfer: pricing.fromTransfer,
    instalment: pricing.instalment,
    instalmentCount: pricing.instalmentCount,
    stock,
    quickAddSku,
    storageOptions: product.storages.length,
  };
}
