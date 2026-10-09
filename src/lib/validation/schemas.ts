import { z } from 'zod';
import {
  MAX_ADDRESS_LENGTH,
  MAX_CART_LINES,
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_PAGE_SIZE,
  MAX_PASSWORD_LENGTH,
  MAX_PROMO_CODE_LENGTH,
  MAX_QTY_PER_LINE,
  MAX_SEARCH_QUERY_LENGTH,
  MIN_PASSWORD_LENGTH,
} from '@/config/constants';
import { DEVICE_FAMILIES, USE_CASES } from '@/types/catalog';
import { PAYMENT_METHODS, SHIPPING_ZONES } from '@/types/commerce';

/**
 * The single validation boundary. Every byte that crosses from the browser into
 * the server is parsed by a schema in this file — and the *same* schema is used
 * by the client for inline feedback, so the two can never drift.
 *
 * Two properties matter more than the individual rules:
 *
 *  1. **Everything is `.strict()`.** An unknown key is a 400, not a silently
 *     ignored field. This is the control that defeats price manipulation: a
 *     request carrying `price` does not get its price ignored, it gets rejected,
 *     which is both safer and far easier to detect. docs/threat-model.md §4.1.
 *  2. **Everything is bounded.** Every string has a max length, every array a
 *     max size, every number a range. An unbounded field is a DoS primitive.
 *
 * Client-side validation is a convenience. The server re-parses, always.
 */

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

/** Matches the SKUs our catalogue builder produces, and nothing else. */
export const SkuSchema = z
  .string()
  .trim()
  .min(5)
  .max(64)
  .regex(/^OWN-[A-Z0-9]+(?:-[A-Z0-9]+)*$/, 'Código de producto inválido');

export const SlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Identificador inválido');

export const QtySchema = z
  .number({ invalid_type_error: 'La cantidad debe ser un número' })
  .int('La cantidad debe ser un número entero')
  .min(1, 'La cantidad mínima es 1')
  .max(MAX_QTY_PER_LINE, `Máximo ${MAX_QTY_PER_LINE} unidades por producto`);

/**
 * Names: letters (including accents and ñ), spaces, apostrophes and hyphens.
 * The allow-list matters more than the length — it structurally excludes `<`,
 * `>`, `&` and quotes, so even if this value were ever interpolated somewhere
 * unsafe it could not open a tag.
 */
export const PersonNameSchema = z
  .string()
  .trim()
  .min(2, 'Ingresá tu nombre')
  .max(MAX_NAME_LENGTH, `Máximo ${MAX_NAME_LENGTH} caracteres`)
  .regex(/^[\p{L}\p{M}][\p{L}\p{M}\s'’-]*$/u, 'El nombre solo puede contener letras');

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, 'Ingresá tu email')
  .max(MAX_EMAIL_LENGTH)
  .email('Revisá el formato del email');

/**
 * Argentine phone, normalised to the ten digits that can actually be dialled.
 *
 * The field used to ask for the number "sin el 0 ni el 15", and plenty of
 * people typed it with both anyway — that is what their own phone shows them.
 * Accepting the digits as typed stored numbers nobody could call, which for a
 * shop whose whole support channel is WhatsApp is a lost sale rather than a
 * validation nicety. The prefixes are stripped here instead of being refused,
 * and the hint no longer states a rule the customer does not have to follow:
 *
 *   `011 15 4567-8900` · `+54 9 11 4567 8900` · `11 4567-8900` → `1145678900`
 *
 * An Argentine national number is always exactly ten digits (2–4 of área code
 * plus the rest), which is what makes the stripping safe to do: every rule below
 * only fires on a length that is already wrong without it, and the final check
 * is exact rather than a range. The old one accepted 8 to 15 digits, which is
 * how `01145678900` — eleven digits, uncallable — passed.
 */
function toNationalDigits(value: string): string {
  let digits = value.replace(/[\s()+.\-/]/g, '');

  // International prefix, then the country code, then the mobile `9`: a number
  // copied out of a contact card arrives as `+54 9 11 ...`.
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('54') && digits.length > 10) digits = digits.slice(2);
  if (digits.startsWith('9') && digits.length === 11) digits = digits.slice(1);

  // Long-distance `0`, as it is printed on every bill.
  if (digits.startsWith('0')) digits = digits.slice(1);

  // The mobile `15`, which sits after the área code — 2, 3 or 4 digits in. It
  // is only ever removed from a twelve-digit number, because that is exactly
  // ten digits plus this prefix; a correct number never reaches this branch.
  if (digits.length === 12) {
    for (const at of [2, 3, 4]) {
      if (digits.slice(at, at + 2) === '15') {
        digits = digits.slice(0, at) + digits.slice(at + 2);
        break;
      }
    }
  }

  return digits;
}

export const PhoneSchema = z
  .string()
  .trim()
  .min(8, 'Ingresá tu teléfono')
  .max(25)
  .transform(toNationalDigits)
  .refine(
    (digits) => /^\d{10}$/.test(digits),
    'Ingresá los 10 dígitos con la característica. Por ejemplo: 11 4567-8900.',
  );

/** CPA (`C1425DKE`) or the legacy 4-digit code. */
export const PostalCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^(?:\d{4}|[A-Z]\d{4}[A-Z]{3})$/, 'Código postal inválido (ej. 1425 o C1425DKE)');

const FreeTextSchema = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    // No angle brackets anywhere in free text. React escapes output already;
    // this is the second layer, so a future `innerHTML` bug is not instantly
    // exploitable. See docs/threat-model.md §4.5.
    .refine((value) => !/[<>]/.test(value), `${label} contiene caracteres no permitidos`);

export const AddressLineSchema = FreeTextSchema(MAX_ADDRESS_LENGTH, 'La dirección')
  .pipe(z.string().min(5, 'Ingresá la calle y el número'));

export const NotesSchema = FreeTextSchema(MAX_NOTES_LENGTH, 'La nota').optional();

export const PromoCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(3)
  .max(MAX_PROMO_CODE_LENGTH)
  .regex(/^[A-Z0-9]+$/, 'Código inválido');

/* -------------------------------------------------------------------------- */
/* Cart                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * ⚠️ The most security-sensitive schema in the codebase.
 *
 * A cart line is **exactly** a SKU and a quantity. `.strict()` means a request
 * body of `{ sku, qty, price: 1 }` is a 400. There is deliberately no `price`,
 * `total`, `discount` or `stock` field — not optional, not ignored: absent.
 */
export const CartLineInputSchema = z
  .object({
    sku: SkuSchema,
    qty: QtySchema,
  })
  .strict();

export const CartAddSchema = CartLineInputSchema;

export const CartUpdateSchema = z
  .object({
    sku: SkuSchema,
    /** 0 removes the line. */
    qty: z.number().int().min(0).max(MAX_QTY_PER_LINE),
  })
  .strict();

export const CartRemoveSchema = z.object({ sku: SkuSchema }).strict();

export const CartPromoSchema = z
  .object({ code: PromoCodeSchema.nullable() })
  .strict();

/** The serialised cart cookie. Bounded so a crafted cookie cannot blow up pricing. */
export const CartCookieSchema = z
  .object({
    v: z.literal(1),
    l: z.array(z.tuple([SkuSchema, z.number().int().min(1).max(MAX_QTY_PER_LINE)])).max(MAX_CART_LINES),
    p: PromoCodeSchema.nullable().optional(),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/* Catalogue & search                                                         */
/* -------------------------------------------------------------------------- */

export const SearchQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .max(MAX_SEARCH_QUERY_LENGTH, 'Búsqueda demasiado larga')
      .default(''),
  })
  .strict();

export const SORT_OPTIONS = ['recommended', 'price-asc', 'price-desc', 'newest'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const AVAILABILITY_OPTIONS = ['any', 'in-stock'] as const;

/**
 * Catalogue filters, parsed from the URL. Coerced because query strings are
 * always strings, and `.catch()`-free: a malformed filter is a 400 rather than a
 * silent fallback, so a broken link is visible instead of quietly wrong.
 */
export const CatalogQuerySchema = z
  .object({
    family: z.enum(DEVICE_FAMILIES).optional(),
    color: z.string().trim().max(24).regex(/^[a-z]{2,8}$/).optional(),
    storage: z.string().trim().max(12).regex(/^[0-9]{2,4}(gb|tb)$/i).optional(),
    minPrice: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
    maxPrice: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
    availability: z.enum(AVAILABILITY_OPTIONS).default('any'),
    sort: z.enum(SORT_OPTIONS).default('recommended'),
    page: z.coerce.number().int().min(1).max(200).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(12),
    useCase: z.enum(USE_CASES).optional(),
  })
  .strict()
  .refine((v) => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice, {
    message: 'El precio mínimo no puede ser mayor al máximo',
    path: ['minPrice'],
  });

export const DiscoveryAnswersSchema = z
  .object({
    useCase: z.enum(USE_CASES),
    budget: z.enum(['entry', 'mid', 'premium', 'any']).default('any'),
    families: z.array(z.enum(DEVICE_FAMILIES)).max(6).default([]),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/* Checkout                                                                   */
/* -------------------------------------------------------------------------- */

export const CustomerSchema = z
  .object({
    name: PersonNameSchema,
    email: EmailSchema,
    phone: PhoneSchema,
  })
  .strict();

/**
 * Shipping. A home delivery requires an address; a showroom pickup must not
 * collect one — the least data we can legally fulfil with. `superRefine` makes
 * that conditional explicit rather than leaving every field optional, which
 * would let an empty address through for a delivery.
 */
export const ShippingSchema = z
  .object({
    zone: z.enum(SHIPPING_ZONES),
    street: AddressLineSchema.optional(),
    city: FreeTextSchema(60, 'La ciudad').optional(),
    province: FreeTextSchema(60, 'La provincia').optional(),
    postalCode: PostalCodeSchema.optional(),
    notes: NotesSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.zone === 'pickup') return;
    for (const field of ['street', 'city', 'province', 'postalCode'] as const) {
      if (!value[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: 'Requerido para envío a domicilio',
        });
      }
    }
  });

/**
 * ⚠️ Note what is NOT here: no amount, no total, no shipping cost, no line
 * prices, and no card number. The server reads the cart from the signed session
 * cookie and prices it itself. The client cannot express a price.
 */
export const CheckoutSchema = z
  .object({
    customer: CustomerSchema,
    shipping: ShippingSchema,
    paymentMethod: z.enum(PAYMENT_METHODS),
    promoCode: PromoCodeSchema.nullable().optional(),
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: 'Tenés que aceptar los términos para continuar' }),
    }),
  })
  .strict();

/**
 * `OWN-` + 10 Crockford base32 characters (no I, L, O or U). Validated before it
 * is ever used as a lookup key. Must stay in sync with `ALPHABET` in
 * `src/server/orders/order-repository.ts`.
 */
export const OrderReferenceSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^OWN-[0-9A-HJKMNP-TV-Z]{10}$/, 'Referencia de pedido inválida');

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Length over composition. Mandatory symbol-and-digit rules reliably produce
 * `Password1!` and a credential reused from another breached site; a 10-char
 * minimum plus a block-list of the obvious buys more real entropy.
 */
export const PasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Mínimo ${MIN_PASSWORD_LENGTH} caracteres`)
  .max(MAX_PASSWORD_LENGTH, 'Contraseña demasiado larga')
  .refine(
    (value) =>
      !/^(?:password|contrasena|contraseña|12345678|qwertyuiop|iloveyou|ownerstore)/i.test(value),
    'Elegí una contraseña menos común',
  );

export const SignupSchema = z
  .object({
    name: PersonNameSchema,
    email: EmailSchema,
    password: PasswordSchema,
  })
  .strict();

export const LoginSchema = z
  .object({
    email: EmailSchema,
    /** Not `PasswordSchema`: policy applies at signup. Rejecting a short password
     *  at login would leak that the stored one is longer. */
    password: z.string().min(1, 'Ingresá tu contraseña').max(MAX_PASSWORD_LENGTH),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/* Contact                                                                    */
/* -------------------------------------------------------------------------- */

export const ContactSchema = z
  .object({
    name: PersonNameSchema,
    email: EmailSchema,
    message: FreeTextSchema(MAX_NOTES_LENGTH, 'El mensaje').pipe(
      z.string().min(10, 'Contanos un poco más'),
    ),
    /** Honeypot: a real user never fills a hidden field; a bot fills everything. */
    _hp: z.string().max(0).optional(),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/* Error shaping                                                              */
/* -------------------------------------------------------------------------- */

export type FieldErrors = Record<string, string>;

/**
 * Map a Zod failure to flat, human, per-field messages.
 *
 * Deliberately lossy: raw Zod issues describe the schema (union branches,
 * discriminators, internal paths), and handing that to a client is free
 * reconnaissance. The full issue list is logged server-side instead.
 */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_form';
    out[key] ??= issue.message;
  }
  return out;
}
