import { productPricing } from '@/server/pricing/pricing';
import { availableStock } from '@/server/orders/inventory';
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

export function toCardData(product: Product): ProductCardData {
  const pricing = productPricing(product);

  let stock = 0;
  let quickAddSku: string | null = null;
  let quickAddPrice = Number.POSITIVE_INFINITY;

  for (const variant of product.variants) {
    const available = availableStock(variant.sku);
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
