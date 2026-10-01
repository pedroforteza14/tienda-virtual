/**
 * Hard limits. Every one of these is a security boundary as much as a product
 * decision: an unbounded quantity, body size or page size is a denial-of-service
 * or an inventory exploit waiting to be found.
 *
 * These are imported by both the Zod schemas and the server services, so the
 * number a request is validated against is literally the same number the
 * service enforces. Two copies of a limit is one copy too many.
 */

/** Per cart line. Above this, it is a reseller, not a customer — and a
 *  plausible inventory-denial attempt. */
export const MAX_QTY_PER_LINE = 5;

/** Distinct SKUs in one cart. Bounds the pricing loop and the cookie size. */
export const MAX_CART_LINES = 20;

/** Request body cap for JSON routes, in bytes. A cart or a checkout payload is
 *  measured in hundreds of bytes; 16 KiB is generous. */
export const MAX_JSON_BODY_BYTES = 16 * 1024;

/** Search. Long queries buy an attacker nothing and cost us CPU. */
export const MAX_SEARCH_QUERY_LENGTH = 64;
export const MAX_SEARCH_RESULTS = 12;

/** Catalogue pagination. */
export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 48;

/** Free-text field caps, applied before anything is stored or logged. */
export const MAX_NAME_LENGTH = 70;
export const MAX_EMAIL_LENGTH = 254; // RFC 5321 practical maximum
export const MAX_ADDRESS_LENGTH = 120;
export const MAX_NOTES_LENGTH = 400;
export const MAX_PROMO_CODE_LENGTH = 24;

/** Sessions. */
export const SESSION_COOKIE = '__Host-owner.sid';
export const CSRF_COOKIE = '__Host-owner.csrf';
export const CSRF_HEADER = 'x-csrf-token';
/** 30 days for a guest cart; a privileged session is re-checked on every request
 *  against the server-side record, which carries its own shorter expiry. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

/** Password policy. Length does the work; composition rules mostly produce
 *  `Password1!` and a reused credential. */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200; // bound the KDF's input, not the entropy

/** Rate limits: [requests, window in seconds] per key. */
export const RATE_LIMITS = {
  login: [5, 300],
  signup: [3, 600],
  passwordReset: [3, 900],
  checkout: [10, 600],
  cart: [60, 60],
  search: [40, 60],
  contact: [3, 600],
  webhook: [120, 60],
  api: [120, 60],
} as const satisfies Record<string, readonly [number, number]>;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

/** Account lockout after repeated failures for the same identity. */
export const LOGIN_MAX_FAILURES = 8;
export const LOGIN_LOCKOUT_SECONDS = 900;

/** Webhook replay window. Anything older is rejected outright. */
export const WEBHOOK_MAX_AGE_SECONDS = 300;

/** How long an unpaid order holds its stock before expiring. */
export const ORDER_PAYMENT_WINDOW_SECONDS = 60 * 30;
