import type { Photo, Product, Variant } from '@/types/catalog';

/**
 * Which photograph to draw, if any.
 *
 * One function so the precedence lives in a single place: the variant's own
 * shot, then the product's hero shot, then nothing — and "nothing" means the
 * caller draws the procedural render instead. Every surface that can show a
 * photo goes through here, so adding photography to the data is the whole job;
 * no component has to be edited for a picture to appear.
 *
 * Returning `undefined` rather than a placeholder image is deliberate. A grey
 * "image missing" box is worse than the render it replaced: the renders are the
 * design, not a stand-in, and a half-photographed catalogue should degrade to a
 * consistent drawing rather than to a checkerboard.
 */
export function photoFor(
  product: Pick<Product, 'photography'> | undefined,
  variant?: Pick<Variant, 'photography'> | undefined,
): Photo | undefined {
  return variant?.photography ?? product?.photography;
}

/**
 * The expected filename for a product photograph.
 *
 * A convention rather than a requirement — `src` can be anything — but it keeps
 * a few hundred files sorted, and makes it obvious which ones are missing when
 * the folder is listed next to the catalogue.
 *
 *   public/products/iphone-17-pro-max.webp          ← product hero
 *   public/products/iphone-17-pro-max--nat.webp     ← the Natural Titanium one
 */
export function photoPath(slug: string, colorId?: string): string {
  return `/products/${slug}${colorId ? `--${colorId}` : ''}.webp`;
}
