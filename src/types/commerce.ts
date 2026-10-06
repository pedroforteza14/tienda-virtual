import type { Centavos } from '@/lib/money';
import type { Photo } from '@/types/catalog';

/** What the client is allowed to express about a cart: a SKU and a count. */
export interface CartLineInput {
  sku: string;
  qty: number;
}

/** What the server returns: every money field computed here, from the catalogue. */
export interface PricedCartLine {
  sku: string;
  qty: number;
  productSlug: string;
  productName: string;
  variantLabel: string;
  colorName: string;
  colorHex: string;
  render: string;
  /** The variant's photograph, when the catalogue has one. */
  photography?: Photo;
  unitPrice: Centavos;
  lineTotal: Centavos;
  /** Units actually available; the client shows this, it never asserts it. */
  stock: number;
  /** True when the requested qty had to be clamped to available stock. */
  adjusted: boolean;
}

/**
 * Every field is computed server-side from the catalogue. Argentine retail quotes
 * two prices for the same cart — a lower one for bank transfer and the list price
 * in interest-free instalments on card — so both are always present and the
 * customer picks, rather than one being hidden behind a payment selection.
 */
export interface CartTotals {
  /** Sum of list prices × quantities. */
  subtotal: Centavos;
  /** Promo-code discount, if any applied. */
  promoDiscount: Centavos;
  /** `subtotal - promoDiscount`. The basis for both payment prices. */
  netSubtotal: Centavos;
  /** The extra saving for paying by transfer. */
  transferDiscount: Centavos;
  shipping: Centavos;
  freeShippingApplied: boolean;
  /** Payable by card, including shipping. */
  cardTotal: Centavos;
  /** Payable by transfer, including shipping. */
  transferTotal: Centavos;
  /** The total for the currently selected payment method. */
  total: Centavos;
  /** Interest-free instalment plan on `cardTotal`. */
  instalments: { count: number; amount: Centavos } | null;
}

export interface PricedCart {
  lines: PricedCartLine[];
  totals: CartTotals;
  itemCount: number;
  /** Non-fatal notices: a clamped quantity, a dropped SKU, an invalid promo. */
  notices: string[];
  promo: { code: string; label: string; percent: number } | null;
}

export const SHIPPING_ZONES = ['caba', 'gba', 'interior', 'pickup'] as const;
export type ShippingZone = (typeof SHIPPING_ZONES)[number];

export const PAYMENT_METHODS = ['transfer', 'card'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'review',
  'cancelled',
  'expired',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderCustomer {
  name: string;
  email: string;
  phone: string;
}

export interface OrderShipping {
  zone: ShippingZone;
  street?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  notes?: string;
}

export interface Order {
  /** Internal, unguessable. Never shown to a customer. */
  id: string;
  /** Customer-facing reference: `OWN-XXXXXXXXXX`. Also unguessable. */
  reference: string;
  /**
   * Who may read this order. Derived from the signed session on the server —
   * never from a request body. See docs/threat-model.md §4.4.
   */
  ownerKey: string;
  /** Set once the order is claimed by a registered account. */
  userId: string | null;
  status: OrderStatus;
  /** Server-computed snapshot. The PSP amount is verified against this. */
  lines: PricedCartLine[];
  totals: CartTotals;
  paymentMethod: PaymentMethod;
  customer: OrderCustomer;
  shipping: OrderShipping;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  /** Audit trail. Appended to, never rewritten. */
  events: { at: string; type: string; detail?: string }[];
}

/** The shape that crosses back to the browser. Deliberately narrower than `Order`:
 *  no `ownerKey`, no `userId`, no internal `id`. */
export interface OrderDTO {
  reference: string;
  status: OrderStatus;
  lines: PricedCartLine[];
  totals: CartTotals;
  paymentMethod: PaymentMethod;
  customer: { name: string; email: string };
  shipping: OrderShipping;
  createdAt: string;
  expiresAt: string;
}
