import { pesos } from '@/lib/money';
import type { ShippingZone } from '@/types/commerce';

/** ⚠️ MOCK. Shipping rates and promo codes are placeholders. See src/data/README.md. */

export interface ShippingOption {
  zone: ShippingZone;
  label: string;
  detail: string;
  /** Flat rate in centavos. Free above the threshold, except for pickup. */
  flatRate: number;
  etaDays: [number, number];
  /** Pickup collects no address, so the checkout form adapts. */
  requiresAddress: boolean;
}

export const shippingOptions: readonly ShippingOption[] = Object.freeze([
  {
    zone: 'pickup',
    label: 'Retiro en showroom',
    detail: 'Palermo, CABA. Con turno previo, mismo día.',
    flatRate: 0,
    etaDays: [0, 1],
    requiresAddress: false,
  },
  {
    zone: 'caba',
    label: 'Envío en CABA',
    detail: 'Mensajería propia, con seguimiento.',
    flatRate: pesos(12_000),
    etaDays: [1, 2],
    requiresAddress: true,
  },
  {
    zone: 'gba',
    label: 'Envío en GBA',
    detail: 'Zona norte, oeste y sur.',
    flatRate: pesos(18_000),
    etaDays: [2, 3],
    requiresAddress: true,
  },
  {
    zone: 'interior',
    label: 'Envío al interior',
    detail: 'A todo el país por transporte asegurado.',
    flatRate: pesos(26_000),
    etaDays: [3, 7],
    requiresAddress: true,
  },
]);

export interface Promo {
  code: string;
  label: string;
  percent: number;
  /** Minimum subtotal in centavos. */
  minSubtotal: number;
  /** ISO date; `null` means no expiry. */
  expiresAt: string | null;
  /** Restrict to a device family, or null for the whole catalogue. */
  family: string | null;
}

/**
 * Promo codes live server-side and are resolved by exact code. The client sends
 * a code; it never sends a percentage or an amount. One code per order.
 */
export const promos: readonly Promo[] = Object.freeze([
  {
    code: 'OWNER5',
    label: '5 % de bienvenida',
    percent: 5,
    minSubtotal: pesos(300_000),
    expiresAt: null,
    family: null,
  },
  {
    code: 'SETUP10',
    label: '10 % en accesorios',
    percent: 10,
    minSubtotal: pesos(200_000),
    expiresAt: null,
    family: 'accessories',
  },
  {
    code: 'EXPIRADO',
    label: 'Código vencido',
    percent: 20,
    minSubtotal: 0,
    /** Deliberately expired — exercises the rejection path in tests and in the UI. */
    expiresAt: '2024-01-01',
    family: null,
  },
]);
