import { env } from '@/config/env';

/**
 * Cookie naming and attributes in one place.
 *
 * The `__Host-` prefix is a real control: a browser will only accept such a
 * cookie if it is `Secure`, `Path=/` and has **no** `Domain`, which makes it
 * impossible for a sibling subdomain (or an attacker who gets one) to overwrite
 * our session cookie. We want it in production.
 *
 * It cannot be used over plain `http`, so development and the e2e suite — which
 * run on `http://127.0.0.1` — use the unprefixed name. Same attributes
 * otherwise; only the name and `secure` differ.
 */

const BASE_NAMES = {
  session: 'owner.sid',
  cart: 'owner.cart',
  csrf: 'owner.csrf',
} as const;

export type CookieKind = keyof typeof BASE_NAMES;

export function cookieName(kind: CookieKind): string {
  const base = BASE_NAMES[kind];
  return env().isProduction ? `__Host-${base}` : base;
}

export interface CookieAttributes {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  maxAge: number;
}

export function cookieAttributes(
  kind: CookieKind,
  maxAge: number,
): CookieAttributes {
  return {
    // The CSRF cookie is the one value client JS must read, for the
    // double-submit header. Everything else is HttpOnly.
    httpOnly: kind !== 'csrf',
    secure: env().isProduction,
    // `lax` keeps the session usable on a top-level navigation from Instagram,
    // which is where our traffic comes from. `strict` would log those visitors
    // out of their own cart on arrival. CSRF is handled separately and in depth
    // — see docs/threat-model.md §4.9.
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}
