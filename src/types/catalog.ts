import type { Centavos } from '@/lib/money';

export const DEVICE_FAMILIES = ['iphone', 'mac', 'ipad', 'watch', 'airpods', 'accessories'] as const;
export type DeviceFamily = (typeof DEVICE_FAMILIES)[number];

/** Which procedural SVG render to draw. See src/components/product/ProductRender.tsx. */
export const RENDER_KINDS = [
  'phone',
  'phone-pro',
  'laptop',
  'desktop',
  'compact',
  'tablet',
  'watch',
  'earbuds',
  'case',
  'puck',
  'stylus',
  'headphones',
  'display',
  'speaker',
  'keyboard',
] as const;
export type RenderKind = (typeof RENDER_KINDS)[number];

/** What a buyer is actually trying to do. Drives /descubri. */
export const USE_CASES = ['work', 'creative', 'everyday', 'travel', 'entertainment'] as const;
export type UseCase = (typeof USE_CASES)[number];

/**
 * A product photograph.
 *
 * `width` and `height` are the file's intrinsic pixel size and are **required**:
 * `next/image` reserves the box from that ratio before the bytes arrive, and
 * without it the image pops in and pushes the page around. This storefront
 * measures a cumulative layout shift of 0.0009 and the number was expensive to
 * get; a photo without dimensions is how it would be lost.
 */
export interface Photo {
  /** Path under `public/`, or an absolute URL on an allow-listed host. */
  src: string;
  /** Spanish, describing the object — never "foto de producto". */
  alt: string;
  width: number;
  height: number;
}

export interface Colorway {
  id: string;
  /** Spanish, as the customer sees it. */
  name: string;
  /** Body colour of the render. */
  hex: string;
  /** Secondary surface (camera plateau, band, hinge) — adds believable depth. */
  hexAccent: string;
  /** True for light bodies, so the render flips its internal shadow direction. */
  light?: boolean;
}

export interface Spec {
  /** `01`, `02` … rendered as a decorative numeral on the spec rail. */
  index: string;
  label: string;
  value: string;
}

export interface Variant {
  /** Stable, human-readable, and the ONLY product identifier a client may send. */
  sku: string;
  colorId: string;
  /** `256 GB`, `1 TB`. Absent for products without storage tiers. */
  storage?: string;
  /** `42 mm` / `46 mm` for Watch; case size rather than storage. */
  size?: string;
  /** List price. Server-authoritative — see docs/threat-model.md §4.1. */
  priceList: Centavos;
  /** Units on hand. Display-only on the client; re-read server-side at checkout. */
  stock: number;
  /**
   * Photography for this exact variant — this colour, this capacity.
   *
   * Optional, and falls back to the product's shot, then to the procedural
   * render. Colour is the one attribute a buyer checks against a picture, so a
   * per-colour image is worth having; a per-capacity one almost never is.
   */
  photography?: Photo;
}

export interface Product {
  slug: string;
  name: string;
  family: DeviceFamily;
  /** One editorial line. Display copy — English or Spanish, never both. */
  tagline: string;
  /** Two sentences, Spanish, commercial. */
  summary: string;
  render: RenderKind;
  /**
   * The product's hero shot, used wherever no particular variant is on screen:
   * listing cards, search results, the home rail. A variant's own photography
   * overrides it. Absent on every product today — see `src/data/README.md` on
   * where the files go — and the procedural render stands in until it is not.
   */
  photography?: Photo;
  colors: Colorway[];
  /** Ordered storage tiers; empty for products without them. */
  storages: string[];
  sizes: string[];
  variants: Variant[];
  specs: Spec[];
  /** Three short selling points, Spanish. */
  highlights: string[];
  useCases: UseCase[];
  /** Sort key for "novedades". ISO date. */
  releasedAt: string;
  /** Editorial weight for "recomendado" ordering. Higher first. */
  rank: number;
  featured: boolean;
  seo: { title: string; description: string };
  /** SKUs offered as "complete your setup". Resolved server-side. */
  pairsWith: string[];
}

export interface Category {
  slug: DeviceFamily;
  name: string;
  /** Display label for the mega-menu and hero. */
  display: string;
  blurb: string;
  render: RenderKind;
}
