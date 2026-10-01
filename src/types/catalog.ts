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
] as const;
export type RenderKind = (typeof RENDER_KINDS)[number];

/** What a buyer is actually trying to do. Drives /descubri. */
export const USE_CASES = ['work', 'creative', 'everyday', 'travel', 'entertainment'] as const;
export type UseCase = (typeof USE_CASES)[number];

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
  /** Real photography, when it exists. Falls back to the procedural render. */
  photography?: { src: string; alt: string; width: number; height: number };
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
