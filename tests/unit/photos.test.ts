import { describe, expect, it } from 'vitest';
import { photoFor, photoPath } from '@/lib/photos';
import { products } from '@/data/catalog';
import type { Photo } from '@/types/catalog';

const hero: Photo = { src: '/products/x.webp', alt: 'hero', width: 1600, height: 1600 };
const variantShot: Photo = { src: '/products/x--blk.webp', alt: 'negro', width: 1600, height: 1600 };

/**
 * Photography precedence.
 *
 * The rule is small enough to look obvious and is exactly the kind of thing that
 * silently inverts during a refactor — at which point every configurator shows
 * the same picture whatever colour you pick, and nobody notices until a customer
 * receives the wrong finish.
 */
describe('photoFor', () => {
  it('prefers the variant shot over the product hero', () => {
    expect(photoFor({ photography: hero }, { photography: variantShot })).toBe(variantShot);
  });

  it('falls back to the product hero when the variant has none', () => {
    expect(photoFor({ photography: hero }, {})).toBe(hero);
    expect(photoFor({ photography: hero }, undefined)).toBe(hero);
  });

  it('returns undefined when there is no photography at all', () => {
    // Undefined, never a placeholder: the caller draws the procedural render,
    // which is the design rather than a stand-in for a missing file.
    expect(photoFor({}, {})).toBeUndefined();
    expect(photoFor(undefined, undefined)).toBeUndefined();
  });
});

describe('photoPath', () => {
  it('builds the documented filenames', () => {
    expect(photoPath('iphone-17-pro-max')).toBe('/products/iphone-17-pro-max.webp');
    expect(photoPath('iphone-17-pro-max', 'nat')).toBe('/products/iphone-17-pro-max--nat.webp');
  });
});

/**
 * The catalogue ships with no photography, and that is a fact worth asserting
 * rather than assuming: if a photograph is ever added, `next/image` needs its
 * intrinsic size to reserve the box, and a missing dimension is how a page that
 * measures CLS 0.0000 starts shifting.
 */
describe('catalogue photography', () => {
  it('gives every declared photo a source, alt text and real dimensions', () => {
    const photos: Photo[] = [];
    for (const product of products) {
      if (product.photography) photos.push(product.photography);
      for (const variant of product.variants) {
        if (variant.photography) photos.push(variant.photography);
      }
    }

    for (const photo of photos) {
      expect(photo.src.length, photo.src).toBeGreaterThan(0);
      expect(photo.alt.trim().length, `alt for ${photo.src}`).toBeGreaterThan(0);
      expect(photo.width, `width for ${photo.src}`).toBeGreaterThan(0);
      expect(photo.height, `height for ${photo.src}`).toBeGreaterThan(0);
    }
  });
});
